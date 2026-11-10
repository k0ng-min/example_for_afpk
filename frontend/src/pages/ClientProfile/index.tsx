// 고객 정보: 기본 정보 / 현금흐름 / 자산·부채 / 재무목표 / 계산 가정 탭으로 나누고,
// 저장 전 변경사항과 계산 결과 변화(저장값 → 편집값)를 오른쪽에 함께 보여준다. 계산은 모두 Rust 엔진(/api/scenarios/calculate).
import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { errorText } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import type { Client, Goal, Liability, Metric } from '@/types/api'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, Input, Label, Notice, NumberField, Panel, PanelHeader, Skeleton, Slider, SourceBadge, Textarea, selectClass } from '@/components/ui'
import { AnnualRhythm } from '@/components/charts/insight'
import { WarningList } from '@/components/financial'
import { cn, formatMetric, manwon, pct } from '@/utils/format'

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`

type Tab = 'basic' | 'cashflow' | 'balance' | 'goals' | 'assumptions'
const TABS: { value: Tab; label: string }[] = [
  { value: 'basic', label: '기본 정보' },
  { value: 'cashflow', label: '현금흐름' },
  { value: 'balance', label: '자산·부채' },
  { value: 'goals', label: '재무목표' },
  { value: 'assumptions', label: '계산 가정' },
]

/** 변경 감지용 필드 → (탭, 라벨, 금액 여부) */
const FIELDS: { key: keyof Client; tab: Tab; label: string; money?: boolean }[] = [
  { key: 'name', tab: 'basic', label: '이름' },
  { key: 'age', tab: 'basic', label: '나이' },
  { key: 'occupation', tab: 'basic', label: '직업' },
  { key: 'familySituation', tab: 'basic', label: '가족 상황' },
  { key: 'emergencyFundTargetMonths', tab: 'basic', label: '비상자금 목표(개월)' },
  { key: 'monthlyIncome', tab: 'cashflow', label: '월 세후 소득', money: true },
  { key: 'fixedExpenses', tab: 'cashflow', label: '월 고정지출', money: true },
  { key: 'variableExpenses', tab: 'cashflow', label: '월 변동지출', money: true },
  { key: 'familySupport', tab: 'cashflow', label: '월 가족 지원', money: true },
  { key: 'cashAssets', tab: 'balance', label: '현금성 자산', money: true },
  { key: 'investmentAssets', tab: 'balance', label: '투자 자산', money: true },
  { key: 'otherAssets', tab: 'balance', label: '기타 자산', money: true },
  { key: 'liabilities', tab: 'balance', label: '부채 목록' },
  { key: 'business', tab: 'balance', label: '사업 프로필' },
  { key: 'goals', tab: 'goals', label: '재무목표 목록' },
  { key: 'pattern', tab: 'assumptions', label: '연 인상률·현금 리듬' },
  { key: 'assumptions', tab: 'assumptions', label: '명시적 계산 가정' },
  { key: 'extensions', tab: 'assumptions', label: '주제별 확장 입력' },
]

const KEY_METRICS = ['monthly_surplus', 'savings_rate_bps', 'debt_service_ratio_bps', 'family_support_ratio_bps', 'emergency_fund_months_x10', 'net_worth', 'primary_goal_achieved_month', 'total_interest_paid']

export default function ClientProfile() {
  const client = useCurrentClient()
  const { replaceClient, reloadClients, topic } = useApp()
  const [draft, setDraft] = useState<Client | null>(client)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('basic')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  useEffect(() => setDraft(client), [client])

  const templates = useAsync(() => api.goalTemplates(), [])
  // 저장 전 편집값으로 즉시 재계산(디바운스) + 저장된 값 기준 계산(비교용)
  const preview = useAsync((signal) => api.calculate({ client: draft!, adjustments: {} }, signal), [JSON.stringify(draft)], { delay: 250, enabled: !!draft })
  const savedCalc = useAsync((signal) => api.calculate({ client: client!, adjustments: {} }, signal), [JSON.stringify(client)], { enabled: !!client })

  const changes = useMemo(() => {
    if (!draft || !client) return []
    return FIELDS.filter((f) => JSON.stringify(draft[f.key]) !== JSON.stringify(client[f.key]))
  }, [draft, client])

  if (!draft || !client) return <div className="p-8 text-muted">고객을 선택하세요.</div>
  const dirty = changes.length > 0
  const set = <K extends keyof Client>(k: K, v: Client[K]) => {
    setDraft({ ...draft, [k]: v })
    setMsg(null)
  }
  const setLiab = (i: number, patch: Partial<Liability>) => set('liabilities', draft.liabilities.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const setGoal = (i: number, patch: Partial<Goal>) => set('goals', draft.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)))

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const saved = await api.saveClient(draft)
      replaceClient(saved)
      setMsg({ tone: 'ok', text: `${client.name}의 변경 ${changes.length}건을 서버(SQLite)에 저장했습니다. 모든 화면이 새 데이터로 다시 계산됩니다.` })
    } catch (e) {
      setMsg({ tone: 'err', text: `저장 실패: ${errorText(e)}` })
    } finally {
      setSaving(false)
    }
  }
  const reset = async () => {
    if (!confirm('모든 합성 고객·시나리오·실행계획·검토 기록을 초기 데이터로 복구합니다. 지금까지 저장한 변경은 사라집니다. 계속할까요?')) return
    try {
      await api.resetData()
      await reloadClients()
      setMsg({ tone: 'ok', text: '모든 합성 고객 데이터를 초기 상태로 복구했습니다.' })
    } catch (e) {
      setMsg({ tone: 'err', text: errorText(e) })
    }
  }

  const metricsNow = preview.data?.metrics ?? []
  const metricsSaved = savedCalc.data?.metrics ?? []
  const tabChanged = (t: Tab) => changes.some((c) => c.tab === t)

  return (
    <div className="pb-28">
      <PageHeader
        title="고객 정보"
        subtitle="입력값을 바꾸면 저장하기 전에도 오른쪽 계산 결과가 바로 바뀌고, 저장값과의 차이가 함께 표시됩니다. 모든 고객은 실제 인물이 아닌 합성 데이터입니다."
        actions={
          <>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> 초기 데이터 복구
            </Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(client)}>
              변경 취소
            </Button>
            <Button variant="primary" disabled={!dirty} loading={saving} onClick={save}>
              <Save className="h-4 w-4" /> 고객 정보 저장
            </Button>
          </>
        }
      />
      <div className="grid gap-5 px-5 sm:px-8 lg:px-10 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {msg && (msg.tone === 'err' ? <ErrorNote message={msg.text} /> : <Notice>{msg.text}</Notice>)}

          <div className="flex flex-wrap items-center gap-2">
            <div className="-mx-1 max-w-full overflow-x-auto px-1" role="tablist" aria-label="입력 묶음">
              <div className="inline-flex rounded-full bg-white/40 p-1 shadow-[inset_0_0_0_1px_rgba(36,56,86,.08)]">
                {TABS.map((t) => (
                  <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('relative h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium whitespace-nowrap transition-all', tab === t.value ? 'bg-white text-fg shadow-[var(--pill-shadow)]' : 'text-muted hover:text-fg')}>
                    {t.label}
                    {tabChanged(t.value) && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label="변경됨" />}
                  </button>
                ))}
              </div>
            </div>
            <Badge tone="warn">합성 데이터</Badge>
            <SourceBadge kind="input" />
          </div>

          {tab === 'basic' && (
            <Panel>
              <PanelHeader title="기본 정보" description="고객과의 관계 정립 단계에서 확인하는 인적 사항(합성)" />
              <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">이름</Label>
                  <Input id="name" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={40} />
                </div>
                <div>
                  <Label htmlFor="age">나이</Label>
                  <NumberField id="age" value={draft.age} suffix="세" min={15} max={100} onChange={(v) => set('age', v)} />
                </div>
                <div>
                  <Label htmlFor="efm" hint="필수지출 대비">비상자금 목표</Label>
                  <NumberField id="efm" value={draft.emergencyFundTargetMonths} suffix="개월" min={0} max={24} onChange={(v) => set('emergencyFundTargetMonths', v)} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="occ">직업</Label>
                  <Input id="occ" value={draft.occupation} onChange={(e) => set('occupation', e.target.value)} maxLength={60} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="fam">가족 상황</Label>
                  <Input id="fam" value={draft.familySituation} onChange={(e) => set('familySituation', e.target.value)} maxLength={200} />
                </div>
              </div>
            </Panel>
          )}

          {tab === 'cashflow' && (
            <>
              <Panel>
                <PanelHeader title="월 현금흐름" description="모든 금액은 원 단위 정수" />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                  {(
                    [
                      ['monthlyIncome', '월 세후 소득'],
                      ['fixedExpenses', '월 고정지출'],
                      ['variableExpenses', '월 변동지출'],
                      ['familySupport', '월 가족 지원'],
                    ] as const
                  ).map(([k, label]) => (
                    <FieldMoney key={k} id={k} label={label} value={draft[k]} saved={client[k]} onChange={(v) => set(k, v)} />
                  ))}
                </div>
              </Panel>
              {draft.pattern && (
                <Panel>
                  <PanelHeader title="1년 현금 리듬" description="실제 가계처럼 달마다 돈의 흐름이 다릅니다. 막대는 달력 월별 변동지출 증감(위 = 더 씀, 아래 = 덜 씀), ▲는 상여금·환급 같은 정기 유입, ▼는 명절·보험·세금 같은 연간 지출입니다. 연 인상률은 ‘계산 가정’ 탭에서 바꿉니다." />
                  <div className="px-5 pb-5">
                    <AnnualRhythm pattern={draft.pattern} />
                  </div>
                </Panel>
              )}
            </>
          )}

          {tab === 'balance' && (
            <>
              <Panel>
                <PanelHeader title="자산" />
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
                  {(
                    [
                      ['cashAssets', '현금성 자산'],
                      ['investmentAssets', '투자 자산'],
                      ['otherAssets', '기타 자산(보증금 등)'],
                    ] as const
                  ).map(([k, label]) => (
                    <FieldMoney key={k} id={k} label={label} value={draft[k]} saved={client[k]} onChange={(v) => set(k, v)} />
                  ))}
                </div>
              </Panel>
              <Panel>
                <PanelHeader
                  title="부채"
                  description="이자 = 잔액 × 연이율 ÷ 12 (원 단위 반올림)"
                  actions={
                    <Button size="sm" onClick={() => set('liabilities', [...draft.liabilities, { id: uid('loan'), name: '새 부채', kind: 'household', balance: 1000000, annualRateBps: 500, monthlyPayment: 100000 }])}>
                      <Plus className="h-3.5 w-3.5" /> 부채 추가
                    </Button>
                  }
                />
                <div className="space-y-3 px-5 pb-5">
                  {draft.liabilities.length === 0 && <p className="text-[13px] text-muted">등록된 부채가 없습니다.</p>}
                  {draft.liabilities.map((l, i) => (
                    <div key={l.id} className="grid items-end gap-3 rounded-[16px] bg-white/40 p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1fr_0.9fr_1fr_auto]">
                      <div>
                        <Label>이름</Label>
                        <Input value={l.name} onChange={(e) => setLiab(i, { name: e.target.value })} aria-label="부채 이름" />
                      </div>
                      <div>
                        <Label>구분</Label>
                        <select aria-label="부채 구분" className={cn(selectClass, 'h-10 w-full')} value={l.kind} onChange={(e) => setLiab(i, { kind: e.target.value as Liability['kind'] })}>
                          <option value="household">가계</option>
                          <option value="business">사업</option>
                        </select>
                      </div>
                      <div>
                        <Label>잔액</Label>
                        <NumberField value={l.balance} min={0} onChange={(v) => setLiab(i, { balance: v })} ariaLabel="부채 잔액" />
                      </div>
                      <div>
                        <Label hint={`${(l.annualRateBps / 100).toFixed(2)}%`}>연이율</Label>
                        <NumberField value={l.annualRateBps} suffix="bp" min={0} max={3000} onChange={(v) => setLiab(i, { annualRateBps: v })} ariaLabel="연이율(bp)" />
                      </div>
                      <div>
                        <Label>월 상환액</Label>
                        <NumberField value={l.monthlyPayment} min={0} onChange={(v) => setLiab(i, { monthlyPayment: v })} ariaLabel="월 상환액" />
                      </div>
                      <Button size="icon" variant="ghost" aria-label="부채 삭제" onClick={() => set('liabilities', draft.liabilities.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel>
                <PanelHeader
                  title="사업 프로필"
                  description="가계·사업 전염 분석에 사용(가계 소득에는 대표자 인출이 포함됨)"
                  actions={
                    draft.business ? (
                      <Button size="sm" variant="ghost" onClick={() => set('business', null)}>
                        제거
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => set('business', { monthlyRevenue: 10000000, monthlyCost: 6000000, operatingCash: 10000000, ownerDraw: draft.monthlyIncome })}>
                        <Plus className="h-3.5 w-3.5" /> 사업 프로필 추가
                      </Button>
                    )
                  }
                />
                {draft.business ? (
                  <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        ['monthlyRevenue', '월 매출'],
                        ['monthlyCost', '월 운영비'],
                        ['operatingCash', '운영자금'],
                        ['ownerDraw', '대표자 인출'],
                      ] as const
                    ).map(([k, label]) => (
                      <FieldMoney key={k} id={`biz_${k}`} label={label} value={draft.business![k]} saved={client.business?.[k]} onChange={(v) => set('business', { ...draft.business!, [k]: v })} />
                    ))}
                  </div>
                ) : (
                  <p className="px-5 pb-5 text-[13px] text-muted">사업 프로필이 없습니다(가계 전용 고객).</p>
                )}
              </Panel>
            </>
          )}

          {tab === 'goals' && (
            <Panel>
              <PanelHeader
                title="재무목표"
                description="우선순위 순으로 누적 적립해 달성 시점을 평가합니다(Rust 엔진)"
                actions={
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="목표 템플릿 추가"
                      className={cn(selectClass, 'h-8')}
                      value=""
                      onChange={(e) => {
                        const t = templates.data?.find((x) => x.id === e.target.value)
                        if (t) set('goals', [...draft.goals, { ...t, id: uid('goal'), priority: draft.goals.length + 1 }])
                      }}
                    >
                      <option value="">템플릿에서 추가</option>
                      {templates.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => set('goals', [...draft.goals, { id: uid('goal'), name: '새 목표', targetAmount: 5000000, targetMonth: 24, priority: draft.goals.length + 1, category: '' }])}>
                      <Plus className="h-3.5 w-3.5" /> 목표 추가
                    </Button>
                  </div>
                }
              />
              <div className="space-y-3 px-5 pb-5">
                {draft.goals.length === 0 && <p className="text-[13px] text-muted">목표가 없습니다. 목표를 추가해야 목표 달성 시점을 계산할 수 있습니다.</p>}
                {draft.goals.map((g, i) => {
                  const res = preview.data?.projection.summary.goals.find((x) => x.goalId === g.id)
                  return (
                    <div key={g.id} className="grid items-end gap-3 rounded-[16px] bg-white/40 p-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_0.7fr_0.6fr_auto]">
                      <div>
                        <Label>목표</Label>
                        <Input value={g.name} onChange={(e) => setGoal(i, { name: e.target.value })} aria-label="목표 이름" />
                      </div>
                      <div>
                        <Label>목표 금액</Label>
                        <NumberField value={g.targetAmount} min={1} onChange={(v) => setGoal(i, { targetAmount: v })} ariaLabel="목표 금액" />
                      </div>
                      <div>
                        <Label>목표 시점</Label>
                        <NumberField value={g.targetMonth} suffix="개월" min={1} max={360} onChange={(v) => setGoal(i, { targetMonth: v })} ariaLabel="목표 시점" />
                      </div>
                      <div>
                        <Label>우선순위</Label>
                        <NumberField value={g.priority} suffix="" min={1} max={20} onChange={(v) => setGoal(i, { priority: v })} ariaLabel="우선순위" />
                      </div>
                      <Button size="icon" variant="ghost" aria-label="목표 삭제" onClick={() => set('goals', draft.goals.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {res && (
                        <div className={cn('text-[12px] sm:col-span-2 lg:col-span-5', res.onTrack ? 'text-ok' : 'text-warn')}>
                          {res.achievedMonth ? `${res.achievedMonth}개월 차 달성 예상` : '시뮬레이션 기간 내 미달성'} · 필요 월저축 {new Intl.NumberFormat('ko-KR').format(res.requiredMonthlySaving)}원 · Rust 계산
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          {tab === 'assumptions' && (
            <>
              {draft.pattern && (
                <Panel>
                  <PanelHeader title="연 인상률(가정)" description="미래 소득·생활비가 매년 얼마나 오른다고 볼지 정하는 가정입니다. 확정된 전망이 아닙니다." />
                  <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
                    <Slider label="연 소득 인상률(가정)" value={draft.pattern.annualIncomeGrowthBps} neutral={client.pattern?.annualIncomeGrowthBps ?? 0} min={-1000} max={1500} step={50} onChange={(v) => set('pattern', { ...draft.pattern!, annualIncomeGrowthBps: v })} format={pct} />
                    <Slider label="연 생활비 상승률(가정)" value={draft.pattern.annualExpenseGrowthBps} neutral={client.pattern?.annualExpenseGrowthBps ?? 0} min={-1000} max={1500} step={50} onChange={(v) => set('pattern', { ...draft.pattern!, annualExpenseGrowthBps: v })} format={pct} />
                    <div className="text-[11.5px] text-dim">시뮬레이션 시작 · {draft.pattern.startCalendarMonth}월</div>
                  </div>
                </Panel>
              )}
              <Panel>
                <PanelHeader title="명시적 계산 가정" description="원 자료에 없어서 설정한 값. 한 줄에 하나씩 적고, 보고서에 그대로 실립니다." />
                <div className="px-5 pb-5">
                  <Textarea rows={5} aria-label="명시적 계산 가정" value={draft.assumptions.join('\n')} onChange={(e) => set('assumptions', e.target.value.split('\n').filter((x, i, a) => x.trim() || i < a.length - 1))} />
                </div>
              </Panel>
              {topic && topic.config.inputSchema.length > 0 && (
                <Panel>
                  <PanelHeader title="주제별 확장 입력" description={`${topic.config.name} 주제의 input_schema.json 에서 구성`} />
                  <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                    {topic.config.inputSchema.map((f) => (
                      <div key={f.key}>
                        <Label hint={f.description}>{f.label}</Label>
                        <NumberField value={draft.extensions[f.key] ?? f.default} suffix={f.unit} min={f.min} max={f.max} onChange={(v) => set('extensions', { ...draft.extensions, [f.key]: v })} ariaLabel={f.label} />
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Panel className={cn(dirty && 'shadow-[0_0_0_1.5px_var(--accent)]')}>
            <PanelHeader
              title={dirty ? '계산 결과 변화' : '계산 결과'}
              description={dirty ? '왼쪽은 저장된 값, 오른쪽은 편집 중인 값 기준 Rust 계산 결과입니다(아직 저장 안 됨).' : '저장된 값 기준 Rust 계산 결과입니다.'}
              actions={
                <span className="flex items-center gap-1.5">
                  {preview.loading && <span className="text-[11px] text-dim">계산 중…</span>}
                  <SourceBadge kind="engine" />
                </span>
              }
            />
            <div className="px-5 pb-5">
              {preview.error && <ErrorNote message={`계산 실패: ${preview.error}`} onRetry={preview.reload} />}
              {!preview.data && !preview.error ? (
                <div className="space-y-2">
                  {KEY_METRICS.map((k) => (
                    <Skeleton key={k} className="h-6" />
                  ))}
                </div>
              ) : (
                KEY_METRICS.map((k) => <MetricCompare key={k} now={metricsNow.find((x) => x.key === k)} saved={metricsSaved.find((x) => x.key === k)} dirty={dirty} />)
              )}
              {preview.data && preview.data.projection.warnings.length > 0 && (
                <div className="mt-3">
                  <WarningList warnings={preview.data.projection.warnings} />
                </div>
              )}
            </div>
          </Panel>
          {dirty && (
            <Panel>
              <PanelHeader title={`저장 전 변경 ${changes.length}건`} />
              <ul className="space-y-1.5 px-5 pb-5 text-[12.5px]">
                {changes.map((c) => (
                  <li key={c.key}>
                    <button className="flex w-full items-baseline justify-between gap-2 text-left hover:text-accent" onClick={() => setTab(c.tab)}>
                      <span className="text-muted">{c.label}</span>
                      <span className="num shrink-0 text-fg">{c.money ? `${manwon(client[c.key] as number)} → ${manwon(draft[c.key] as number)}` : typeof draft[c.key] === 'number' || typeof draft[c.key] === 'string' ? `${String(client[c.key])} → ${String(draft[c.key])}` : '수정됨'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>

      {/* 저장 전 변경이 있으면 화면 아래 고정 막대로 알린다 */}
      {dirty && (
        <div className="no-print sticky bottom-3 z-20 mx-5 mt-5 sm:mx-8 lg:mx-10">
          <div className="glass flex flex-wrap items-center gap-3 rounded-[20px] bg-white/85 px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-warn pulse-dot" />
            <span className="text-[13px]">저장하지 않은 변경 {changes.length}건 · 계산 결과에는 이미 반영되어 있습니다</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(client)}>
                변경 취소
              </Button>
              <Button size="sm" variant="primary" loading={saving} onClick={save}>
                <Save className="h-3.5 w-3.5" /> 저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FieldMoney({ id, label, value, saved, onChange }: { id: string; label: string; value: number; saved: number | undefined; onChange: (v: number) => void }) {
  const changed = saved != null && saved !== value
  return (
    <div>
      <Label htmlFor={id} hint={changed ? <span className="text-accent">저장값 {manwon(saved)}</span> : undefined}>
        {label}
      </Label>
      <NumberField id={id} value={value} min={0} onChange={onChange} className={cn(changed && '[&_input]:shadow-[inset_0_0_0_1px_var(--accent-line)]')} />
    </div>
  )
}

function MetricCompare({ now, saved, dirty }: { now: Metric | undefined; saved: Metric | undefined; dirty: boolean }) {
  if (!now) return null
  const changed = dirty && saved && saved.value !== now.value
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hair)] py-2 text-[13px] last:border-0" title={now.formula}>
      <span className="text-muted">{now.label}</span>
      <span className="num text-right">
        {changed && <span className="mr-1.5 text-[11.5px] text-dim line-through">{formatMetric(saved!.unit, saved!.value)}</span>}
        <span className={cn(changed ? 'text-accent' : 'text-fg')}>{formatMetric(now.unit, now.value)}</span>
      </span>
    </div>
  )
}
