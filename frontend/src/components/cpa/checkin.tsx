// 6단계 점검: 매달 말 실제 잔액을 기록하면 Rust 엔진(/api/cpa/checkin)이 계획과 비교하고 그 잔액에서 다시 계산한다.
// 기록은 이 브라우저(localStorage)에만 저장된다.
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { ClipboardPen, Trash2 } from 'lucide-react'
import { cn } from '@/utils/format'
import { cpaApi } from '@/features/cpa/store'
import { STRATEGY_META, addMonths, man, ym, ymShort } from '@/features/cpa/meta'
import type { CpaInputs, Checkin, CheckinEntry, Strategy } from '@/features/cpa/types'
import { Btn, Interpretation, MonthInput, Prov, SectionHead, StrategyBadge } from './ui'

const KEY = 'cpa.checkin.v1'
const axis = { fontSize: 11, fill: 'var(--ink-3)' }

function loadEntries(): CheckinEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as CheckinEntry[]).filter((x) => typeof x?.month === 'string' && typeof x?.cash === 'number') : []
  } catch {
    return []
  }
}
function saveEntries(v: CheckinEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 화면에서는 계속 동작 */
  }
}

const LEVEL: Record<string, { label: string; cls: string }> = {
  safe: { label: '계획 유지', cls: 'bg-good-soft text-good' },
  signal1: { label: '점검선 1', cls: 'bg-caution-soft text-caution' },
  signal2: { label: '점검선 2', cls: 'bg-caution-soft text-caution' },
  belowSafety: { label: '하한 아래', cls: 'bg-alert-soft text-alert' },
}

