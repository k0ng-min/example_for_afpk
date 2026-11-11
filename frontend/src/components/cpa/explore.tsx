// "무엇이 결과를 바꾸나" 탭: 민감도(토네이도), 18개월 돈의 흐름(폭포), 공적 지원·대출 비교.
// 숫자는 모두 Rust 엔진(/api/cpa/explore, /api/cpa/analyze) 결과이며, 폭포 그래프는 엔진의 월별 행을 합산해 보여 주기만 한다.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, HandCoins, Landmark, Minus, Plus } from 'lucide-react'
import { cn } from '@/utils/format'
import { cpaApi } from '@/features/cpa/store'
import { STRATEGY_META, man, ym } from '@/features/cpa/meta'
import type { Analysis, CpaInputs, Explore, ExtraFlow, SensitivityRow, Strategy, StressEffect, SupportOption } from '@/features/cpa/types'
import { Help, Interpretation, Prov, SectionHead, Skel, StrategyBadge } from './ui'

type P = { a: Analysis; i: CpaInputs; set: (p: Partial<CpaInputs>) => void }

export function useExplore(i: CpaInputs) {
  const [data, setData] = useState<Explore | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const key = JSON.stringify(i)
  useEffect(() => {
    const ctl = new AbortController()
    const t = setTimeout(() => {
      cpaApi
        .explore(i, ctl.signal)
        .then((d) => {
          setData(d)
          setErr(null)
        })
        .catch((e: unknown) => {
          if (!ctl.signal.aborted) setErr(String(e))
        })
    }, 150)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { data, err }
}

const months = (v: number | null, cap: number) => (v == null ? `${cap}개월 이상` : `${v}개월`)

export function ExploreTab({ a, i, set }: P) {
  const { data, err } = useExplore(i)
  return (
    <div className="space-y-6">
      {err && <div className="rounded-xl bg-caution-soft px-4 py-3 text-[13px] text-caution">탐색 계산을 불러오지 못했습니다: {err}</div>}
      {data ? <Tornado d={data} /> : <Skel className="h-[320px]" />}
      {data ? <StressTable d={data} /> : <Skel className="h-[360px]" />}
      <Waterfall a={a} />
      {data ? <Supports d={data} i={i} set={set} /> : <Skel className="h-[360px]" />}
    </div>
  )
}

/* ── 1. 민감도: 무엇이 버팀 기간을 가장 크게 바꾸나 ── */
function Tornado({ d }: { d: Explore }) {
  const s = d.sensitivity
  const cap = s.horizon
  const base = s.runwayBase ?? cap
  const val = (v: number | null) => v ?? cap
  const rows = [...s.rows].sort((x, y) => Math.abs(val(y.runwayHigh) - val(y.runwayLow)) - Math.abs(val(x.runwayHigh) - val(x.runwayLow)) || Math.abs(y.endHigh - y.endLow) - Math.abs(x.endHigh - x.endLow))
  const span = Math.max(2, ...rows.flatMap((r) => [Math.abs(val(r.runwayLow) - base), Math.abs(val(r.runwayHigh) - base)]))
  const top = rows[0]
  return (
    <section className="card p-4 sm:p-5">
      <SectionHead
        title="무엇이 '버틸 수 있는 기간'을 가장 크게 바꾸나"
        help="각 조건을 하나씩만 20% 낮추거나 높여(지원 종료는 3개월 앞당기거나 늦춰) Rust 엔진으로 다시 계산했습니다. 기준은 공부만 계속할 때(A) 비상금 하한 아래로 내려가기 전까지 버티는 개월 수입니다."
        right={<Prov kind="engine" />}
        className="mb-3"
      />
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
        <span className="text-ink-2">지금 가정으로 공부만 하면</span>
        <span className="t-num text-[22px] font-semibold text-navy">{months(s.runwayBase, cap)}</span>
        <span className="text-ink-3">버틸 수 있습니다 · 18개월 말 잔액 {man(s.endBase)}</span>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[96px_1fr] gap-3 text-[11px] text-ink-3 sm:grid-cols-[170px_1fr_150px]">
          <span />
          <div className="relative flex justify-between">
            <span>← 버팀 기간 줄어듦</span>
            <span>늘어남 →</span>
          </div>
          <span className="hidden text-right sm:block">18개월 말 잔액 변화</span>
        </div>
        {rows.map((r) => (
          <TornadoRow key={r.key} r={r} base={base} span={span} cap={cap} endBase={s.endBase} />
        ))}
      </div>
      <Interpretation className="mt-4">
        가장 큰 변수는 <b>{top.label}</b>입니다. {describe(top, cap)} 그래서 실행 계획은 이 값을 매달 가장 먼저 점검합니다. 비상금 하한처럼 막대가 거의 없는 항목은 “버팀 기간”보다 “언제 경보를 울릴지”를 바꾸는 값입니다.
      </Interpretation>
    </section>
  )
}

const PHRASE: Record<string, string> = { '-20%': '20% 줄면', '+20%': '20% 늘면', '3개월 빨리': '3개월 빨리 끊기면', '3개월 늦게': '3개월 늦게 끊기면' }

function describe(r: SensitivityRow, cap: number) {
  const f = (v: number | null) => (v == null ? `${cap}개월 이상` : `${v}개월`)
  return `${PHRASE[r.lowLabel] ?? r.lowLabel} ${f(r.runwayLow)}, ${PHRASE[r.highLabel] ?? r.highLabel} ${f(r.runwayHigh)}으로 바뀝니다.`
}

function TornadoRow({ r, base, span, cap, endBase }: { r: SensitivityRow; base: number; span: number; cap: number; endBase: number }) {
  const pts = [
    { v: r.runwayLow ?? cap, label: r.lowLabel, end: r.endLow },
    { v: r.runwayHigh ?? cap, label: r.highLabel, end: r.endHigh },
  ]
  const pos = (v: number) => 50 + ((v - base) / span) * 46
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[170px_1fr_150px]">
      <span className="text-[12.5px] leading-tight font-medium text-ink sm:truncate sm:text-[13px]">{r.label}</span>
      <div className="relative h-9 rounded-lg bg-paper-2/70">
        <div className="absolute inset-y-1 left-1/2 w-px bg-ink/40" />
        {pts.map((p) => {
          if (p.v === base) return null
          const l = Math.min(pos(p.v), 50)
          const w = Math.abs(pos(p.v) - 50)
          const up = p.v > base
          return (
            <div key={p.label} className={cn('absolute top-1.5 h-6 rounded-[4px]', up ? 'bg-good/80' : 'bg-alert/75')} style={{ left: `${l}%`, width: `${w}%` }} title={`${r.label} ${p.label} → ${p.v}개월`}>
              <span className={cn('absolute top-1/2 hidden -translate-y-1/2 text-[11px] whitespace-nowrap text-ink sm:inline', up ? 'left-full ml-1.5' : 'right-full mr-1.5')}>
                {p.label} → <b className="t-num">{p.v >= cap ? `${cap}+` : p.v}개월</b>
              </span>
            </div>
          )
        })}
        {pts.every((p) => p.v === base) && <span className="absolute top-1/2 left-1/2 ml-2 -translate-y-1/2 text-[11px] text-ink-3">±20%에도 버팀 기간 변화 없음</span>}
      </div>
      <span className="t-num hidden text-right text-[12px] text-ink-2 sm:block">
        {signed(r.endLow - endBase)} / {signed(r.endHigh - endBase)}
      </span>
      <span className="col-start-2 text-[11px] text-ink-3 sm:hidden">
        {pts.map((p) => `${p.label} ${p.v >= cap ? `${cap}+` : p.v}개월`).join(' · ')}
      </span>
    </div>
  )
}

const signed = (v: number) => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${man(Math.abs(v))}`)

/* ── 2. 18개월 돈의 흐름(폭포) ── */
function Waterfall({ a }: { a: Analysis }) {
  const [s, setS] = useState<Strategy>('A')
  const path = a.short.find((p) => p.strategy === s)!
  const steps = useMemo(() => {
    const sum = (f: (r: (typeof path.months)[number]) => number) => path.months.reduce((t, r) => t + f(r), 0)
    const list: { label: string; v: number; kind: 'total' | 'in' | 'out' }[] = [
      { label: '시작 잔액', v: a.inputs.cash0, kind: 'total' },
      { label: '가족 지원', v: sum((r) => r.support), kind: 'in' },
      { label: '근로·급여', v: sum((r) => r.partTime + r.wage + r.trainee + r.base), kind: 'in' },
      { label: '지원·기타', v: sum((r) => r.extra), kind: 'in' },
      { label: '생활비', v: -sum((r) => r.living), kind: 'out' },
      { label: '수험비', v: -sum((r) => r.exam), kind: 'out' },
      { label: '부채·상환', v: -sum((r) => r.debt + r.icl), kind: 'out' },
    ].filter((x) => x.kind === 'total' || x.v !== 0) as { label: string; v: number; kind: 'total' | 'in' | 'out' }[]
    return list
  }, [a, path])
  const end = path.endCash
  // 막대 좌표
  let run = 0
  const bars = steps.map((st) => {
    const from = st.kind === 'total' ? 0 : run
    const to = st.kind === 'total' ? st.v : run + st.v
    run = to
    return { ...st, from, to }
  })
  bars.push({ label: '18개월 말', v: end, kind: 'total', from: 0, to: end })
  const lo = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]))
  const hi = Math.max(...bars.flatMap((b) => [b.from, b.to]))
  const W = 1100
  const H = 300
  const padT = 22
  const padB = 34
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * (H - padT - padB)
  const bw = W / bars.length
  const outTotal = -steps.filter((x) => x.kind === 'out').reduce((t, x) => t + x.v, 0)
  const livingShare = outTotal > 0 ? Math.round((-(steps.find((x) => x.label === '생활비')?.v ?? 0) / outTotal) * 100) : 0
  return (
    <section className="card p-4 sm:p-5">
      <SectionHead
        title="18개월 동안 돈은 어디서 와서 어디로 가나"
        help="엔진이 계산한 월별 유입·지출을 18개월 동안 합산했습니다. 초록은 들어온 돈, 붉은색은 나간 돈, 검은 막대는 잔액입니다."
        right={
          <div className="flex gap-1">
            {(['A', 'B', 'C', 'D'] as Strategy[]).map((k) => (
              <button key={k} onClick={() => setS(k)} aria-pressed={s === k} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]', s === k ? 'border-ink bg-ink text-white' : 'border-rule bg-white text-ink-2 hover:border-ink-3')}>
                <StrategyBadge s={k} className="h-4 w-4 rounded text-[9px]" />
                {STRATEGY_META[k].name}
              </button>
            ))}
          </div>
        }
        className="mb-2"
      />
      {path.missing.length > 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-3">이 전략은 임금 입력이 필요해 계산하지 않았습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[620px]" role="img" aria-label={`${STRATEGY_META[s].name} 18개월 돈의 흐름`}>
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" />
            {bars.map((b, k) => {
              const top = y(Math.max(b.from, b.to))
              const h = Math.max(2, Math.abs(y(b.from) - y(b.to)))
              const fill = b.kind === 'total' ? (b.to < 0 ? 'var(--alert)' : 'var(--ink)') : b.kind === 'in' ? 'var(--good)' : 'var(--alert)'
              const x = k * bw + bw * 0.18
              return (
                <g key={b.label}>
                  {k > 0 && b.kind !== 'total' && <line x1={(k - 1) * bw + bw * 0.82} x2={x} y1={y(b.from)} y2={y(b.from)} stroke="var(--ink-3)" strokeDasharray="3 3" />}
                  <rect x={x} y={top} width={bw * 0.64} height={h} rx={4} fill={fill} opacity={b.kind === 'total' ? 0.92 : 0.8}>
                    <title>{`${b.label}: ${b.kind === 'out' ? '−' : b.kind === 'in' ? '+' : ''}${man(Math.abs(b.v))}`}</title>
                  </rect>
                  <text x={x + bw * 0.32} y={top - 6} textAnchor="middle" fontSize="11.5" fill="var(--ink)" className="t-num">
                    {b.kind === 'out' ? '−' : b.kind === 'in' ? '+' : b.v < 0 ? '−' : ''}
                    {man(Math.abs(b.v))}
                  </text>
                  <text x={x + bw * 0.32} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--ink-2)">
                    {b.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
      <Interpretation className="mt-3">
        {STRATEGY_META[s].name}에서 18개월 동안 나가는 돈의 <b>{livingShare}%</b>가 생활비입니다. 시작 잔액 {man(a.inputs.cash0)}이 18개월 뒤 <b>{man(end)}</b>
        {end < 0 ? '으로 마이너스가 됩니다 — 들어오는 돈 없이 공부만 하면 비상금이 아니라 생활비 자체가 모자랍니다.' : '이 됩니다.'}
      </Interpretation>
    </section>
  )
}

/* ── 3. 공적 지원·정책 대출 ── */
function sameFlows(x: ExtraFlow[] | undefined, y: ExtraFlow[]) {
  return y.every((f) => (x ?? []).some((g) => g.label === f.label && g.from === f.from && g.amount === f.amount && g.months === f.months))
}

function Supports({ d, i, set }: { d: Explore; i: CpaInputs; set: (p: Partial<CpaInputs>) => void }) {
  const S = d.supports
  const baseA = S.base.find((e) => e.strategy === 'A')!
  const baseD = S.base.find((e) => e.strategy === 'D')!
  const toggle = (o: SupportOption, on: boolean) => {
    const cur = i.extraFlows ?? []
    const labels = new Set(o.flows.map((f) => f.label))
    set({ extraFlows: on ? [...cur.filter((f) => !labels.has(f.label)), ...o.flows] : cur.filter((f) => !labels.has(f.label)) })
  }
  const active = (i.extraFlows ?? []).length > 0
  return (
    <section className="card p-4 sm:p-5">
      <SectionHead
        title="공적 지원·정책 대출을 받으면 얼마나 더 버틸까"
        help="이 고객 조건(만 27세 전후·미취업 수험생·서울 거주 가정)에 해당할 수 있는 제도를 하나씩 넣어 Rust 엔진으로 다시 계산했습니다. 선정·지급이 확인되지 않았으므로 기본 계획에는 넣지 않습니다."
        right={<Prov kind="validate" />}
        className="mb-2"
      />
      <div className="mb-4 rounded-xl border border-caution/30 bg-caution-soft px-4 py-2.5 text-[12.5px] text-ink">
        <b className="text-caution">받기 전에는 계획에 넣지 않습니다.</b> AI 검증 실험 E5에서 AI가 자격 확인 없이 청년수당·월세지원을 수입에 넣은 것이 바로 이 실수입니다.{' '}
        <Link to="/verification" className="font-medium underline underline-offset-2">
          E5 보기
        </Link>
        {active && <span className="ml-1 font-semibold">현재 지원 가정이 계산에 들어가 있습니다(모든 화면에 반영됨).</span>}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {S.options.map((o) => {
          const on = sameFlows(i.extraFlows, o.flows)
          const A = o.effects.find((e) => e.strategy === 'A')!
          const D = o.effects.find((e) => e.strategy === 'D')!
          const gain = (o.runway ?? d.sensitivity.horizon) - (S.baseRunway ?? d.sensitivity.horizon)
          return (
            <div key={o.id} className={cn('flex flex-col rounded-2xl border p-4', on ? 'border-ink bg-white shadow-[0_10px_30px_-18px_rgba(0,0,0,.5)]' : 'border-rule bg-white/80')}>
              <div className="flex items-center gap-2">
                <span className={cn('grid h-8 w-8 place-items-center rounded-full', o.kind === 'loan' ? 'bg-caution-soft text-caution' : 'bg-good-soft text-good')}>{o.kind === 'loan' ? <Landmark className="h-4 w-4" /> : <HandCoins className="h-4 w-4" />}</span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-navy">{o.name}</div>
                  <div className={cn('text-[11.5px] font-medium', o.kind === 'loan' ? 'text-caution' : 'text-good')}>{o.kind === 'loan' ? '대출 · 갚아야 하는 돈' : '지원금 · 갚지 않는 돈'}</div>
                </div>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-2">{o.summary}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-paper-2 px-3 py-2.5 text-center">
                <div>
                  <div className="text-[11px] text-ink-3">공부만 할 때 버팀</div>
                  <div className="t-num text-[15px] font-semibold text-ink">
                    {months(S.baseRunway, d.sensitivity.horizon)} → {months(o.runway, d.sensitivity.horizon)}
                  </div>
                  <div className={cn('text-[11.5px] font-semibold', gain > 0 ? 'text-good' : 'text-ink-3')}>{gain > 0 ? `+${gain}개월` : '변화 없음'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-3">규칙대로 전환(D) 최저 잔액</div>
                  <div className="t-num text-[15px] font-semibold text-ink">
                    {man(baseD.minCash)} → {man(D.minCash)}
                  </div>
                  <div className="text-[11.5px] text-ink-3">공부만: {baseA.tau ? ym(baseA.tau) : '없음'} → {A.tau ? ym(A.tau) : '부족 없음'}</div>
                </div>
              </div>
              <div className="mt-2 text-[11.5px] text-ink-3">
                18개월 유입 {man(o.totalIn)}
                {o.totalOut > 0 && <> · 이자 유출 {man(o.totalOut)}</>}
              </div>
              <dl className="mt-2 space-y-1 text-[12px]">
                <div>
                  <dt className="inline font-semibold text-ink">조건 </dt>
                  <dd className="inline text-ink-2">{o.conditions}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-caution">주의 </dt>
                  <dd className="inline text-ink-2">{o.caution}</dd>
                </div>
              </dl>
              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                <a href={o.sourceUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 truncate text-[11.5px] text-ink-3 hover:text-ink">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{o.source}</span>
                </a>
                <button onClick={() => toggle(o, !on)} className={cn('flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold', on ? 'border border-rule bg-white text-ink' : 'btn-primary')}>
                  {on ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {on ? '계산에서 빼기' : '이 가정으로 계산'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 flex items-center gap-1 text-[11.5px] text-ink-3">
        금액·조건은 2026년 공고·보도 기준이며 2027년 모집·선정은 확인 전입니다. 신청 전 고용24·서울청년포털·서민금융진흥원에서 확인하세요.
        <Help>대출은 원금이 들어오는 달에 잔액이 늘지만, 이자와 원금을 수습 급여 이후 갚아야 합니다. 그래서 같은 금액이라도 지원금과 대출은 다르게 표시합니다.</Help>
      </p>
    </section>
  )
}

/* ── 4. 스트레스 테스트: 나쁜 일이 생기면 어느 전략이 버티나 ── */
function StressCell({ e }: { e: StressEffect }) {
  if (e.missing) return <span className="block rounded-lg bg-paper-2 px-2 py-1.5 text-center text-[11.5px] text-ink-3">입력 필요</span>
  const bad = e.insolvent ?? e.tau
  return (
    <span className={cn('block rounded-lg px-2 py-1.5 text-center', e.insolvent ? 'bg-alert-soft text-alert' : bad ? 'bg-caution-soft text-caution' : 'bg-good-soft text-good')}>
      <span className="block text-[12px] font-semibold">{e.insolvent ? `${ym(e.insolvent)} 생활비 부족` : bad ? `${ym(bad)} 비상금 부족` : '버팀'}</span>
      <span className="t-num block text-[11px] opacity-80">최저 {man(e.minCash)}</span>
    </span>
  )
}

function StressTable({ d }: { d: Explore }) {
  const all = [d.stress.base, ...d.stress.cases]
  const survivors = (c: (typeof all)[number]) => c.effects.filter((e) => !e.missing && !e.tau && !e.insolvent).map((e) => e.strategy)
  const worst = d.stress.cases[d.stress.cases.length - 1]
  const worstOk = survivors(worst)
  return (
    <section className="card p-4 sm:p-5">
      <SectionHead
        title="나쁜 일이 생기면 어느 선택지가 버티나 (스트레스 테스트)"
        help="자주 생기는 충격을 하나씩, 그리고 모두 한꺼번에 넣어 네 전략의 18개월을 Rust 엔진으로 다시 계산했습니다. 초록 = 18개월 동안 비상금 하한 유지, 앰버 = 하한 아래로 내려가는 달, 코랄 = 그 달 생활비를 낼 돈이 없음."
        right={<Prov kind="engine" />}
        className="mb-3"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-1 text-[12.5px]">
          <thead>
            <tr className="text-ink-3">
              <th className="px-2 py-1 text-left font-normal">상황</th>
              {(['A', 'B', 'C', 'D'] as Strategy[]).map((s) => (
                <th key={s} className="px-1 py-1 font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <StrategyBadge s={s} className="h-5 w-5 text-[10px]" />
                    {STRATEGY_META[s].name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((c) => (
              <tr key={c.id}>
                <td className={cn('rounded-lg px-2 py-1.5 align-middle', c.id === 'base' ? 'bg-ink text-white' : c.id === 'all' ? 'bg-paper-2 font-semibold' : '')}>
                  <div className="font-medium">{c.label}</div>
                  <div className={cn('text-[11px]', c.id === 'base' ? 'text-white/70' : 'text-ink-3')}>{c.detail}</div>
                </td>
                {c.effects.map((e) => (
                  <td key={e.strategy} className="align-middle">
                    <StressCell e={e} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Interpretation className="mt-3">
        다섯 가지 충격이 한꺼번에 와도 18개월 동안 버티는 선택지는 <b>{worstOk.length ? worstOk.map((s) => STRATEGY_META[s].name).join('·') : '없습니다'}</b>
        {worstOk.length ? '입니다.' : '.'} 조건부 전환(D)은 충격이 오면 점검선에 더 빨리 닿아 아르바이트·구직을 앞당기므로, 같은 충격에서도 대응이 자동으로 빨라집니다. 그래서 이 사례는 하나의 정답 대신 “언제 바꿀지”의 규칙을 권합니다.
      </Interpretation>
    </section>
  )
}
