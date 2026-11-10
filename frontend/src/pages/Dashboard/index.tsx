// 홈: 데스크톱(lg 이상)에서는 스크롤 없이 한 화면에 들어가도록 3단 그리드(상단 요약 / 차트 / 목표·위험·여정)로 구성.
// 작은 화면에서는 자연스럽게 세로로 쌓이고 스크롤된다. 모든 수치는 Rust 엔진 API 결과.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, ChevronsRight, CircleDashed, ClipboardCheck, PlayCircle, Plus, ShieldAlert } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { useAnalysis, useClientComparison, useTopicComparison } from '@/features/topics/useTopicData'
import { api } from '@/services/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { Badge, Button, ErrorNote, HelpTip, IconCircle, Num, Panel, Readout, Segmented, Skeleton } from '@/components/ui'
import { LinesChart, SERIES } from '@/components/charts'
import { FlowComposition, SpendingMix } from '@/components/charts/insight'
import { SignatureVisual } from '@/components/financial/SignatureVisual'
import { JOURNEY, journeyStatus, nextStep, useDemo } from '@/features/journey/journey'
import { cn, manwon, shortMetric, signed, won } from '@/utils/format'

type Left = 'future' | 'topic'

export default function Dashboard() {
  const topic = useApp((s) => s.topic)!
  const { clients, clientId, selectClient } = useApp()
  const client = useCurrentClient()
  const nav = useNavigate()
  const analysis = useAnalysis(client)
  const topicComparison = useTopicComparison(client)
  const comparison = useClientComparison(client)
  const revision = useApp((s) => s.revision)
  const verification = useAsync(() => api.verification({ clientId: client!.id }), [client?.id, topic.version.id, revision], { enabled: !!client })
  const saved = useAsync(() => api.scenarios(client!.id), [client?.id, revision], { enabled: !!client })
  const actions = useAsync(() => api.actions(client!.id), [client?.id, revision], { enabled: !!client })
  const startDemo = useDemo((d) => d.start)
  const [pick, setPick] = useState<string | null>(null)
  const [left, setLeft] = useState<Left>('future')
  const cfg = topic.config
  if (!client) return <div className="p-10 text-muted">고객 데이터가 없습니다. 고객 정보에서 초기 데이터를 복구하세요.</div>

  const m = (k: string) => analysis.data?.metrics.find((x) => x.key === k)
  const netWorth = m('net_worth')
  const kpis = cfg.visual.kpis.map((k) => m(k)).filter(Boolean).slice(0, 4)
  const scenarios = comparison.data?.scenarios ?? []
  const base = scenarios.find((s) => s.scenarioId === comparison.data?.baselineId)
  const alt = scenarios.find((s) => s.scenarioId === pick) ?? scenarios.find((s) => s.scenarioId !== comparison.data?.baselineId)
  const v = verification.data?.summary
  const proj = analysis.data?.projection
  const goals = proj?.summary.goals ?? []
  const start = client.pattern?.startCalendarMonth
  const steps = journeyStatus({ goals: client.goals.length, analysis: analysis.data, savedScenarios: saved.data?.length ?? null, verification: verification.data, actions: actions.data?.items ?? null })
  const next = nextStep(steps)

  return (
    <div className="flex flex-col gap-4 px-5 pt-3 pb-6 sm:px-8 lg:h-full lg:px-10 lg:pb-5 [@media(max-height:760px)]:gap-2.5 [@media(max-height:760px)]:pt-1 [@media(max-height:760px)]:lg:pb-3">
      {/* ① 상단: 제목·고객 전환·순자산 | KPI */}
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:flex-nowrap">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5 text-[11.5px] text-dim">
            <span>재무설계</span>
            <span aria-hidden>›</span>
            <span>{cfg.name}</span>
            {cfg.id === 'shared_workspace' && <Badge tone="warn" className="ml-1">주제 미확정</Badge>}
            <HelpTip label="홈 화면 설명">{cfg.content.heroSubtitle}</HelpTip>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <div className="text-[34px] leading-none font-extralight tracking-[-0.02em] [@media(max-height:760px)]:text-[26px]">{netWorth ? <Num text={won(netWorth.value)} /> : <Skeleton className="h-9 w-56" label="순자산 계산 중" />}</div>
              <div className="mt-1.5 text-[11.5px] text-dim [@media(max-height:660px)]:hidden">
                현재 순자산 · {client.age}세 {client.occupation}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="고객 선택">
              {clients.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={c.id === clientId}
                  onClick={() => {
                    selectClient(c.id)
                    setPick(null)
                  }}
                  className={cn('rounded-full px-3.5 py-1.5 text-[12.5px] transition-all', c.id === clientId ? 'bg-white text-fg shadow-[var(--pill-shadow)]' : 'bg-white/30 text-muted shadow-[inset_0_0_0_1px_rgba(255,255,255,.7)] hover:bg-white/60')}
                >
                  {c.name.replace(' (합성)', '')}
                  <span className="ml-1 text-dim">{c.age}</span>
                </button>
              ))}
              <IconCircle onClick={() => nav('/client')} aria-label="고객 정보 편집" title="고객 정보 편집" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </IconCircle>
              <Button
                size="sm"
                variant="primary"
                className="ml-1"
                onClick={() => {
                  startDemo()
                  nav(JOURNEY[0].path)
                }}
              >
                <PlayCircle className="h-4 w-4" /> 3분 데모 시작
              </Button>
            </div>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {analysis.data ? kpis.map((k) => <Readout key={k!.key} label={k!.label} value={shortMetric(k!.unit, k!.value)} tone={k!.unit === 'won' && (k!.value ?? 0) < 0 ? 'danger' : undefined} />) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-24" label={i === 0 ? '핵심 지표 계산 중' : undefined} />)}
        </div>
      </section>
      {analysis.error && <ErrorNote message={analysis.error} onRetry={analysis.reload} />}

      {/* ② 중단: 미래 경로(또는 주제 시각화) | 1년 현금흐름 | 시나리오 비교 */}
      <section className="grid min-h-0 gap-4 lg:flex-1 lg:grid-cols-[1.15fr_1.15fr_0.9fr]">
        <Panel className="flex min-h-[300px] min-w-0 flex-col p-4 pb-2 lg:min-h-0 [@media(max-height:760px)]:p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[14px] font-medium">{left === 'future' ? '미래 순자산' : cfg.visual.signatureTitle || '주제 시각화'}</h2>
              <HelpTip label="설명">{left === 'future' ? '시나리오별 순자산 경로입니다. 상여금·명절·연간 지출이 반영되어 달마다 오르내립니다. 선택한 비교 시나리오가 강조됩니다.' : cfg.visual.signatureDescription}</HelpTip>
            </div>
            <Segmented size="sm" value={left} onChange={setLeft} options={[{ value: 'future', label: '미래' }, { value: 'topic', label: '주제' }]} />
          </div>
          <div className="mt-2 min-h-0 flex-1">
            {!comparison.data && !comparison.error && <Skeleton className="h-full min-h-[200px]" label="순자산 경로 계산 중" />}
            {comparison.error && <ErrorNote message={comparison.error} />}
            {comparison.data && left === 'future' && (
              <LinesChart compact height="100%" series={scenarios.map((s) => ({ id: s.scenarioId, name: s.name, color: s.color || SERIES[0], values: s.projection.rows.map((r) => r.netWorth) }))} emphasis={alt?.scenarioId ?? null} />
            )}
            {comparison.data && left === 'topic' && (
              <div className="h-full overflow-y-auto pr-1">
                {topicComparison.data ? <SignatureVisual topic={cfg} comparison={topicComparison.data} verification={verification.data} /> : topicComparison.error ? <ErrorNote message={topicComparison.error} onRetry={topicComparison.reload} /> : <Skeleton className="h-48" label="주제 시각화 계산 중" />}
              </div>
            )}
          </div>
          {left === 'future' && scenarios.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-muted">
              {scenarios.map((s) => (
                <span key={s.scenarioId} className={cn('flex items-center gap-1', alt && s.scenarioId !== alt.scenarioId && s.scenarioId !== base?.scenarioId && 'opacity-60')}>
                  <span className="h-[3px] w-3 rounded-full" style={{ background: s.color || SERIES[0] }} />
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="flex min-h-[300px] min-w-0 flex-col p-4 pb-3 lg:min-h-0 [@media(max-height:760px)]:p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[14px] font-medium">앞으로 1년 현금흐름</h2>
              <HelpTip label="설명">현재 상태 기준 월별 수입(위)과 지출(아래), 검은 선은 순현금흐름입니다. 막대에 마우스를 올리면 항목별 금액이 보여요. 아래 막대는 1년 지출 구성 비율입니다.</HelpTip>
            </div>
            <Link to="/scenarios" className="text-[12px] text-dim hover:text-fg">
              자세히
            </Link>
          </div>
          <div className="mt-2 min-h-0 flex-1">{proj ? <FlowComposition rows={proj.rows} months={12} start={start} height="100%" legend={false} /> : analysis.error ? null : <Skeleton className="h-full min-h-[200px]" label="현금흐름 계산 중" />}</div>
          {proj && (
            <div className="px-1 pt-2 [@media(max-height:760px)]:hidden">
              <SpendingMix rows={proj.rows} months={12} compact />
            </div>
          )}
        </Panel>

        <div className="steel flex min-h-[300px] min-w-0 flex-col rounded-[24px] p-5 lg:min-h-0 [@media(max-height:760px)]:p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-medium">시나리오 비교</h2>
            <Link to="/scenarios" className="flex items-center gap-1 text-[12px] text-white/80 hover:text-white">
              자세히 <ChevronsRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {comparison.error && <ErrorNote message={comparison.error} />}
          {base && alt ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden" aria-label="시나리오별 기말 순자산">
                {(() => {
                  const vals = scenarios.map((s) => s.projection.summary.finalNetWorth)
                  const hi = Math.max(1, ...vals.map(Math.abs))
                  return scenarios.map((s) => {
                    const val = s.projection.summary.finalNetWorth
                    return (
                      <li key={s.scenarioId}>
                        <button onClick={() => s.scenarioId !== base.scenarioId && setPick(s.scenarioId)} aria-pressed={s.scenarioId === alt.scenarioId} className="block w-full rounded-[8px] px-1 py-0.5 text-left hover:bg-white/10">
                          <div className="flex justify-between gap-2 text-[11px] text-white/80">
                            <span className={cn('truncate', s.scenarioId === alt.scenarioId && 'text-white')}>{s.name}{s.scenarioId === base.scenarioId ? ' · 기준' : ''}</span>
                            <span className="num shrink-0">{manwon(val)}</span>
                          </div>
                          <div className="mt-0.5 h-1.5 rounded-full bg-white/15">
                            <div className={cn('h-full rounded-full transition-[width] duration-500', val < 0 ? 'bg-[#f3b4c8]' : s.scenarioId === alt.scenarioId ? 'bg-white' : 'bg-white/55')} style={{ width: `${(Math.abs(val) / hi) * 100}%` }} />
                          </div>
                        </button>
                      </li>
                    )
                  })
                })()}
              </ul>
              <div className="grid grid-cols-2 gap-2.5 pt-3 [@media(max-height:760px)]:hidden">
                {[base, alt].map((s, i) => (
                  <div key={s.scenarioId} className="rounded-[16px] bg-white/15 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)]">
                    <div className="truncate text-[11px] text-white/75">{i === 0 ? '기준' : '비교'} · {s.name}</div>
                    <div className="mt-2 text-[22px] leading-none font-extralight">
                      <Num text={manwon(s.projection.summary.finalNetWorth)} />
                    </div>
                    <div className="mt-1 text-[10.5px] text-white/70">{s.projection.summary.horizonMonths}개월 후 순자산</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="text-[18px] font-light">
                    <Num text={signed(alt.projection.summary.finalNetWorth - base.projection.summary.finalNetWorth)} />
                  </div>
                  <div className="text-[10.5px] text-white/70">기준 대비 · 최저 현금 {manwon(alt.projection.summary.minCash)}</div>
                </div>
                {alt.projection.summary.firstNegativeCashMonth != null && <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] text-danger">{alt.projection.summary.firstNegativeCashMonth}개월 차 현금 소진</span>}
              </div>
            </div>
          ) : (
            !comparison.error && (
              <div className="mt-3 space-y-2" role="status" aria-label="시나리오 비교 계산 중">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-7 rounded-[10px] bg-white/15" />
                ))}
              </div>
            )
          )}
        </div>
      </section>

      {/* ③ 하단: 목표 | 위험·검증 | 6단계 여정 */}
      <section className="grid gap-4 lg:grid-cols-[1.15fr_1.15fr_0.9fr]">
        <Panel className="min-w-0 p-4 [@media(max-height:760px)]:p-3 [@media(max-height:760px)]:py-2.5">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[14px] font-medium">목표 달성</h2>
            <span className="text-[11.5px] text-dim">
              기한 내 {goals.filter((g) => g.onTrack).length}/{goals.length}
            </span>
          </div>
          <ul className="space-y-2">
            {goals.slice(0, 3).map((g, gi) => {
              const maxM = Math.max(g.targetMonth, g.achievedMonth ?? 0, 1) * 1.15
              return (
                <li key={g.goalId} className={cn('px-1', gi === 2 && '[@media(max-height:760px)]:hidden')}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="truncate">{g.name}</span>
                    <span className={cn('shrink-0 text-[11.5px]', g.onTrack ? 'text-primary' : 'text-warn')}>{g.achievedMonth == null ? '기간 내 미달성' : `${g.achievedMonth}개월 차`} / 목표 {g.targetMonth}</span>
                  </div>
                  <div className="relative mt-1 h-1.5 rounded-full bg-white/60" role="img" aria-label={`${g.name} 목표 ${g.targetMonth}개월, 달성 ${g.achievedMonth ?? '없음'}`}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, ((g.achievedMonth ?? maxM) / maxM) * 100)}%`, background: g.onTrack ? 'linear-gradient(90deg,#8aa0bd,var(--primary))' : 'linear-gradient(90deg,#d9c39b,var(--warn))', transition: 'width 450ms ease' }} />
                    <div className="absolute -top-1 h-3.5 w-[2px] rounded-full bg-fg" style={{ left: `${(g.targetMonth / maxM) * 100}%` }} />
                  </div>
                </li>
              )
            })}
            {!goals.length && <li className="px-1 text-[12.5px] text-muted">등록된 목표가 없습니다.</li>}
          </ul>
        </Panel>

        <Panel className="min-w-0 p-4 [@media(max-height:760px)]:p-3 [@media(max-height:760px)]:py-2.5">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-[14px] font-medium">
              지금 확인할 위험
              <HelpTip label="위험 판정 방식">규칙 엔진이 Rust 계산 지표를 임계값과 비교해 탐지한 위험과, 계산 엔진의 현금 부족 경고입니다. LLM 판단이 아닙니다.</HelpTip>
            </h2>
            <Link to="/verification" className="flex items-center gap-1 text-[11.5px] text-dim hover:text-fg">
              <ClipboardCheck className="h-3.5 w-3.5" />
              AI 검증 {v ? `확인 ${v.verified + v.corrected} · 오류 ${v.errorFound}` : ''}
            </Link>
          </div>
          <ul>
            {[
              ...(analysis.data?.insights ?? []).map((i) => ({ id: i.id, title: i.title, message: i.message, formula: i.formula, critical: i.severity === 'critical' })),
              ...(proj?.warnings ?? []).map((w, k) => ({ id: w.code + k, title: w.message, message: w.message, formula: `Rust 엔진 경고 ${w.code}${w.month != null ? ` · ${w.month}개월 차` : ''}`, critical: w.severity === 'critical' })),
            ].slice(0, 3).map((ins, ii) => (
              <li key={ins.id} className={cn('flex items-center gap-2.5 rounded-[12px] px-1 py-1.5 [@media(max-height:760px)]:py-1', ii === 2 && '[@media(max-height:760px)]:hidden')}>
                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full', ins.critical ? 'bg-[color-mix(in_oklab,var(--danger)_12%,white)] text-danger' : 'bg-[color-mix(in_oklab,var(--warn)_12%,white)] text-warn')}>
                  <ShieldAlert className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]" title={ins.message}>
                  {ins.title}
                </span>
                <HelpTip label={`${ins.title} 자세히`} align="right">
                  {ins.message}
                  <span className="mt-1 block text-dim">근거 · {ins.formula}</span>
                </HelpTip>
              </li>
            ))}
            {analysis.data && analysis.data.insights.length === 0 && !proj?.warnings.length && <li className="px-1 py-2 text-[12.5px] text-muted">탐지된 위험이 없습니다.</li>}
          </ul>
        </Panel>

        <Panel className="min-w-0 p-4 [@media(max-height:760px)]:p-3 [@media(max-height:760px)]:py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="flex items-center gap-1.5 text-[14px] font-medium">
              재무설계 진행
              <HelpTip label="진행 상태 기준" align="right">
                각 단계 상태는 실제 데이터로 판정합니다. 완료 = 목표 입력·시나리오 2개 이상·모든 검증 주장에 사람 판단·실행 항목 착수 등. 주의 = 심각 위험이나 사람 판단이 필요한 검증 주장이 남아 있음.
              </HelpTip>
            </h2>
            <span className="text-[11px] text-dim">완료 {steps.filter((x) => x.state === 'done').length}/{steps.length}</span>
          </div>
          <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="재무설계 진행 상태">
            {JOURNEY.map((j, i) => {
              const st = steps[i]
              const Icon = st.state === 'done' ? CheckCircle2 : st.state === 'attention' ? AlertCircle : CircleDashed
              return (
                <li key={j.key} className="min-w-0">
                  <Link to={j.path} title={`${j.label}: ${st.note}`} className={cn('flex h-full flex-col items-center gap-0.5 rounded-[12px] px-1 py-1.5 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,.7)] hover:bg-white/80', j.key === next.step.key ? 'bg-white/85' : 'bg-white/35')}>
                    <Icon className={cn('h-3.5 w-3.5', st.state === 'done' ? 'text-ok' : st.state === 'attention' ? 'text-warn' : 'text-dim')} aria-label={{ done: '완료', attention: '확인 필요', todo: '시작 전' }[st.state]} />
                    <span className="w-full truncate text-[11px]">{j.label}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <Link to={next.step.path} className="mt-2 flex items-center gap-2 rounded-[14px] bg-accent-soft px-3 py-2 hover:brightness-105 [@media(max-height:760px)]:py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[10.5px] text-accent">이 고객의 다음 권장 단계</span>
              <span className="block truncate text-[12.5px] text-fg">
                {next.step.label} · {next.status.note}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
          </Link>
        </Panel>
      </section>
    </div>
  )
}
