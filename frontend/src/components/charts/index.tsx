// 차트는 모두 Rust 엔진 계산 결과(rows)만 시각화한다. 입력과 무관한 하드코딩 데이터 없음.
// 범주형 색상 순서는 dataviz 검증기(다크·라이트 모두 PASS)로 확인한 팔레트.
import { useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table2 } from 'lucide-react'
import type { GoalResult, MonthRow } from '@/types/api'
import { manwon, won } from '@/utils/format'
import { Panel, PanelHeader } from '@/components/ui'
import { useMediaQuery } from '@/hooks/useMediaQuery'

// 검증기 통과 팔레트(밝은 유리 면 #EEF2F7 기준: 명도·채도·색각 이상 구분·대비 모두 PASS)
export const SERIES = ['#3060a8', '#7e60c6', '#20907a', '#b57d22', '#c4547d', '#2f93c9']
const POS = '#5f7fae'
const NEG = '#c4547d'

const axisProps = { stroke: 'var(--text-dim)', fontSize: 11, tickLine: false, axisLine: false, tick: { fill: 'var(--text-dim)' } } as const
const axisSmall = { ...axisProps, fontSize: 10 } as const

/** 좁은 화면(640px 미만) 여부: 축 글자·축 폭·범례를 줄인다 */
export function useSmallChart() {
  return useMediaQuery('(max-width: 639px)')
}

/** 차트 접근성: SVG 차트는 스크린리더가 읽지 못하므로 핵심 수치를 요약한 대체 텍스트를 붙인다 */
export function ChartFigure({ label, height, children }: { label: string; height: number | string; children: ReactNode }) {
  return (
    <figure role="img" aria-label={label} className="m-0" style={{ height }}>
      {children}
    </figure>
  )
}

function TooltipBox({ active, payload, label, unit = '개월 차' }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number | string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass min-w-[170px] rounded-[14px] bg-white/80 px-3.5 py-2.5 text-xs">
      <div className="mb-1 text-muted">
        {label}
        {typeof label === 'number' ? unit : ''}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num text-fg">{won(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function ChartFrame({ title, description, children, table, actions }: { title: string; description?: string; children: ReactNode; table?: { columns: string[]; rows: (string | number)[][] }; actions?: ReactNode }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Panel className="print-avoid min-w-0">
      <PanelHeader
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {table && (
              <button onClick={() => setShowTable((v) => !v)} className="no-print flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] text-dim hover:bg-white/70 hover:text-fg focus-ring" aria-pressed={showTable}>
                <Table2 className="h-3.5 w-3.5" /> {showTable ? '차트 보기' : '표 보기'}
              </button>
            )}
          </>
        }
      />
      <div className="px-3 pb-4">
        {showTable && table ? (
          <div className="max-h-[260px] overflow-auto px-2">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-white/90">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="py-1.5 pr-3 text-left font-medium text-muted">
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
    </Panel>
  )
}

export type Series = { id: string; name: string; color: string; values: number[] }

