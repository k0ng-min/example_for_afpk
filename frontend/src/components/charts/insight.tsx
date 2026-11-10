// 다각도 시각화: 모두 Rust 엔진 결과(MonthRow)나 고객 입력(pattern)만 그린다. 하드코딩된 수치 없음.
import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CashflowPattern, MonthRow } from '@/types/api'
import { cn, manwon, won } from '@/utils/format'
import { ChartFigure, SERIES, useSmallChart } from './index'

const axisProps = { stroke: 'var(--text-dim)', fontSize: 11, tickLine: false, axisLine: false, tick: { fill: 'var(--text-dim)' } } as const

/** 시뮬레이션 월(1부터) → 달력 월(1~12) */
export const calMonth = (start: number, m: number) => ((start - 1 + m - 1) % 12) + 1

// 현금흐름 구성 계열: 정체성(범주) 색은 검증된 SERIES 순서를 고정 사용
const FLOW = [
  { key: 'income', name: '소득', color: SERIES[0] },
  { key: 'inflow', name: '일회성 유입', color: SERIES[5] },
  { key: 'living', name: '생활비', color: SERIES[1] },
  { key: 'family', name: '가족지원', color: SERIES[3] },
  { key: 'debt', name: '부채상환', color: SERIES[4] },
  { key: 'outflow', name: '일회성 지출·사업 이전', color: SERIES[2] },
] as const

function FlowTooltip({ active, payload, label, start }: { active?: boolean; payload?: { dataKey: string; name: string; value: number; color: string }[]; label?: number; start?: number }) {
  if (!active || !payload?.length) return null
  const net = payload.find((p) => p.dataKey === 'net')
  return (
    <div className="glass min-w-[190px] rounded-[14px] bg-white/85 px-3.5 py-2.5 text-xs">
      <div className="mb-1 text-muted">
        {label}개월 차{start ? ` · ${calMonth(start, label ?? 1)}월` : ''}
      </div>
      {payload
        .filter((p) => p.dataKey !== 'net' && p.value !== 0)
        .map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num text-fg">{won(Math.abs(p.value))}</span>
          </div>
        ))}
      {net && (
        <div className="mt-1 flex justify-between gap-4 border-t border-[var(--hair)] pt-1">
          <span className="text-muted">순현금흐름</span>
          <span className={cn('num', net.value < 0 ? 'text-danger' : 'text-fg')}>{won(net.value)}</span>
        </div>
      )}
    </div>
  )
}

/** 월별 현금흐름 구성: 들어온 돈은 위, 나간 돈은 아래로 쌓고 순현금흐름은 선으로(단일 원 단위 축) */
export function FlowComposition({ rows, height = 260, months = 24, start, legend = true }: { rows: MonthRow[]; height?: number | string; months?: number; start?: number; legend?: boolean }) {
  const data = useMemo(
    () =>
      rows.slice(1, months + 1).map((r) => ({
        month: r.month,
        income: r.income,
        inflow: Math.max(r.oneTimeNet, 0),
        living: -r.livingExpenses,
        family: -r.familySupport,
        debt: -r.debtPayment,
        outflow: -(Math.max(-r.oneTimeNet, 0) + r.householdTransfer),
        net: r.netCashflow,
      })),
    [rows, months],
  )
  const used = FLOW.filter((f) => data.some((d) => d[f.key] !== 0))
  const small = useSmallChart()
  const ax = small ? { ...axisProps, fontSize: 10 } : axisProps
  const nets = data.map((d) => d.net)
  const neg = nets.filter((v) => v < 0).length
  const avg = nets.length ? Math.round(nets.reduce((a, v) => a + v, 0) / nets.length) : 0
  const minI = nets.indexOf(Math.min(...nets))
  const label = data.length
    ? `월별 현금흐름 구성 막대 그래프(${data.length}개월). 들어온 돈은 위, 나간 돈은 아래로 쌓음. 평균 순현금흐름 ${manwon(avg)}, 적자 ${neg}개월, 가장 낮은 달 ${data[minI].month}개월 차 ${manwon(nets[minI])}. 구성 항목: ${used.map((f) => f.name).join(', ')}.`
    : '월별 현금흐름 구성(데이터 없음)'
  return (
    <ChartFigure height={height} label={label}>
      <ResponsiveContainer>
        <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: small ? 6 : 12, bottom: 0, left: small ? 0 : 4 }} barCategoryGap={small ? 1 : 2}>
          <CartesianGrid stroke="var(--hair)" vertical={false} />
          <XAxis dataKey="month" {...ax} interval="preserveStartEnd" minTickGap={small ? 26 : 18} tickFormatter={(m) => (start ? `${calMonth(start, m)}월` : `${m}`)} />
          <YAxis {...ax} width={small ? 44 : 56} tickFormatter={(v) => manwon(v)} />
          <Tooltip content={<FlowTooltip start={start} />} cursor={{ fill: 'var(--accent-soft)' }} />
          {legend && !small && <Legend wrapperStyle={{ fontSize: 11.5, color: 'var(--text-muted)' }} iconType="square" iconSize={8} />}
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          {used.map((f, i) => (
            <Bar key={f.key} dataKey={f.key} name={f.name} stackId="flow" fill={f.color} fillOpacity={0.82} stroke="var(--s1)" strokeWidth={1} radius={i === 0 ? [3, 3, 0, 0] : 0} isAnimationActive animationDuration={380} />
          ))}
          <Line dataKey="net" name="순현금흐름" type="monotone" stroke="var(--text)" strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--s1)' }} isAnimationActive animationDuration={380} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFigure>
  )
}

