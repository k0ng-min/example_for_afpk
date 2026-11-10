// 미래 시뮬레이션: ① 핵심 결론(선택 시나리오 vs 기준안) → ② 시나리오 비교(경로·비교표) → ③ 상세 근거(탭).
// 모든 수치는 Rust 계산 엔진(/api/scenarios/compare) 결과이며, 미래 결과는 가정에 따른 시뮬레이션이다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useApp, useCurrentClient } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { errorText } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { Client, EventKind, FutureEvent, ProjectionSummary, Scenario } from '@/types/api'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, HelpTip, Input, NumberField, Panel, Segmented, Skeleton, Slider, SourceBadge, selectClass } from '@/components/ui'
import { AssetsLiabilities, CompareBars, GoalTimeline, LinesChart, SERIES, rowsTable } from '@/components/charts'
import { CashflowCalendar, FlowComposition, SpendingMix } from '@/components/charts/insight'
import { WarningList } from '@/components/financial'
import { cn, manwon, pct, signed, won } from '@/utils/format'

const EVENT_LABEL: Record<EventKind, string> = {
  income_change: '월 소득 변화',
  expense_change: '월 지출 변화',
  one_time_inflow: '일회성 유입',
  one_time_outflow: '일회성 유출',
}

type Metric = 'netWorth' | 'cash'
type Ghost = { scenarioId: string; netWorth: number[]; cash: number[] }
type Detail = 'flow' | 'calendar' | 'assets' | 'goals' | 'warnings'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3.5 border-t border-[var(--hair)] pt-4 first:border-0 first:pt-0">
      <legend className="mb-1 text-[12px] text-dim">{title}</legend>
      {children}
    </fieldset>
  )
}

/** 1순위(우선순위 숫자가 가장 작은) 목표의 달성 월 */
const primaryGoal = (s: ProjectionSummary) => [...s.goals].sort((a, b) => a.priority - b.priority)[0]

/** 선택 시나리오가 기준안과 다른 가정을 짧은 문장 목록으로 */
function assumptionChips(sc: Scenario, base: Scenario | undefined, client: Client): string[] {
  const out: string[] = []
  const won0 = (v: number) => (v === 0 ? null : signed(v))
  const diff = (label: string, v: number, b = 0) => {
    const d = won0(v - b)
    if (d) out.push(`${label} ${d}`)
  }
  diff('월 소득', sc.incomeChange, base?.incomeChange)
  diff('고정지출', sc.fixedExpenseChange, base?.fixedExpenseChange)
  diff('변동지출', sc.variableExpenseChange, base?.variableExpenseChange)
  if (sc.familySupportOverride != null && sc.familySupportOverride !== client.familySupport) out.push(`가족 지원 ${manwon(client.familySupport)} → ${manwon(sc.familySupportOverride)}`)
  if (sc.extraDebtPayment) out.push(`추가 상환 월 ${manwon(sc.extraDebtPayment)}`)
  if (sc.monthlyInvestment) out.push(`투자 월 ${manwon(sc.monthlyInvestment)} · 기대수익률 ${pct(sc.investmentReturnBps)}(가정)`)
  if (client.business && sc.businessRevenueChangeBps) out.push(`매출 ${sc.businessRevenueChangeBps > 0 ? '+' : ''}${(sc.businessRevenueChangeBps / 100).toFixed(0)}%`)
  if (client.business && !sc.householdBackstop) out.push('사업 부족분 가계 지원 차단')
  if (sc.events.length) out.push(`미래 이벤트 ${sc.events.length}건`)
  out.push(`기간 ${sc.horizonMonths}개월`)
  return out
}

type Better = 'up' | 'down'
/** 기준안 대비 차이 표기. 0이면 "기준과 같음"으로 써서 절댓값 0과 혼동하지 않게 한다. */
function DeltaText({ v, unit, better, className }: { v: number | null | undefined; unit: 'won' | 'month'; better: Better; className?: string }) {
  if (v == null) return <span className={cn('text-dim', className)}>비교 불가</span>
  if (v === 0) return <span className={cn('text-dim', className)}>기준과 같음</span>
  const good = better === 'up' ? v > 0 : v < 0
  const text = unit === 'won' ? signed(v) : `${v > 0 ? '+' : ''}${v}개월`
  return <span className={cn(good ? 'text-ok' : 'text-danger', className)}>기준 대비 {text}</span>
}

