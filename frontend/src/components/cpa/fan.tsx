// 지연 범위 그래프(팬 차트): 합격·수습 확보 후 첫 급여 지연 L = 0~9개월 각각을 Rust 엔진이 계산한 월말 잔액의 범위.
// 확률 분포가 아니라 "지연이 0~9개월 중 어느 것이든"의 범위다(화면에 그렇게 표시한다).
import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/utils/format'
import { STRATEGY_META, man, ym, ymShort } from '@/features/cpa/meta'
import type { Analysis, Explore, Strategy } from '@/features/cpa/types'
import { Interpretation, Prov, SectionHead, Skel, StrategyBadge } from './ui'

const axis = { fontSize: 11, fill: 'var(--ink-3)' }

export function FanChart({ a, data, delay }: { a: Analysis; data: Explore | null; delay: number }) {
  const [s, setS] = useState<Strategy>('D')
  const fan = data?.fans.find((f) => f.strategy === s)
  const rows = useMemo(() => {
    if (!fan || fan.missing.length) return []
    return fan.months.map((m, t) => {
      const all = fan.series.map((x) => x[t])
      const mid = fan.series.slice(2, 7).map((x) => x[t])
      return {
        month: m,
        outer: [Math.min(...all), Math.max(...all)] as [number, number],
        inner: [Math.min(...mid), Math.max(...mid)] as [number, number],
        cur: fan.series[Math.min(delay, fan.series.length - 1)][t],
      }
    })
  }, [fan, delay])
  const okCount = fan ? fan.taus.filter((t) => t == null).length : 0
  const firstBad = fan ? fan.delays.find((_, k) => fan.taus[k] != null) : undefined
  return (
    <section className="card p-4 sm:p-5">
      <SectionHead
        title="첫 급여가 언제 오느냐에 따라 잔액은 이만큼 달라진다"
        help="합격하고 수습처를 확보했다고 가정한 뒤, 첫 급여가 0~9개월 늦어지는 10가지 경우를 Rust 엔진으로 모두 계산했습니다. 바깥 띠 = 10가지 경우 전체 범위, 진한 띠 = 지연 2~6개월, 검은 선 = 지금 검토 중인 지연. 확률이 아니라 범위입니다."
        right={
          <div className="flex flex-wrap gap-1">
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
      {!data ? (
        <Skel className="h-[300px]" />
      ) : !fan || fan.missing.length ? (
        <p className="py-12 text-center text-[13px] text-ink-3">수습 급여 입력이 필요해 계산하지 않았습니다.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-4 text-[11.5px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm bg-ink/10" /> 지연 0~9개월 전체
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded-sm bg-ink/25" /> 지연 2~6개월
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-ink" /> 지금 검토 중인 지연 {delay}개월
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-5 border-t-2 border-dashed border-caution" /> 비상금 하한
            </span>
            <Prov kind="engine" className="ml-auto" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 14, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={ymShort} tick={axis} interval={2} />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 10_000).toLocaleString('ko-KR')}`} tick={axis} width={52} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload as (typeof rows)[number]
                    return (
                      <div className="rounded-xl border border-rule bg-card px-3 py-2 text-[12px] shadow-lg">
                        <div className="mb-1 font-semibold text-navy">{ym(String(label))} 월말 잔액</div>
                        <div>
                          전체 범위 {man(r.outer[0])} ~ {man(r.outer[1])}
                        </div>
                        <div>
                          지연 2~6개월 {man(r.inner[0])} ~ {man(r.inner[1])}
                        </div>
                        <div className="font-semibold">
                          지연 {delay}개월 {man(r.cur)}
                        </div>
                      </div>
                    )
                  }}
                />
                <Area dataKey="outer" stroke="none" fill="var(--ink)" fillOpacity={0.09} isAnimationActive={false} />
                <Area dataKey="inner" stroke="none" fill="var(--ink)" fillOpacity={0.2} isAnimationActive={false} />
                <ReferenceLine y={a.inputs.safetyMin} stroke="var(--caution)" strokeDasharray="6 4" strokeWidth={1.5} />
                <ReferenceLine y={0} stroke="var(--ink-3)" />
                <ReferenceLine x={a.inputs.announceMonth} stroke="var(--rule-strong)" strokeDasharray="3 3" label={{ value: '합격 발표*', position: 'top', style: { fontSize: 10.5, fill: 'var(--ink-3)' } }} />
                <Line dataKey="cur" stroke="var(--ink)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Interpretation className="mt-3">
            {STRATEGY_META[s].name}은 첫 급여 지연 10가지 경우 중 <b>{okCount}가지</b>에서 비상금 하한을 지킵니다.
            {firstBad != null ? (
              <>
                {' '}
                지연이 <b>{firstBad}개월</b> 이상이면 하한 아래로 내려갑니다. 띠가 아래로 넓게 퍼질수록 “합격 후 급여가 언제 오는지”에 결과가 크게 좌우된다는 뜻입니다.
              </>
            ) : (
              ' 9개월 늦어져도 하한 위에 머뭅니다 — 합격 후 공백에 가장 강한 전략입니다.'
            )}
          </Interpretation>
        </>
      )}
    </section>
  )
}