/** 다중 시나리오 라인(동일 단위, 단일 축) */
export function LinesChart({ series, height = 260, zeroLine = true, refY, refLabel, bands, emphasis, ghost, compact = false }: { series: Series[]; height?: number | string; compact?: boolean; zeroLine?: boolean; refY?: number; refLabel?: string; bands?: { from: number; to: number; label: string }[]; emphasis?: string | null; ghost?: { name: string; values: number[] } | null }) {
  const data = useMemo(() => {
    const n = Math.max(0, ...series.map((s) => s.values.length))
    return Array.from({ length: n }, (_, m) => {
      const row: Record<string, number> = { month: m }
      for (const s of series) if (s.values[m] != null) row[s.id] = s.values[m]
      if (ghost?.values[m] != null) row.__ghost = ghost.values[m]
      return row
    })
  }, [series, ghost])
  const small = useSmallChart()
  const ax = small ? axisSmall : axisProps
  const label =
    '경과 개월별 금액 선 그래프(가로축 개월, 세로축 원). ' +
    series
      .map((s) => {
        const v = s.values
        if (!v.length) return `${s.name}: 값 없음`
        return `${s.name}: 시작 ${manwon(v[0])}, ${v.length - 1}개월 후 ${manwon(v[v.length - 1])}, 최저 ${manwon(Math.min(...v))}`
      })
      .join('. ')
  return (
    <ChartFigure label={label} height={height}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: small ? 8 : 16, bottom: 0, left: small ? 0 : 4 }}>
          <CartesianGrid stroke="var(--hair)" vertical={false} />
          <XAxis dataKey="month" {...ax} tickFormatter={(m) => `${m}`} interval="preserveStartEnd" minTickGap={small ? 30 : 24} />
          <YAxis {...ax} width={small ? 44 : 56} tickFormatter={(v) => manwon(v)} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: 'var(--line-strong)' }} />
          {!compact && !small && (series.length > 1 || ghost) && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} iconType="plainline" />}
          {bands?.map((b) => (
            <ReferenceArea key={b.label + b.from} x1={b.from} x2={b.to} fill="var(--accent)" fillOpacity={0.06} label={{ value: b.label, position: 'insideTopLeft', fill: 'var(--text-muted)', fontSize: 11 }} />
          ))}
          {zeroLine && <ReferenceLine y={0} stroke="var(--danger)" strokeOpacity={0.5} strokeDasharray="4 4" />}
          {refY != null && <ReferenceLine y={refY} stroke="var(--warn)" strokeOpacity={0.7} strokeDasharray="2 4" label={{ value: refLabel, fill: 'var(--text-muted)', fontSize: 11, position: 'insideBottomRight' }} />}
          {ghost && <Line type="monotone" dataKey="__ghost" name={ghost.name} stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 5" dot={false} activeDot={false} isAnimationActive={false} />}
          {series.map((s) => {
            const faded = !!emphasis && emphasis !== s.id
            return <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={s.color} strokeOpacity={faded ? 0.3 : 1} strokeWidth={faded ? 1.25 : emphasis === s.id ? 2.25 : 1.75} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--s1)' }} isAnimationActive animationDuration={350} />
          })}
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  )
}

/** 월별 순현금흐름(극성: 흑자/적자 두 색) */
export function CashflowBars({ rows, height = 240 }: { rows: MonthRow[]; height?: number }) {
  const data = rows.slice(1).map((r) => ({ month: r.month, 순현금흐름: r.netCashflow }))
  const small = useSmallChart()
  const ax = small ? axisSmall : axisProps
  const neg = data.filter((d) => d.순현금흐름 < 0).length
  return (
    <ChartFigure height={height} label={`월별 순현금흐름 막대 그래프. ${data.length}개월 중 적자 ${neg}개월, 최저 ${manwon(Math.min(0, ...data.map((d) => d.순현금흐름)))}.`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: small ? 8 : 16, bottom: 0, left: small ? 0 : 4 }} barCategoryGap={1}>
          <CartesianGrid stroke="var(--hair)" vertical={false} />
          <XAxis dataKey="month" {...ax} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...ax} width={small ? 44 : 56} tickFormatter={(v) => manwon(v)} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--accent-soft)' }} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Bar dataKey="순현금흐름" radius={[4, 4, 0, 0]} fillOpacity={0.85} isAnimationActive animationDuration={400}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.순현금흐름 >= 0 ? POS : NEG} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  )
}

export function AssetsLiabilities({ rows, height = 240 }: { rows: MonthRow[]; height?: number }) {
  const data = rows.map((r) => ({ month: r.month, 총자산: r.totalAssets, 총부채: r.totalLiabilities }))
  const small = useSmallChart()
  const ax = small ? axisSmall : axisProps
  const a = data[0]
  const z = data[data.length - 1]
  const label = a && z ? `총자산·총부채 추이 영역 그래프. 총자산 ${manwon(a.총자산)}에서 ${z.month}개월 후 ${manwon(z.총자산)}, 총부채 ${manwon(a.총부채)}에서 ${manwon(z.총부채)}.` : '총자산·총부채 추이(데이터 없음)'
  return (
    <ChartFigure height={height} label={label}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: small ? 8 : 16, bottom: 0, left: small ? 0 : 4 }}>
          <CartesianGrid stroke="var(--hair)" vertical={false} />
          <XAxis dataKey="month" {...ax} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...ax} width={small ? 44 : 56} tickFormatter={(v) => manwon(v)} />
          <Tooltip content={<TooltipBox />} />
          <Legend wrapperStyle={{ fontSize: small ? 11 : 12 }} iconType="plainline" />
          <Area type="monotone" dataKey="총자산" stroke={SERIES[0]} fill={SERIES[0]} fillOpacity={0.1} strokeWidth={1.75} />
          <Area type="monotone" dataKey="총부채" stroke={SERIES[4]} fill={SERIES[4]} fillOpacity={0.07} strokeWidth={1.75} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFigure>
  )
}