export default function ScenarioLab() {
  const client = useCurrentClient()
  const topic = useApp((s) => s.topic)!
  const revision = useApp((s) => s.revision)
  const small = useMediaQuery('(max-width: 639px)')
  const [list, setList] = useState<Scenario[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved')
  const [metric, setMetric] = useState<Metric>('netWorth')
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [flowSpan, setFlowSpan] = useState<'12' | '24' | 'all'>('24')
  const [detail, setDetail] = useState<Detail>('flow')
  const saveTimer = useRef<number>()

  const loaded = useAsync(() => api.scenarios(client!.id), [client?.id, revision], { enabled: !!client })
  useEffect(() => {
    if (loaded.data) {
      setList(loaded.data)
      setSelected((cur) => (loaded.data!.some((s) => s.id === cur) ? cur : (loaded.data!.find((s) => !s.isBaseline)?.id ?? loaded.data![0]?.id ?? null)))
    }
  }, [loaded.data])

  // 편집 중인(저장 전) 시나리오까지 포함해 실시간 비교 계산(Rust 엔진). 다시 계산하는 동안 이전 결과를 유지한다.
  const comparison = useAsync((signal) => api.compare({ clientId: client!.id, scenarios: list.slice(0, 8) }, signal), [JSON.stringify(list), client?.id], { delay: 160, enabled: !!client && list.length > 0 })

  const sc = list.find((s) => s.id === selected) ?? null
  const all = comparison.data?.scenarios ?? []
  const proj = all.find((s) => s.scenarioId === selected)?.projection
  const baseId = comparison.data?.baselineId
  const baseProj = all.find((s) => s.scenarioId === baseId)?.projection
  const baseSc = list.find((s) => s.id === baseId)

  const update = (patch: Partial<Scenario>) => {
    if (!sc) return
    // 고스트 궤적: 이 시나리오를 처음 바꾸는 순간의 경로를 보관해 변화량을 함께 보여준다
    if (proj && ghost?.scenarioId !== sc.id) setGhost({ scenarioId: sc.id, netWorth: proj.rows.map((r) => r.netWorth), cash: proj.rows.map((r) => r.cash) })
    const next = { ...sc, ...patch }
    setList((l) => l.map((s) => (s.id === sc.id ? next : s)))
    setSaveState('dirty')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving')
      try {
        await api.updateScenario(next)
        setSaveState('saved')
      } catch (e) {
        setSaveState('error')
        setError(errorText(e))
      }
    }, 700)
  }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const select = (id: string) => {
    setSelected(id)
    setGhost(null)
  }
  const create = (presetId?: string) =>
    run(async () => {
      const p = topic.config.scenarioPresets.find((x) => x.id === presetId)
      const created = await api.createScenario({
        clientId: client!.id,
        name: p?.name ?? `새 시나리오 ${list.length + 1}`,
        description: p?.description ?? '',
        color: p?.color || SERIES[list.length % SERIES.length],
        adjustments: p?.adjustments ?? { horizonMonths: 60 },
      })
      setList((l) => [...l, created])
      select(created.id)
    })
  const duplicate = () =>
    run(async () => {
      if (!sc) return
      window.clearTimeout(saveTimer.current)
      await api.updateScenario(sc)
      const copy = await api.duplicateScenario(sc.id)
      // 복제본은 독립 객체: 색상만 다음 범주색으로 바꿔 저장
      const colored = await api.updateScenario({ ...copy, color: SERIES[list.length % SERIES.length] })
      setList((l) => [...l, colored])
      select(colored.id)
    })
  const remove = () =>
    run(async () => {
      if (!sc || !confirm(`'${sc.name}' 시나리오를 삭제할까요?`)) return
      await api.deleteScenario(sc.id)
      const rest = list.filter((s) => s.id !== sc.id)
      setList(rest)
      select(rest[0]?.id ?? '')
    })

  const addEvent = () => update({ events: [...(sc?.events ?? []), { id: `ev_${Math.random().toString(36).slice(2, 8)}`, name: '새 이벤트', kind: 'expense_change', startMonth: 6, endMonth: null, amount: 200000 }] })
  const setEvent = (i: number, patch: Partial<FutureEvent>) => update({ events: sc!.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const chips = useMemo(() => (sc && client ? assumptionChips(sc, sc.id === baseId ? undefined : baseSc, client) : []), [sc, baseSc, baseId, client])

  if (!client) return <div className="p-8 text-muted">고객을 선택하세요.</div>
  const ghostValues = ghost && ghost.scenarioId === selected ? ghost[metric] : null
  const ghostChanged = ghostValues && proj && ghostValues[ghostValues.length - 1] !== (metric === 'cash' ? proj.summary.finalCash : proj.summary.finalNetWorth)
  const isBase = !!sc && sc.id === baseId
  const recalculating = comparison.loading && !!comparison.data
  const S = proj?.summary
  const B = baseProj?.summary
  const pg = S && primaryGoal(S)
  const bpg = B && primaryGoal(B)
  const goalDelta = pg?.achievedMonth != null && bpg?.achievedMonth != null ? pg.achievedMonth - bpg.achievedMonth : null

  return (
    <div className="pb-16">
      <PageHeader
        title="미래 시뮬레이션"
        subtitle="시나리오를 고르면 맨 위에 기준안 대비 변화와 주요 가정이 요약됩니다. 조건을 조정하면 Rust 엔진이 바로 다시 계산하고, 바꾸기 전 경로는 점선으로 남습니다. 결과는 입력한 가정에 따른 시뮬레이션이며 확정된 미래가 아닙니다."
        actions={
          <>
            <select aria-label="주제 프리셋으로 시나리오 추가" className={selectClass} value="" onChange={(e) => e.target.value && create(e.target.value)}>
              <option value="">주제 프리셋 추가</option>
              {topic.config.scenarioPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button onClick={() => create()} disabled={list.length >= 8}>
              <Plus className="h-4 w-4" /> 새 시나리오
            </Button>
          </>
        }
      />
      <div className="space-y-5 px-5 sm:px-8 lg:px-10">
        {(error || loaded.error) && <ErrorNote message={error ?? loaded.error!} onRetry={loaded.error ? loaded.reload : undefined} />}

        {/* 시나리오 선택: 모바일은 드롭다운, 넓은 화면은 가로 스크롤 탭(끝 흐림으로 더 있음을 표시) */}
        {!loaded.data && !loaded.error ? (
          <Skeleton className="h-12 w-full max-w-xl" label="시나리오 불러오는 중" />
        ) : (
          <>
            <div className="sm:hidden">
              <label className="mb-1 block px-1 text-[11.5px] text-dim" htmlFor="sc-pick">
                시나리오 {list.length}개 중 선택
              </label>
              <select id="sc-pick" className={cn(selectClass, 'h-10 w-full')} value={selected ?? ''} onChange={(e) => select(e.target.value)}>
                {list.map((s) => {
                  const p = all.find((x) => x.scenarioId === s.id)?.projection.summary
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isBaseline ? ' (기준)' : ''}
                      {p ? ` · ${manwon(p.finalNetWorth)}` : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className={cn('-mx-1 hidden snap-x gap-1.5 overflow-x-auto px-1 pb-1 sm:flex', list.length > 4 && 'scroll-fade-x pr-8')} role="tablist" aria-label="시나리오">
              {list.map((s) => {
                const p = all.find((x) => x.scenarioId === s.id)?.projection.summary
                const active = s.id === selected
                return (
                  <button key={s.id} role="tab" aria-selected={active} onClick={() => select(s.id)} className={cn('relative shrink-0 snap-start rounded-[14px] px-3.5 py-2 text-left transition-colors', active ? 'bg-white/80 shadow-[var(--pill-shadow)]' : 'hover:bg-white/40')}>
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className="h-[3px] w-3.5 rounded-full" style={{ background: s.color || SERIES[0] }} />
                      <span className={cn('max-w-[180px] truncate', active ? 'text-fg' : 'text-muted')}>{s.name}</span>
                      {s.isBaseline && <span className="text-[10.5px] text-dim">기준</span>}
                    </span>
                    {p && (
                      <span className="mt-0.5 flex gap-2 pl-5.5 text-[11.5px] text-dim">
                        <span className="num">{manwon(p.finalNetWorth)}</span>
                        {p.firstNegativeCashMonth && <span className="text-danger">소진 {p.firstNegativeCashMonth}개월</span>}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* ① 핵심 결론 */}
        <section aria-label="핵심 결론" className="steel rounded-[24px] px-5 py-4 sm:px-6">
          {S && B && sc ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[11.5px] text-white/75">핵심 결론 · {isBase ? '기준안' : '기준안 대비'}</span>
                {recalculating && <span className="text-[11px] text-white/70">다시 계산 중…</span>}
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] text-white/85">Rust 계산 · 가정 기반 시뮬레이션</span>
              </div>
              <p className="mt-1.5 text-[16px] leading-snug font-light sm:text-[18px]">
                {isBase ? (
                  <>
                    기준안은 {S.horizonMonths}개월 뒤 순자산 <b className="font-medium">{manwon(S.finalNetWorth)}</b>
                    {S.firstNegativeCashMonth ? `, ${S.firstNegativeCashMonth}개월 차에 현금이 바닥납니다.` : '이며 기간 중 현금이 바닥나지 않습니다.'} 다른 시나리오를 고르면 차이가 표시됩니다.
                  </>
                ) : (
                  <>
                    <b className="font-medium">{sc.name}</b>은(는) {S.horizonMonths}개월 뒤 순자산이 기준안보다 <b className="font-medium">{S.finalNetWorth === B.finalNetWorth ? '같습니다' : `${manwon(Math.abs(S.finalNetWorth - B.finalNetWorth))} ${S.finalNetWorth > B.finalNetWorth ? '많습니다' : '적습니다'}`}</b>
                    {S.firstNegativeCashMonth ? ` · ${S.firstNegativeCashMonth}개월 차 현금 소진` : ''}
                    {goalDelta ? ` · 1순위 목표 ${Math.abs(goalDelta)}개월 ${goalDelta < 0 ? '앞당김' : '늦어짐'}` : ''}
                  </>
                )}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
                <Conclusion label="기말 순자산" value={manwon(S.finalNetWorth)} sub={isBase ? `기간 변화 ${signed(S.netWorthChange)}` : <DeltaText v={S.finalNetWorth - B.finalNetWorth} unit="won" better="up" className="!text-white/85" />} />
                <Conclusion label={`최저 현금 · ${S.minCashMonth}개월 차`} value={manwon(S.minCash)} danger={S.minCash < 0} sub={isBase ? (S.minCash < 0 ? '현금 부족 발생' : '현금 부족 없음') : <DeltaText v={S.minCash - B.minCash} unit="won" better="up" className="!text-white/85" />} />
                <Conclusion label="1순위 목표 달성" value={pg ? (pg.achievedMonth == null ? '기간 내 미달성' : `${pg.achievedMonth}개월 차`) : '목표 없음'} sub={pg ? (isBase ? `목표 ${pg.targetMonth}개월 · ${pg.name}` : goalDelta == null ? `${pg.name}` : <DeltaText v={goalDelta} unit="month" better="down" className="!text-white/85" />) : '고객 정보에서 목표 추가'} />
                <Conclusion label="기간 총 이자" value={manwon(S.totalInterestPaid)} sub={isBase ? (S.householdDebtFreeMonth ? `${S.householdDebtFreeMonth}개월 차 상환 완료` : '기간 내 상환 완료 없음') : <DeltaText v={S.totalInterestPaid - B.totalInterestPaid} unit="won" better="down" className="!text-white/85" />} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-white/70">{isBase ? '기준안 가정' : '기준안과 다른 가정'}</span>
                {chips.map((c) => (
                  <span key={c} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11.5px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)]">
                    {c}
                  </span>
                ))}
              </div>
            </>
          ) : comparison.error ? (
            <p className="text-[13px] text-white/85">계산 결과를 불러오지 못했습니다. 아래 오류 안내에서 다시 시도하세요.</p>
          ) : (
            <div className="space-y-2" role="status" aria-label="핵심 결론 계산 중">
              <div className="h-4 w-40 rounded-full bg-white/20" />
              <div className="h-6 w-3/4 rounded-full bg-white/20" />
              <div className="grid grid-cols-2 gap-4 pt-1 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-[12px] bg-white/15" />
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
          {/* 조건 조정 패널 */}
          <Panel className="self-start xl:sticky xl:top-4">
            <div className="flex items-center justify-between gap-2 px-5 pt-4">
              <span className={cn('flex items-center gap-1.5 text-[12px]', saveState === 'error' ? 'text-danger' : 'text-dim')} aria-live="polite">
                <span className={cn('h-1.5 w-1.5 rounded-full', saveState === 'saved' ? 'bg-ok' : saveState === 'error' ? 'bg-danger' : 'bg-warn pulse-dot')} />
                {{ saved: '시나리오 조건 저장됨(서버)', saving: '시나리오 조건 저장 중', dirty: '변경됨 · 잠시 후 자동 저장', error: '시나리오 저장 실패' }[saveState]}
              </span>
              {sc && (
                <div className="flex gap-0.5">
                  <Button size="icon" variant="ghost" onClick={duplicate} aria-label="시나리오 복제" title="복제">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={remove} aria-label="시나리오 삭제" title="삭제" disabled={list.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {sc ? (
              <div className="space-y-4 px-5 pt-2 pb-5">
                <Input value={sc.name} maxLength={60} onChange={(e) => update({ name: e.target.value })} aria-label="시나리오 이름" className="text-[14px] font-medium" />
                <Group title="소득·지출">
                  <Slider label="월 소득 변화" value={sc.incomeChange} min={-3000000} max={3000000} step={50000} onChange={(v) => update({ incomeChange: v })} format={signed} />
                  <Slider label="월 고정지출 변화" value={sc.fixedExpenseChange} min={-1500000} max={1500000} step={50000} onChange={(v) => update({ fixedExpenseChange: v })} format={signed} />
                  <Slider label="월 변동지출 변화" value={sc.variableExpenseChange} min={-1500000} max={1500000} step={50000} onChange={(v) => update({ variableExpenseChange: v })} format={signed} />
                  <label className="flex items-center justify-between text-[12.5px] text-muted">
                    가족 지원액 재설정
                    <input type="checkbox" checked={sc.familySupportOverride != null} onChange={(e) => update({ familySupportOverride: e.target.checked ? client.familySupport : null })} />
                  </label>
                  {sc.familySupportOverride != null && <Slider label="월 가족 지원" value={sc.familySupportOverride} neutral={client.familySupport} min={0} max={2000000} step={50000} onChange={(v) => update({ familySupportOverride: v })} format={won} />}
                </Group>
                <Group title="부채·투자">
                  <Slider label="추가 부채 상환(고금리 우선)" value={sc.extraDebtPayment} min={0} max={1500000} step={50000} onChange={(v) => update({ extraDebtPayment: v })} format={won} />
                  <Slider label="월 투자 이체" value={sc.monthlyInvestment} min={0} max={2000000} step={50000} onChange={(v) => update({ monthlyInvestment: v })} format={won} />
                  <Slider label="투자 기대수익률(가정)" value={sc.investmentReturnBps} neutral={300} min={-1000} max={1500} step={25} onChange={(v) => update({ investmentReturnBps: v })} format={pct} />
                </Group>
                {client.business && (
                  <Group title="사업">
                    <Slider label="사업 매출 변화" value={sc.businessRevenueChangeBps} min={-6000} max={4000} step={100} onChange={(v) => update({ businessRevenueChangeBps: v })} format={(v) => `${v > 0 ? '+' : ''}${(v / 100).toFixed(0)}%`} />
                    <label className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
                      사업 부족분을 가계가 메움 (해제 = 방화벽)
                      <input type="checkbox" checked={sc.householdBackstop} onChange={(e) => update({ householdBackstop: e.target.checked })} />
                    </label>
                  </Group>
                )}
                <Group title="기간">
                  <Slider label="시뮬레이션 기간" value={sc.horizonMonths} neutral={sc.horizonMonths} min={12} max={120} step={6} onChange={(v) => update({ horizonMonths: v })} format={(v) => `${v}개월`} />
                </Group>
                <Group title="미래 이벤트">
                  {sc.events.length === 0 && <p className="text-[12.5px] text-dim">이벤트 없음</p>}
                  <AnimatePresence initial={false}>
                    {sc.events.map((ev, i) => (
                      <motion.div key={ev.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2 rounded-[14px] bg-white/40 p-3">
                        <div className="flex gap-2">
                          <Input value={ev.name} onChange={(e) => setEvent(i, { name: e.target.value })} aria-label="이벤트 이름" />
                          <Button size="icon" variant="ghost" aria-label="이벤트 삭제" onClick={() => update({ events: sc.events.filter((_, j) => j !== i) })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select className={selectClass} value={ev.kind} onChange={(e) => setEvent(i, { kind: e.target.value as EventKind })} aria-label="이벤트 유형">
                            {Object.entries(EVENT_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <NumberField value={ev.amount} min={-100000000} max={1000000000} onChange={(v) => setEvent(i, { amount: v })} ariaLabel="금액" />
                          <NumberField value={ev.startMonth} suffix="월부터" min={1} max={360} onChange={(v) => setEvent(i, { startMonth: v })} ariaLabel="시작 월" />
                          {ev.kind === 'income_change' || ev.kind === 'expense_change' ? (
                            <NumberField value={ev.endMonth ?? 0} suffix={ev.endMonth ? '월까지' : '끝까지'} min={0} max={360} onChange={(v) => setEvent(i, { endMonth: v > 0 ? Math.max(v, ev.startMonth) : null })} ariaLabel="종료 월(0=끝까지)" />
                          ) : (
                            <span className="self-center text-[12px] text-dim">해당 월 1회</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <Button size="sm" variant="ghost" onClick={addEvent} disabled={sc.events.length >= 50}>
                    <Plus className="h-3.5 w-3.5" /> 이벤트 추가
                  </Button>
                </Group>
              </div>
            ) : loaded.data ? (
              <p className="px-5 pb-5 text-[13px] text-muted">시나리오가 없습니다. ‘새 시나리오’ 또는 주제 프리셋으로 만들어 보세요.</p>
            ) : (
              <div className="space-y-3 px-5 pt-3 pb-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            )}
          </Panel>

          <div className="min-w-0 space-y-5">
            {/* ② 시나리오 비교 */}
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-medium">시나리오 비교</h3>
                  <HelpTip label="시나리오 비교 설명">모든 시나리오의 경로를 함께 그리고 선택한 시나리오를 굵게 강조합니다. 슬라이더를 움직이면 바꾸기 전 경로가 점선으로 남아요. 명절·휴가철 지출, 상여금, 연간 고정비가 반영되어 달마다 오르내립니다. 가로축은 경과 개월 수입니다.</HelpTip>
                  {ghostChanged && <span className="text-[12px] text-dim">점선 = 조작 전</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ghost && ghost.scenarioId === selected && (
                    <Button size="sm" variant="ghost" onClick={() => setGhost(null)} title="현재 경로를 새 기준으로">
                      <RotateCcw className="h-3.5 w-3.5" /> 점선 지우기
                    </Button>
                  )}
                  <Segmented size="sm" value={metric} onChange={setMetric} options={[{ value: 'netWorth', label: '순자산' }, { value: 'cash', label: '현금성 자산' }]} />
                </div>
              </div>
              <div className="px-3 pt-2 pb-2">
                {comparison.error && <ErrorNote message={`비교 계산 실패: ${comparison.error}`} onRetry={comparison.reload} />}
                {!comparison.data && !comparison.error && <Skeleton className="mx-2 h-[300px]" label="경로 계산 중" />}
                {comparison.data && (
                  <div className={cn('transition-opacity', recalculating && 'opacity-70')}>
                    <LinesChart
                      height={small ? 240 : 320}
                      compact={small}
                      series={all.map((s) => ({ id: s.scenarioId, name: s.name, color: s.color || SERIES[0], values: s.projection.rows.map((r) => r[metric]) }))}
                      emphasis={selected}
                      ghost={ghostChanged ? { name: '조작 전', values: ghostValues! } : null}
                      refY={metric === 'cash' ? proj?.summary.emergencyReserve : undefined}
                      refLabel="비상예비자금"
                    />
                    {small && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1 text-[11px] text-muted">
                        {all.map((s) => (
                          <span key={s.scenarioId} className={cn('flex items-center gap-1', s.scenarioId === selected && 'text-fg')}>
                            <span className="h-[3px] w-3 rounded-full" style={{ background: s.color || SERIES[0] }} />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {comparison.data && <CompareTable all={all} baseId={baseId!} selected={selected} onSelect={select} />}
            </Panel>

            {/* ③ 상세 근거 */}
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-medium">상세 근거</h3>
                  <span className="text-[12px] text-dim">{sc?.name}</span>
                  <SourceBadge kind="engine" />
                </div>
                <div className="-mx-1 max-w-full overflow-x-auto px-1">
                  <Segmented
                    size="sm"
                    value={detail}
                    onChange={setDetail}
                    options={[
                      { value: 'flow', label: '현금흐름' },
                      { value: 'calendar', label: '달력' },
                      { value: 'assets', label: '자산·부채' },
                      { value: 'goals', label: '목표' },
                      { value: 'warnings', label: `경고${proj?.warnings.length ? ` ${proj.warnings.length}` : ''}` },
                    ]}
                  />
                </div>
              </div>
              <div className="px-3 pt-3 pb-5">
                {!proj ? (
                  comparison.error ? null : <Skeleton className="mx-2 h-[260px]" label="상세 근거 계산 중" />
                ) : detail === 'flow' ? (
                  <DetailFlow proj={proj} span={flowSpan} setSpan={setFlowSpan} start={client.pattern?.startCalendarMonth} small={small} />
                ) : detail === 'calendar' ? (
                  <div className="px-2">
                    <p className="mb-2 text-[12px] text-dim">한 칸이 한 달입니다. 파란색이 진할수록 많이 남고, 분홍색은 적자 달입니다.</p>
                    <CashflowCalendar rows={proj.rows} start={client.pattern?.startCalendarMonth ?? 1} />
                  </div>
                ) : detail === 'assets' ? (
                  <TableToggle table={rowsTable(proj.rows, [['총자산', 'totalAssets'], ['총부채', 'totalLiabilities']])}>
                    <AssetsLiabilities rows={proj.rows} height={small ? 220 : 260} />
                  </TableToggle>
                ) : detail === 'goals' ? (
                  <div className="px-2">
                    <p className="mb-2 text-[12px] text-dim">세로선은 목표 시점, 막대는 Rust 엔진이 계산한 달성 시점(우선순위 순 누적 적립)입니다.</p>
                    <GoalTimeline goals={proj.summary.goals} horizon={proj.summary.horizonMonths} />
                  </div>
                ) : (
                  <div className="px-2">{proj.warnings.length ? <WarningList warnings={proj.warnings} /> : <p className="text-[13px] text-muted">이 시나리오에서 계산 엔진 경고가 없습니다.</p>}</div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function Conclusion({ label, value, sub, danger }: { label: string; value: string; sub: React.ReactNode; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-white/70">{label}</div>
      <div className={cn('num mt-0.5 truncate text-[22px] leading-tight font-extralight', danger && 'text-[#ffd2dc]')}>{value}</div>
      <div className="mt-0.5 truncate text-[11px]">{sub}</div>
    </div>
  )
}

type CompareRow = { scenarioId: string; name: string; color: string; projection: { summary: ProjectionSummary } }

/** 비교표: 각 칸 위 = 해당 시나리오의 절댓값, 아래 = 기준안 대비 차이(시나리오 − 기준안) */
function CompareTable({ all, baseId, selected, onSelect }: { all: CompareRow[]; baseId: string; selected: string | null; onSelect: (id: string) => void }) {
  const base = all.find((s) => s.scenarioId === baseId)?.projection.summary
  if (!base) return null
  const bg = primaryGoal(base)?.achievedMonth ?? null
  const cols: { key: string; label: string; unit: 'won' | 'month'; better: Better; get: (s: ProjectionSummary) => number | null; show: (s: ProjectionSummary) => string }[] = [
    { key: 'nw', label: '기말 순자산', unit: 'won', better: 'up', get: (s) => s.finalNetWorth, show: (s) => manwon(s.finalNetWorth) },
    { key: 'min', label: '최저 현금', unit: 'won', better: 'up', get: (s) => s.minCash, show: (s) => `${manwon(s.minCash)} · ${s.minCashMonth}개월 차` },
    { key: 'int', label: '기간 총 이자', unit: 'won', better: 'down', get: (s) => s.totalInterestPaid, show: (s) => manwon(s.totalInterestPaid) },
    { key: 'goal', label: '1순위 목표 달성', unit: 'month', better: 'down', get: (s) => primaryGoal(s)?.achievedMonth ?? null, show: (s) => (primaryGoal(s) ? (primaryGoal(s)!.achievedMonth == null ? '기간 내 미달성' : `${primaryGoal(s)!.achievedMonth}개월 차`) : '목표 없음') },
  ]
  return (
    <div className="border-t border-[var(--hair)] px-5 pt-3 pb-4">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] text-dim">
        비교표
        <HelpTip label="비교표 읽는 법">각 칸의 위 숫자는 그 시나리오의 절댓값(단위: 원, 만 = 1만 원)이고, 아래 줄은 기준안 대비 차이(시나리오 − 기준안)입니다. 차이가 0이면 ‘기준과 같음’으로 표시합니다. 초록은 유리한 방향, 빨강은 불리한 방향입니다(이자·목표 달성 월은 작을수록 유리).</HelpTip>
        <span className="ml-auto">위: 절댓값 · 아래: 기준안 대비 차이</span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="text-dim">
              <th scope="col" className="py-1 text-left font-normal">
                시나리오
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="py-1 text-right font-normal">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((s) => {
              const sum = s.projection.summary
              const isBase = s.scenarioId === baseId
              return (
                <tr key={s.scenarioId} className={cn('cursor-pointer border-t border-[var(--hair)] hover:bg-white/40', s.scenarioId === selected && 'bg-white/50')} onClick={() => onSelect(s.scenarioId)}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: s.color || SERIES[0] }} />
                      <span className="truncate">{s.name}</span>
                      {isBase && <Badge className="shrink-0">기준안</Badge>}
                    </span>
                  </th>
                  {cols.map((c) => {
                    const v = c.get(sum)
                    const b = c.key === 'goal' ? bg : c.get(base)
                    return (
                      <td key={c.key} className="py-2 pl-3 text-right align-top">
                        <div className={cn('num', c.key === 'min' && sum.minCash < 0 && 'text-danger')}>{c.show(sum)}</div>
                        <div className="text-[11px]">{isBase ? <span className="text-dim">기준</span> : <DeltaText v={v != null && b != null ? v - b : null} unit={c.unit} better={c.better} />}</div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <CompareBars items={all.map((s) => ({ name: s.name, color: s.color || SERIES[0], value: s.projection.summary.finalNetWorth }))} height={Math.max(120, all.length * 36)} />
      </div>
    </div>
  )
}

function TableToggle({ table, children }: { table: { columns: string[]; rows: (string | number)[][] }; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="mb-1 flex justify-end px-2">
        <Button size="sm" variant="ghost" onClick={() => setShow((v) => !v)} aria-pressed={show}>
          {show ? '차트 보기' : '표 보기'}
        </Button>
      </div>
      {show ? (
        <div className="max-h-[300px] overflow-auto px-2">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white/90">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="py-1.5 pr-3 text-left font-medium text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-[var(--hair)]">
                  {r.map((v, j) => (
                    <td key={j} className="num py-1 pr-3">
                      {typeof v === 'number' ? won(v) : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function DetailFlow({ proj, span, setSpan, start, small }: { proj: { rows: Parameters<typeof FlowComposition>[0]['rows']; summary: ProjectionSummary }; span: '12' | '24' | 'all'; setSpan: (v: '12' | '24' | 'all') => void; start?: number; small: boolean }) {
  const months = span === 'all' ? proj.rows.length : Number(span)
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <p className="text-[12px] text-dim">들어온 돈은 0 위로, 나간 돈은 0 아래로 쌓고 검은 선은 순현금흐름입니다.</p>
        <Segmented size="sm" value={span} onChange={setSpan} options={[{ value: '12', label: '1년' }, { value: '24', label: '2년' }, { value: 'all', label: '전체' }]} />
      </div>
      <TableToggle table={rowsTable(proj.rows.slice(1), [['소득', 'income'], ['생활비', 'livingExpenses'], ['가족지원', 'familySupport'], ['부채상환', 'debtPayment'], ['일회성', 'oneTimeNet'], ['순현금흐름', 'netCashflow']])}>
        <FlowComposition rows={proj.rows} months={months} start={start} height={small ? 220 : 260} legend={!small} />
        <div className="mt-3 px-3">
          <div className="mb-2 text-[12px] text-dim">첫 {span === 'all' ? proj.summary.horizonMonths : months}개월 지출 구성</div>
          <SpendingMix rows={proj.rows} months={months} />
        </div>
      </TableToggle>
    </div>
  )
}