/** 현금흐름 달력: 행 = 연차, 열 = 달력 월. 색 = 순현금흐름(양수 청색, 음수 분홍, 진할수록 큼) */
export function CashflowCalendar({ rows, start = 1 }: { rows: MonthRow[]; start?: number }) {
  const [hover, setHover] = useState<MonthRow | null>(null)
  const body = rows.slice(1)
  const max = Math.max(1, ...body.map((r) => Math.abs(r.netCashflow)))
  const years = Math.ceil(body.length / 12)
  const months = Array.from({ length: 12 }, (_, i) => calMonth(start, i + 1))
  const color = (v: number) => {
    const t = Math.min(1, Math.abs(v) / max)
    const pct = Math.round(12 + t * 70)
    return v < 0 ? `color-mix(in oklab, #c4547d ${pct}%, white)` : `color-mix(in oklab, #3060a8 ${pct}%, white)`
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-[3px] text-[11px]">
          <caption className="sr-only">
            현금흐름 달력: 행은 연차, 열은 달력 월, 칸 색은 순현금흐름(파랑 흑자, 분홍 적자). 적자 {body.filter((r) => r.netCashflow < 0).length}개월 / 전체 {body.length}개월.
          </caption>
          <thead>
            <tr>
              <th className="w-12" />
              {months.map((m, i) => (
                <th key={i} className="font-normal text-dim">
                  {m}월
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: years }, (_, y) => (
              <tr key={y}>
                <td className="pr-1 text-right whitespace-nowrap text-dim">{y + 1}년 차</td>
                {months.map((_, i) => {
                  const r = body[y * 12 + i]
                  if (!r) return <td key={i} />
                  return (
                    <td key={i} className="p-0">
                      <button
                        type="button"
                        onMouseEnter={() => setHover(r)}
                        onClick={() => setHover(r)}
                        onFocus={() => setHover(r)}
                        onMouseLeave={() => setHover(null)}
                        aria-label={`${r.month}개월 차 순현금흐름 ${won(r.netCashflow)}`}
                        className={cn('block h-7 w-full rounded-[6px] transition-transform hover:scale-[1.08] focus-ring', hover?.month === r.month && 'ring-2 ring-[var(--text)]')}
                        style={{ background: color(r.netCashflow) }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex min-h-[20px] flex-wrap items-center justify-between gap-2 px-1 text-[11.5px] text-dim">
        {hover ? (
          <span>
            <span className="text-fg">
              {hover.month}개월 차 · {calMonth(start, hover.month)}월
            </span>{' '}
            순현금흐름 <span className={cn('num', hover.netCashflow < 0 ? 'text-danger' : 'text-fg')}>{won(hover.netCashflow)}</span>
            {hover.oneTimeNet !== 0 && <> · 일회성 {won(hover.oneTimeNet)}</>}
          </span>
        ) : (
          <span>칸을 누르거나 마우스를 올리면 금액이 보여요</span>
        )}
        <span className="flex items-center gap-1.5">
          적자
          <span className="h-2.5 w-16 rounded-full" style={{ background: 'linear-gradient(90deg,#c4547d,#fff,#3060a8)' }} />
          흑자
        </span>
      </div>
    </div>
  )
}

/** 지출 구성: 기간 합계 기준 100% 막대(세그먼트 사이 2px 간격) + 범례 금액 */
export function SpendingMix({ rows, months = 12, compact = false }: { rows: MonthRow[]; months?: number; compact?: boolean }) {
  const body = rows.slice(1, months + 1)
  const parts = [
    { name: '생활비', color: SERIES[1], v: body.reduce((a, r) => a + r.livingExpenses, 0) },
    { name: '가족지원', color: SERIES[3], v: body.reduce((a, r) => a + r.familySupport, 0) },
    { name: '부채상환', color: SERIES[4], v: body.reduce((a, r) => a + r.debtPayment, 0) },
    { name: '일회성 지출', color: SERIES[2], v: body.reduce((a, r) => a + Math.max(-r.oneTimeNet, 0) + r.householdTransfer, 0) },
    { name: '저축 여력', color: SERIES[0], v: Math.max(0, body.reduce((a, r) => a + r.netCashflow, 0)) },
  ].filter((p) => p.v > 0)
  const total = parts.reduce((a, p) => a + p.v, 0) || 1
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.name} ${Math.round((p.v / total) * 100)}%`).join(', ')}>
        {parts.map((p) => (
          <div key={p.name} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.v / total) * 100}%`, background: p.color, opacity: 0.85, transition: 'width 400ms ease' }} title={`${p.name} ${won(p.v)}`} />
        ))}
      </div>
      <ul className={cn('mt-2.5 grid gap-x-4 gap-y-1 text-[11.5px]', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
        {parts.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num text-fg">{Math.round((p.v / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 1년 현금 리듬: 고객 입력(pattern)의 달력 월별 변동지출 계절성 막대 + 정기 유입(▲)·유출(▼) 표시 */
export function AnnualRhythm({ pattern }: { pattern: CashflowPattern }) {
  const season = pattern.variableExpenseSeasonBps.length === 12 ? pattern.variableExpenseSeasonBps : Array(12).fill(0)
  const maxAbs = Math.max(1, ...season.map(Math.abs))
  const peak = season.indexOf(Math.max(...season)) + 1
  const low = season.indexOf(Math.min(...season)) + 1
  const rhythmLabel = `1년 현금 리듬: 변동지출이 가장 많은 달 ${peak}월(${(season[peak - 1] / 100).toFixed(0)}%), 가장 적은 달 ${low}월(${(season[low - 1] / 100).toFixed(0)}%). 정기 유입 ${pattern.annualInflows.length}건, 연간 지출 ${pattern.annualOutflows.length}건(아래 목록).`
  return (
    <div>
      <div className="grid grid-cols-12 gap-0.5 sm:gap-1.5" role="img" aria-label={rhythmLabel}>
        {season.map((bps, i) => {
          const m = i + 1
          const ins = pattern.annualInflows.filter((x) => x.calendarMonth === m)
          const outs = pattern.annualOutflows.filter((x) => x.calendarMonth === m)
          const h = (Math.abs(bps) / maxAbs) * 34
          const tip = [`${m}월 변동지출 ${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(0)}%`, ...ins.map((x) => `▲ ${x.name} ${won(x.amount)}`), ...outs.map((x) => `▼ ${x.name} ${won(x.amount)}`)].join('\n')
          return (
            <div key={m} className="flex flex-col items-center" title={tip}>
              <div className="flex h-4 items-end gap-0.5 text-[10px] leading-none">
                {ins.length > 0 && <span className="text-[#3060a8]">▲</span>}
                {outs.length > 0 && <span className="text-[#c4547d]">▼</span>}
              </div>
              <div className="relative h-[72px] w-full">
                <div className="absolute top-1/2 right-0 left-0 h-px bg-[var(--hair-strong)]" />
                <div
                  className="absolute left-1/2 w-[60%] -translate-x-1/2 rounded-[3px]"
                  style={{ height: Math.max(2, h), background: bps >= 0 ? '#c4547d' : '#3060a8', opacity: 0.55, ...(bps >= 0 ? { bottom: '50%' } : { top: '50%' }) }}
                />
              </div>
              <span className="mt-1 text-[10px] text-dim sm:text-[10.5px]">
                {m}
                <span className="hidden sm:inline">월</span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pattern.annualInflows.map((x, i) => (
          <span key={'i' + i} className="rounded-full bg-[color-mix(in_oklab,#3060a8_10%,white)] px-2.5 py-1 text-[11px] text-[#2c4f86]">
            ▲ {x.calendarMonth}월 {x.name} {manwon(x.amount)}
          </span>
        ))}
        {pattern.annualOutflows.map((x, i) => (
          <span key={'o' + i} className="rounded-full bg-[color-mix(in_oklab,#c4547d_10%,white)] px-2.5 py-1 text-[11px] text-[#9c3c60]">
            ▼ {x.calendarMonth}월 {x.name} {manwon(x.amount)}
          </span>
        ))}
      </div>
    </div>
  )
}