/** 목표 타임라인: 목표 시점(◇)과 엔진이 계산한 달성 시점(●)을 같은 축에 표시 */
export function GoalTimeline({ goals, horizon }: { goals: GoalResult[]; horizon: number }) {
  if (!goals.length) return <p className="px-2 text-[13px] text-muted">등록된 목표가 없습니다. 고객 정보의 재무목표 탭에서 추가하세요.</p>
  const maxM = Math.max(horizon, ...goals.map((g) => g.targetMonth))
  const x = (m: number) => `${(m / maxM) * 100}%`
  return (
    <div className="space-y-4 px-2 py-1" role="list" aria-label="목표별 목표 시점과 계산된 달성 시점">
      {goals.map((g) => (
        <div key={g.goalId} role="listitem">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
            <span className="text-fg">
              <span className="mr-1.5 text-[11.5px] text-dim">{g.priority}순위</span>
              {g.name}
            </span>
            <span className={g.onTrack ? 'text-primary' : 'text-warn'}>
              {g.achievedMonth == null ? '기간 내 미달성' : `${g.achievedMonth}개월 차 달성`} {g.onTrack ? '· 기한 내' : `· 목표 ${g.targetMonth}개월`}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-white/60 shadow-[inset_0_0_0_1px_rgba(36,56,86,.06)]" role="img" aria-label={`${g.name}: 목표 ${g.targetMonth}개월, 달성 ${g.achievedMonth ?? '없음'}`}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: x(Math.min(g.achievedMonth ?? maxM, maxM)), background: g.onTrack ? 'linear-gradient(90deg,#8aa0bd,var(--primary))' : 'linear-gradient(90deg,#d9c39b,var(--warn))', opacity: 0.9, transition: 'width 450ms ease' }} />
            <div className="absolute -top-1.5 h-4.5 w-[2px] rounded-full bg-fg" style={{ left: x(g.targetMonth) }} title={`목표 시점 ${g.targetMonth}개월`} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-dim">
            <span>누적 목표 {manwon(g.cumulativeTarget)} · 필요 월저축 {manwon(g.requiredMonthlySaving)}</span>
            <span>목표 시점 {g.targetMonth}개월</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** 시나리오 비교: 기말 순자산 막대 */
export function CompareBars({ items, height = 220 }: { items: { name: string; color: string; value: number }[]; height?: number }) {
  const small = useSmallChart()
  const ax = small ? axisSmall : axisProps
  return (
    <ChartFigure height={height} label={`시나리오별 기말 순자산 가로 막대 그래프. ${items.map((i) => `${i.name} ${manwon(i.value)}`).join(', ')}.`}>
      <ResponsiveContainer>
        <BarChart data={items} layout="vertical" margin={{ top: 4, right: small ? 44 : 40, bottom: 0, left: small ? 0 : 8 }}>
          <CartesianGrid stroke="var(--hair)" horizontal={false} />
          <XAxis type="number" {...ax} tickFormatter={(v) => manwon(v)} />
          <YAxis type="category" dataKey="name" {...ax} width={small ? 88 : 120} tickFormatter={(v: string) => (small && v.length > 8 ? v.slice(0, 8) + '…' : v)} />
          <Tooltip content={<TooltipBox unit="" />} cursor={{ fill: 'var(--accent-soft)' }} />
          <Bar dataKey="value" name="기말 순자산" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive animationDuration={400} label={{ position: 'right', fill: 'var(--text-muted)', fontSize: 11, formatter: (v: number) => manwon(v) }}>
            {items.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  )
}

export const rowsTable = (rows: MonthRow[], cols: [string, keyof MonthRow][]) => ({
  columns: ['월', ...cols.map((c) => c[0])],
  rows: rows.map((r) => [`${r.month}`, ...cols.map((c) => r[c[1]] as number)]),
})