export function CheckinSection({ i }: { i: CpaInputs }) {
  const [entries, setEntries] = useState<CheckinEntry[]>(loadEntries)
  const [strategy, setStrategy] = useState<Strategy>('D')
  const [res, setRes] = useState<Checkin | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const nextMonth = entries.length ? addMonths(entries[entries.length - 1].month, 1) : i.startMonth
  const [month, setMonth] = useState(nextMonth)
  const [cashText, setCashText] = useState('')
  const digits = cashText.replace(/[^\d]/g, '')
  const cash = digits === '' ? null : Math.min(Number(digits), 1_000_000) * 10_000
  useEffect(() => setMonth(nextMonth), [nextMonth])
  const key = JSON.stringify([i, strategy, entries])
  useEffect(() => {
    const t = setTimeout(() => {
      cpaApi
        .checkin(i, strategy, entries)
        .then((r) => {
          setRes(r)
          setErr(null)
        })
        .catch((e: unknown) => setErr(String(e)))
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const update = (v: CheckinEntry[]) => {
    const sorted = [...v].sort((x, y) => (x.month < y.month ? -1 : 1))
    setEntries(sorted)
    saveEntries(sorted)
  }
  const add = () => {
    if (cash == null) return
    update([...entries.filter((e) => e.month !== month), { month, cash }])
    setCashText('')
  }
  const data = useMemo(() => {
    if (!res) return []
    const actual = new Map(res.rows.map((r) => [r.month, r.actual]))
    const months = Array.from(new Set([...res.plan.map((p) => p.month), ...res.rows.map((r) => r.month)])).sort()
    return months.map((m) => ({ month: m, plan: res.plan.find((p) => p.month === m)?.cash ?? null, actual: actual.get(m) ?? null }))
  }, [res])
  const rp = res?.reprojection
  const last = res?.rows[res.rows.length - 1]
  return (
    <section className="card p-4 sm:p-5">
      <SectionHead
        eyebrow="6단계 · 재무설계안 점검"
        title="월별 점검 기록: 계획대로 가고 있나"
        help="매달 말 실제 통장 잔액을 적으면 Rust 엔진이 선택한 전략의 계획 잔액과 비교하고, 점검선(신호 1·2)·비상금 하한에 닿았는지 판정합니다. 마지막 기록 잔액에서 앞으로 18개월을 다시 계산합니다. 기록은 이 브라우저에만 저장됩니다."
        right={
          <div className="flex flex-wrap gap-1">
            {(['A', 'B', 'C', 'D'] as Strategy[]).map((k) => (
              <button key={k} onClick={() => setStrategy(k)} aria-pressed={strategy === k} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]', strategy === k ? 'border-ink bg-ink text-white' : 'border-rule bg-white text-ink-2 hover:border-ink-3')}>
                <StrategyBadge s={k} className="h-4 w-4 rounded text-[9px]" />
                {STRATEGY_META[k].name}
              </button>
            ))}
          </div>
        }
        className="mb-3"
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-paper-2 px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label className="text-[12px] text-ink-2">
          <span className="mb-1 block">월</span>
          <MonthInput value={month} onChange={setMonth} />
        </label>
        <label className="text-[12px] text-ink-2">
          <span className="mb-1 block">그달 말 실제 잔액</span>
          <span className="inline-flex h-9 w-[150px] items-center rounded-lg border border-rule-strong bg-card pr-2.5 focus-within:border-sky">
            <input inputMode="numeric" aria-label="그달 말 실제 잔액(만 원)" value={cashText} onChange={(e) => setCashText(e.target.value)} placeholder="예: 1250" className="t-num h-full w-full min-w-0 bg-transparent px-2.5 text-right text-[14px] outline-none placeholder:text-ink-3" />
            <span className="shrink-0 text-[12px] text-ink-3">만 원</span>
          </span>
        </label>
        <Btn variant="solid" type="submit" disabled={cash == null} className="h-9">
          <ClipboardPen className="h-4 w-4" /> 기록
        </Btn>
        {entries.length > 0 && (
          <button type="button" onClick={() => update([])} className="ml-auto text-[12px] text-ink-3 hover:text-ink">
            기록 모두 지우기
          </button>
        )}
      </form>
      {err && <div className="mb-3 rounded-lg bg-caution-soft px-3 py-2 text-[12.5px] text-caution">점검 계산을 불러오지 못했습니다: {err}</div>}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="mb-1 flex items-center gap-3 text-[11.5px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-ink-3" /> 계획({STRATEGY_META[strategy].name})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-ink" /> 실제 기록
            </span>
            <Prov kind="engine" className="ml-auto" />
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={ymShort} tick={axis} interval={2} />
                <YAxis tickFormatter={(v: number) => `${Math.round(v / 10_000).toLocaleString('ko-KR')}`} tick={axis} width={52} />
                <Tooltip formatter={(v: number, n: string) => [man(v), n === 'plan' ? '계획' : '실제']} labelFormatter={(l) => ym(String(l))} />
                <ReferenceLine y={i.signal1} stroke="var(--ink-3)" strokeDasharray="2 4" label={{ value: '점검선 1', position: 'insideTopRight', style: { fontSize: 10.5, fill: 'var(--ink-3)' } }} />
                <ReferenceLine y={i.signal2} stroke="var(--ink-3)" strokeDasharray="2 4" label={{ value: '점검선 2', position: 'insideTopLeft', style: { fontSize: 10.5, fill: 'var(--ink-3)' } }} />
                <ReferenceLine y={i.safetyMin} stroke="var(--caution)" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: '비상금 하한', position: 'insideBottomRight', style: { fontSize: 10.5, fill: 'var(--caution)', fontWeight: 600 } }} />
                <Line dataKey="plan" stroke="var(--ink-3)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="actual" stroke="var(--ink)" strokeWidth={2} connectNulls dot={{ r: 4, fill: 'var(--ink)' }} isAnimationActive={false} />
                <Scatter dataKey="actual" fill="var(--ink)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-3">
          {!res || res.rows.length === 0 ? (
            <div className="grid h-full min-h-[200px] place-items-center rounded-xl border border-dashed border-rule-strong px-4 text-center text-[13px] text-ink-2">
              <div>
                <ClipboardPen className="mx-auto mb-2 h-6 w-6 text-ink-3" />
                매달 말 통장 잔액을 기록하면
                <br />
                계획과 비교하고 다음 행동을 알려 드립니다.
              </div>
            </div>
          ) : (
            <>
              {last && (
                <div className={cn('rounded-xl px-4 py-3', LEVEL[last.level].cls)}>
                  <div className="text-[12px] font-semibold">
                    {ym(last.month)} · {LEVEL[last.level].label}
                  </div>
                  <div className="mt-0.5 text-[13.5px] text-ink">{last.action}</div>
                </div>
              )}
              {rp && (
                <Interpretation title={`${ym(rp.from)}부터 다시 계산한 결과`}>
                  잔액 {man(rp.cash)}에서 공부만 계속하면 <b>{rp.runway == null ? '48개월 이상' : `${rp.runway}개월`}</b> 버틸 수 있습니다. {STRATEGY_META[strategy].name}을 따르면{' '}
                  {rp.strategyTau ? <b>{ym(rp.strategyTau)}에 비상금 하한 아래로 내려가고</b> : <b>{ym(rp.endMonth)}까지 하한 위를 지키고</b>}, {ym(rp.endMonth)} 말 잔액은 {man(rp.strategyEnd)}입니다.
                </Interpretation>
              )}
            </>
          )}
        </div>
      </div>

      {res && res.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-rule text-ink-3">
                <th className="px-2 py-1.5 text-left font-normal">월</th>
                <th className="px-2 py-1.5 text-right font-normal">실제 잔액</th>
                <th className="px-2 py-1.5 text-right font-normal">계획 잔액</th>
                <th className="px-2 py-1.5 text-right font-normal">차이</th>
                <th className="px-2 py-1.5 text-left font-normal">판정</th>
                <th className="px-2 py-1.5 text-left font-normal">할 일</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.month} className="border-b border-rule/60">
                  <td className="t-num px-2 py-1.5">{ym(r.month)}</td>
                  <td className="t-num px-2 py-1.5 text-right font-semibold">{man(r.actual)}</td>
                  <td className="t-num px-2 py-1.5 text-right text-ink-2">{r.plan == null ? '—' : man(r.plan)}</td>
                  <td className={cn('t-num px-2 py-1.5 text-right', r.diff == null ? 'text-ink-3' : r.diff >= 0 ? 'text-good' : 'text-alert')}>{r.diff == null ? '—' : `${r.diff >= 0 ? '+' : '−'}${man(Math.abs(r.diff))}`}</td>
                  <td className="px-2 py-1.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', LEVEL[r.level].cls)}>{LEVEL[r.level].label}</span>
                  </td>
                  <td className="px-2 py-1.5 text-ink-2">{r.action}</td>
                  <td className="px-1 py-1.5">
                    <button aria-label={`${ym(r.month)} 기록 지우기`} onClick={() => update(entries.filter((e) => e.month !== r.month))} className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
