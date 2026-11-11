// 결과 시각화. 모든 값은 Rust 엔진 응답에서 오며 여기서는 표시만 한다.
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/utils/format'
import { MODE_LABEL, STRATEGY_META, man, ym, ymShort } from '@/features/cpa/meta'
import type { Analysis, HeatCell, PathResult, Strategy, StrategyValue } from '@/features/cpa/types'
import { StrategyDot } from './ui'

const axis = { fontSize: 11, fill: 'var(--ink-3)' }
const tickMan = (v: number) => `${Math.round(v / 10_000).toLocaleString('ko-KR')}`

type Row = { month: string } & Partial<Record<Strategy, number | null>>

function TipBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[200px] rounded-xl border border-rule bg-card px-3 py-2.5 text-[12px] shadow-[0_12px_30px_-14px_rgba(0,0,0,.35)]">
      <div className="mb-1.5 font-semibold text-navy">{title}</div>
      {children}
    </div>
  )
}

/** 전략별 18개월 월말 가용현금 + 안전자금 기준선 + 최초 위반월 */
export function CashChart({ a, focus, onFocus, visible, height = 340, showMarkers = true }: { a: Analysis; focus: Strategy | null; onFocus?: (s: Strategy | null) => void; visible?: Strategy[]; height?: number; showMarkers?: boolean }) {
  const paths = a.short.filter((p) => (visible ? visible.includes(p.strategy) : true))
  const shown = paths.filter((p) => p.missing.length === 0)
  const data: Row[] = useMemo(
    () =>
      a.short[0].months.map((m, k) => {
        const r: Row = { month: m.month }
        for (const p of shown) r[p.strategy] = p.months[k].cash
        return r
      }),
    [a, shown],
  )
  const all = data.flatMap((r) => shown.map((p) => r[p.strategy] ?? 0))
  const lo = Math.min(0, a.inputs.safetyMin, ...all)
  const hi = Math.max(a.inputs.cash0, ...all)
  const pad = (hi - lo) * 0.08
  const byPath = (s: Strategy) => a.short.find((p) => p.strategy === s)!
  const last = data[data.length - 1]
  const months = new Set(data.map((d) => d.month))

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 18, right: 64, bottom: 4, left: 4 }} onMouseLeave={() => undefined}>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="month" tickFormatter={ymShort} tick={axis} tickLine={false} axisLine={{ stroke: 'var(--rule-strong)' }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tickFormatter={tickMan} tick={axis} tickLine={false} axisLine={false} width={46} domain={[Math.floor((lo - pad) / 1e6) * 1e6, Math.ceil((hi + pad) / 1e6) * 1e6]} />
          {lo < a.inputs.safetyMin && <ReferenceArea y1={Math.floor((lo - pad) / 1e6) * 1e6} y2={a.inputs.safetyMin} fill="var(--caution)" fillOpacity={0.05} />}
          <ReferenceLine y={a.inputs.safetyMin} stroke="var(--caution)" strokeWidth={1.5} strokeDasharray="6 4" label={{ value: `최소 안전자금 하한 ${man(a.inputs.safetyMin)}`, position: 'insideBottomLeft', style: { fontSize: 11, fontWeight: 600, fill: 'var(--caution)' } }} />
          {lo < 0 && <ReferenceLine y={0} stroke="var(--ink-3)" />}
          {showMarkers &&
            a.markers
              .filter((m) => months.has(m.month) && m.kind !== 'firstPay')
              .map((m) => <ReferenceLine key={m.kind + m.month} x={m.month} stroke="var(--rule-strong)" strokeDasharray="3 3" label={{ value: m.label, position: 'top', style: { fontSize: 10.5, fill: 'var(--ink-3)' } }} />)}
          <Tooltip
            cursor={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }}
            content={({ label, active }) => {
              if (!active || !label) return null
              const k = data.findIndex((d) => d.month === label)
              return (
                <TipBox title={`${ym(String(label))} 월말`}>
                  {shown.map((p) => {
                    const row = p.months[k]
                    return (
                      <div key={p.strategy} className={cn('flex items-center gap-2 py-0.5', focus && focus !== p.strategy && 'opacity-45')}>
                        <StrategyDot s={p.strategy} />
                        <span className="text-ink-2">{STRATEGY_META[p.strategy].short}</span>
                        <span className="text-[11px] text-ink-3">{MODE_LABEL[row.mode]}</span>
                        <span className={cn('t-num ml-auto font-semibold', row.cash < a.inputs.safetyMin ? 'text-caution' : 'text-ink')}>{man(row.cash)}</span>
                      </div>
                    )
                  })}
                </TipBox>
              )
            }}
          />
          {shown.map((p) => {
            const dim = focus != null && focus !== p.strategy
            return (
              <Line
                key={p.strategy}
                dataKey={p.strategy}
                name={STRATEGY_META[p.strategy].name}
                stroke={STRATEGY_META[p.strategy].color}
                strokeWidth={focus === p.strategy ? 3 : 2}
                strokeOpacity={dim ? 0.18 : 1}
                strokeDasharray={p.strategy === 'D' ? '6 4' : undefined}
                dot={false}
                activeDot={dim ? false : { r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                isAnimationActive={false}
                onClick={() => onFocus?.(focus === p.strategy ? null : p.strategy)}
                style={{ cursor: onFocus ? 'pointer' : undefined }}
                label={(props: { x?: number; y?: number; index?: number }) =>
                  props.index === data.length - 1 && !dim ? (
                    <text key={`l${p.strategy}`} x={(props.x ?? 0) + 8} y={(props.y ?? 0) + 4} fontSize={11.5} fontWeight={600} fill="var(--ink)">
                      {p.strategy} {man(last[p.strategy] ?? 0, false)}
                    </text>
                  ) : (
                    <g key={`n${p.strategy}${props.index}`} />
                  )
                }
              />
            )
          })}
          {shown
            .filter((p) => p.tau && (!focus || focus === p.strategy))
            .map((p) => (
              <ReferenceDot key={'t' + p.strategy} x={p.tau!} y={byPath(p.strategy).tauCash ?? 0} r={5.5} fill={STRATEGY_META[p.strategy].color} stroke="var(--card)" strokeWidth={2} label={{ value: `${p.strategy} 하한 도달 ${ymShort(p.tau!)}`, position: 'bottom', style: { fontSize: 11, fontWeight: 600, fill: 'var(--ink)' } }} />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 선택 전략의 월별 순현금흐름 */
export function NetBars({ p, height = 180 }: { p: PathResult; height?: number }) {
  const data = p.months.map((m) => ({ month: m.month, net: m.net, inflow: m.inflow, outflow: m.outflow, mode: m.mode }))
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barCategoryGap={3}>
          <CartesianGrid stroke="var(--rule)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={ymShort} tick={axis} tickLine={false} axisLine={{ stroke: 'var(--rule-strong)' }} minTickGap={18} />
          <YAxis tickFormatter={tickMan} tick={axis} tickLine={false} axisLine={false} width={46} domain={[(d: number) => Math.min(0, d), (d: number) => Math.max(0, d)]} />
          <ReferenceLine y={0} stroke="var(--ink-3)" />
          <Tooltip
            cursor={{ fill: 'var(--paper-2)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as (typeof data)[number]
              return (
                <TipBox title={`${ym(r.month)} · ${MODE_LABEL[r.mode]}`}>
                  <div className="flex justify-between gap-6">
                    <span className="text-ink-2">유입</span>
                    <span className="t-num">{man(r.inflow)}</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-ink-2">지출</span>
                    <span className="t-num">{man(r.outflow)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-6 border-t border-rule pt-1 font-semibold">
                    <span>순현금흐름</span>
                    <span className={cn('t-num', r.net < 0 ? 'text-caution' : 'text-good')}>{man(r.net)}</span>
                  </div>
                </TipBox>
              )
            }}
          />
          <Bar dataKey="net" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.net < 0 ? 'var(--alert)' : 'var(--good)'} fillOpacity={0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 첫 급여가 늦어져도 버틸 수 있는 기간(지연 내성) */
export function ToleranceBars({ a, delay, order = ['A', 'D', 'B'] }: { a: Analysis; delay?: number; order?: Strategy[] }) {
  const max = Math.max(9, ...a.tolerance.map((t) => (t.months ?? 0) + (t.openEnded ? 1 : 0)))
  return (
    <div className="space-y-2.5">
      {order.map((s) => {
        const t = a.tolerance.find((x) => x.strategy === s)!
        const m = t.months
        const ok = delay == null || (m != null && (m >= delay || t.openEnded))
        return (
          <div key={s} className="grid grid-cols-[88px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr]">
            <div className="flex items-center gap-2 text-[13px]">
              <StrategyDot s={s} />
              <span className="font-medium">
                {s} {STRATEGY_META[s].short}
              </span>
            </div>
            <div className="relative h-7 rounded-md bg-paper-2">
              <div className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-300" style={{ width: `${((m ?? 0) / max) * 100}%`, minWidth: m === 0 ? 3 : 0, background: STRATEGY_META[s].color, opacity: 0.85 }} />
              {delay != null && <div className="absolute inset-y-[-4px] w-[2px] bg-sky" style={{ left: `${(delay / max) * 100}%` }} aria-hidden />}
              <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-[12px] font-semibold">
                <span className={cn(ok ? 'text-ink' : 'text-caution')}>{m == null ? '발표 전 이미 하한 도달' : t.openEnded ? `${m}개월 이상 (분석 기간 끝까지)` : `${m}개월`}</span>
                {m != null && t.margin != null && !t.openEnded && <span className="font-normal text-ink-3">· 여유 {man(t.margin)}</span>}
              </div>
            </div>
          </div>
        )
      })}
      <div className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[110px_1fr]">
        <span />
        <div className="t-num flex justify-between text-[10.5px] text-ink-3">
          {Array.from({ length: Math.floor(max / 3) + 1 }, (_, k) => (
            <span key={k}>{k * 3}개월</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 60개월 현재가치 비교(가로 막대 + 결과 범위) */
export function ValueBars({ items }: { items: StrategyValue[] }) {
  const lo = Math.min(0, ...items.map((v) => v.range[0]))
  const hi = Math.max(...items.map((v) => v.range[1]))
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  return (
    <div className="space-y-3">
      {items.map((v) => (
        <div key={v.strategy} className="grid grid-cols-[96px_1fr] items-center gap-3 sm:grid-cols-[120px_1fr]">
          <div className="text-[13px]">
            <div className="flex items-center gap-2 font-medium">
              <StrategyDot s={v.strategy} /> {v.strategy} {STRATEGY_META[v.strategy].short}
            </div>
            <div className={cn('mt-0.5 text-[11px]', v.feasible ? 'text-good' : 'text-caution')}>{v.feasible ? (v.rank ? `순위 ${v.rank}` : '통과') : '18개월 탈락 · 순위 제외'}</div>
          </div>
          <div className="relative h-9">
            <div className="absolute inset-y-[14px] rounded-full bg-paper-2" style={{ left: `${x(v.range[0])}%`, width: `${Math.max(0.5, x(v.range[1]) - x(v.range[0]))}%` }} title="결과 상태·지연별 범위" />
            <div className={cn('absolute inset-y-[9px] rounded-[4px]', !v.feasible && 'hatch')} style={{ left: `${x(Math.min(0, v.value))}%`, width: `${Math.abs(x(v.value) - x(0))}%`, background: v.feasible ? STRATEGY_META[v.strategy].color : undefined, border: v.feasible ? undefined : `1.5px solid ${STRATEGY_META[v.strategy].color}` }} />
            <span className="t-num absolute top-0 text-[11.5px] font-semibold text-ink" style={{ left: `calc(${x(Math.max(0, v.value))}% + 6px)` }}>
              {man(v.value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** 60개월 기대 월말 잔액(가정 가중치) */
export function ExpectedCashChart({ months, items, safety, focus }: { months: string[]; items: StrategyValue[]; safety: number; focus: Strategy | null }) {
  const data = months.map((m, k) => {
    const r: Record<string, number | string> = { month: m }
    for (const v of items) r[v.strategy] = v.expectedCash[k]
    return r
  })
  return (
    <div className="h-[260px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 56, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--rule)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={ymShort} tick={axis} tickLine={false} axisLine={{ stroke: 'var(--rule-strong)' }} minTickGap={28} />
          <YAxis tickFormatter={tickMan} tick={axis} tickLine={false} axisLine={false} width={50} />
          <ReferenceLine y={safety} stroke="var(--caution)" strokeDasharray="6 4" />
          <Tooltip
            content={({ active, label }) => {
              if (!active || !label) return null
              const k = months.indexOf(String(label))
              return (
                <TipBox title={`${ym(String(label))} 기대 월말 잔액`}>
                  {items.map((v) => (
                    <div key={v.strategy} className="flex items-center gap-2 py-0.5">
                      <StrategyDot s={v.strategy} />
                      <span className="text-ink-2">{STRATEGY_META[v.strategy].short}</span>
                      <span className="t-num ml-auto font-semibold">{man(v.expectedCash[k])}</span>
                    </div>
                  ))}
                </TipBox>
              )
            }}
          />
          {items.map((v) => (
            <Line
              key={v.strategy}
              dataKey={v.strategy}
              stroke={STRATEGY_META[v.strategy].color}
              strokeWidth={focus === v.strategy ? 3 : 2}
              strokeOpacity={focus && focus !== v.strategy ? 0.18 : 1}
              strokeDasharray={v.strategy === 'D' ? '6 4' : undefined}
              dot={false}
              isAnimationActive={false}
              label={(p: { x?: number; y?: number; index?: number }) =>
                p.index === data.length - 1 ? (
                  <text key={'e' + v.strategy} x={(p.x ?? 0) + 6} y={(p.y ?? 0) + 4} fontSize={11.5} fontWeight={600} fill="var(--ink)">
                    {v.strategy}
                  </text>
                ) : (
                  <g key={`g${v.strategy}${p.index}`} />
                )
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** p × q 전략 우위 지도 */
export function Heatmap({ cells, steps, ignoreGate, p, q }: { cells: HeatCell[]; steps: number[]; ignoreGate: boolean; p: number; q: number }) {
  const at = (pp: number, qq: number) => cells.find((c) => c.p === pp && c.q === qq)
  const near = (v: number) => steps.reduce((b, s) => (Math.abs(s - v) < Math.abs(b - v) ? s : b), steps[0])
  const [cp, cq] = [near(p), near(q)]
  return (
    <div>
      <div className="flex">
        <div className="flex w-8 shrink-0 items-center justify-center">
          <span className="-rotate-90 text-[11px] whitespace-nowrap text-ink-3">수습 확보 조건 q →</span>
        </div>
        <div className="flex-1">
          <div className="grid gap-[1.5px]" style={{ gridTemplateColumns: `28px repeat(${steps.length}, minmax(0,1fr))` }}>
            {[...steps].reverse().map((qq) => (
              <div key={qq} className="contents">
                <div className="t-num flex items-center justify-end pr-1 text-[10.5px] text-ink-3">{qq % 10 === 0 ? qq : ""}</div>
                {steps.map((pp) => {
                  const c = at(pp, qq)
                  const w = c ? (ignoreGate ? c.winnerIgnoringGate : c.winner) : null
                  const here = pp === cp && qq === cq
                  return (
                    <div
                      key={pp}
                      title={`p=${pp}%, q=${qq}% → ${w ? `${w} ${STRATEGY_META[w].name}` : '통과 전략 없음'}`}
                      className={cn('grid aspect-[1.3] place-items-center rounded-[2px] text-[10px] font-bold text-white', !w && 'hatch bg-paper-2 text-ink-3', here && 'ring-2 ring-ink ring-offset-1')}
                      style={w ? { background: STRATEGY_META[w].color } : undefined}
                    >
                      {w ?? '–'}
                    </div>
                  )
                })}
              </div>
            ))}
            <div />
            {steps.map((pp) => (
              <div key={pp} className="t-num pt-1 text-center text-[10.5px] text-ink-3">
                {pp % 10 === 0 ? pp : ''}
              </div>
            ))}
          </div>
          <div className="mt-1 text-center text-[11px] text-ink-3">합격 조건 p (%) →</div>
        </div>
      </div>
    </div>
  )
}

/** 두 번의 소득 공백 타임라인(첫 화면) */
export function GapTimeline({ a, delay }: { a: Analysis; delay: number }) {
  const i = a.inputs
  const start = i.startMonth
  const total = 18
  const idx = (m: string) => {
    const [y, mm] = m.split('-').map(Number)
    const [sy, sm] = start.split('-').map(Number)
    return (y - sy) * 12 + (mm - sm)
  }
  const pay = idx(i.announceMonth) + 1 + delay
  const W = 1000
  const x = (k: number) => 40 + (Math.min(k, total) / total) * (W - 80)
  const support = [
    { from: 0, to: idx(i.supportReduceFrom), label: `가족 지원 월 ${man(i.supportInitial, false)}만` },
    { from: idx(i.supportReduceFrom), to: idx(i.supportStopFrom), label: `월 ${man(i.supportReduced, false)}만` },
    { from: idx(i.supportStopFrom), to: total, label: '지원 0원' },
  ]
  const points = [
    { k: 0, top: ym(start), sub: '지금' },
    { k: idx(i.supportReduceFrom), top: ym(i.supportReduceFrom), sub: '지원 감소' },
    { k: idx(i.examMonth), top: `${ym(i.examMonth)}*`, sub: '제2차 시험' },
    { k: idx(i.announceMonth), top: `${ym(i.announceMonth)}*`, sub: '발표 · 지원 0원' },
  ]
  const payLabel = pay > total ? `${ym(a.short[0].months[total - 1].month)} 이후` : ym(a.short[0].months[Math.max(0, pay)]?.month ?? start)
  return (
    <svg viewBox={`0 0 ${W} 190`} className="w-full" role="img" aria-label={`소득 공백 타임라인: 공백 1은 수험·발표 대기, 공백 2는 합격 후 첫 급여까지 ${delay}개월 추가 대기`}>
      <rect x={x(0)} y={14} width={x(idx(i.announceMonth)) - x(0)} height={44} rx={8} fill="#f0f0f2" />
      <text x={(x(0) + x(idx(i.announceMonth))) / 2} y={33} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--navy)">
        공백 ① 수험·발표 대기
      </text>
      <text x={(x(0) + x(idx(i.announceMonth))) / 2} y={50} textAnchor="middle" fontSize={11.5} fill="var(--ink-2)">
        정기 소득 없음 · 가족 지원은 두 번 줄어든다
      </text>
      <rect x={x(idx(i.announceMonth))} y={14} width={Math.max(6, x(pay) - x(idx(i.announceMonth)))} height={44} rx={6} fill="var(--sky-soft)" stroke="var(--sky)" strokeOpacity={0.4} />
      {(() => {
        const narrow = x(pay) - x(idx(i.announceMonth)) < 230
        const tx = narrow ? x(pay) + 12 : (x(idx(i.announceMonth)) + x(pay)) / 2
        const anchor = narrow ? 'start' : 'middle'
        return (
          <>
            <text x={tx} y={33} textAnchor={anchor} fontSize={14} fontWeight={600} fill="var(--sky)">
              공백 ② 합격 후 대기
            </text>
            <text x={tx} y={50} textAnchor={anchor} fontSize={11.5} fill="var(--ink-2)">
              수습처 확보·첫 급여까지 L={delay}개월
            </text>
          </>
        )
      })()}
      <line x1={x(0)} y1={88} x2={W - 24} y2={88} stroke="var(--rule-strong)" strokeWidth={2} />
      <path d={`M${W - 24} 83 L${W - 14} 88 L${W - 24} 93 Z`} fill="var(--rule-strong)" />
      {points.map((p, n) => {
        const close = n === points.length - 1 && pay - p.k <= 2
        const tx = close ? x(p.k) + 6 : x(p.k)
        const anchor = close ? 'end' : 'middle'
        return (
        <g key={p.sub}>
          <circle cx={x(p.k)} cy={88} r={6} fill="#ffffff" stroke="var(--sky)" strokeWidth={2} />
          <text x={tx} y={112} textAnchor={anchor} fontSize={12.5} fontWeight={600} fill="var(--ink)">
            {p.top}
          </text>
          <text x={tx} y={128} textAnchor={anchor} fontSize={11.5} fill="var(--ink-3)">
            {p.sub}
          </text>
        </g>
        )
      })}
      <g>
        <circle cx={x(pay)} cy={88} r={7} fill="var(--sky)" stroke="var(--card)" strokeWidth={2.5} />
        <text x={pay - idx(i.announceMonth) <= 2 ? x(pay) - 4 : Math.min(x(pay), W - 40)} y={112} textAnchor={pay - idx(i.announceMonth) <= 2 ? 'start' : 'middle'} fontSize={12.5} fontWeight={700} fill="var(--sky)">
          {payLabel}
        </text>
        <text x={pay - idx(i.announceMonth) <= 2 ? x(pay) - 4 : Math.min(x(pay), W - 40)} y={128} textAnchor={pay - idx(i.announceMonth) <= 2 ? 'start' : 'middle'} fontSize={11.5} fill="var(--sky)">
          첫 급여
        </text>
      </g>
      {support.map((s, k) => (
        <g key={k}>
          <rect x={x(s.from) + 1} y={148} width={Math.max(0, x(s.to) - x(s.from) - 2)} height={k === 2 ? 2 : 10 - k * 4} rx={2} fill={k === 2 ? 'var(--sky)' : 'var(--ink-3)'} opacity={k === 2 ? 0.6 : 0.55} transform={k === 1 ? 'translate(0,4)' : k === 2 ? 'translate(0,8)' : undefined} />
          <text x={(x(s.from) + x(s.to)) / 2} y={176} textAnchor="middle" fontSize={11.5} fill="var(--ink-2)">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
