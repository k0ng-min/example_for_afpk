import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronDown, CircleAlert, CircleSlash, Info } from 'lucide-react'
import { cn } from '@/utils/format'
import { useCpa } from '@/features/cpa/store'
import { WAGE_SOURCES, LONG_FIELDS, MISSING_LABEL, MODE_LABEL, STRATEGY_META, addMonths, man, monthsBetween, outcomeLabel, wonFull, ym } from '@/features/cpa/meta'
import type { Analysis, BranchSummary, CpaInputs, Strategy } from '@/features/cpa/types'
import { PageTitle } from '@/components/cpa/Shell'
import { CashChart, ExpectedCashChart, Heatmap, NetBars, ToleranceBars, ValueBars } from '@/components/cpa/charts'
import { ExploreTab, useExplore } from '@/components/cpa/explore'
import { FanChart } from '@/components/cpa/fan'
import { Btn, Callout, Formula, Help, Interpretation, MonthInput, Prov, SectionHead, Skel, Slider, Stat, StrategyBadge, StrategyDot, Tabs, WonInput } from '@/components/cpa/ui'

type Tab = 'short' | 'uncertainty' | 'long' | 'explore'

export default function Simulator() {
  const [sp, setSp] = useSearchParams()
  const tab = (['short', 'uncertainty', 'long', 'explore'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'short') as Tab
  const { analysis: a, inputs, set, loading } = useCpa()
  return (
    <div>
      <PageTitle
        eyebrow="3단계 · 재무상태 분석 · 4단계 · 설계안 제시"
        title="시뮬레이션"
        lead="같은 고객, 같은 지출, 다른 근로 시점. 조건을 바꾸면 Rust 계산 엔진이 다시 계산하고 그래프와 해석이 함께 바뀝니다."
        right={
          <span className={cn('flex items-center gap-1.5 text-[12px]', loading ? 'text-sky' : 'text-ink-3')} aria-live="polite">
            <span className={cn('h-2 w-2 rounded-full', loading ? 'animate-pulse bg-sky' : 'bg-good')} />
            {loading ? '다시 계산 중' : '계산 최신 상태'}
          </span>
        }
      />
      <Tabs
        value={tab}
        onChange={(t) => setSp(t === 'short' ? {} : { tab: t }, { replace: true })}
        className="mb-6"
        fill
        items={[
          { id: 'short', label: '전략 비교 · 18개월' },
          { id: 'uncertainty', label: '합격 후 지연' },
          { id: 'long', label: '장기 가치 · 60개월' },
          { id: 'explore', label: '무엇이 결과를 바꾸나' },
        ]}
      />
      {!a || !inputs ? (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Skel className="h-[420px]" />
          <Skel className="h-[420px]" />
        </div>
      ) : tab === 'short' ? (
        <ShortTab a={a} i={inputs} set={set} />
      ) : tab === 'uncertainty' ? (
        <UncertaintyTab a={a} i={inputs} set={set} />
      ) : tab === 'explore' ? (
        <ExploreTab a={a} i={inputs} set={set} />
      ) : (
        <LongTab a={a} i={inputs} set={set} />
      )}
    </div>
  )
}

type P = { a: Analysis; i: CpaInputs; set: (p: Partial<CpaInputs>) => void }
const manFmt = (v: number) => man(v)

function Controls({ i, set }: Omit<P, 'a'>) {
  return (
    <div className="card space-y-4 p-4 lg:sticky lg:top-[120px]">
      <div className="text-[13px] font-semibold text-navy">조건 바꿔 보기</div>
      <Slider label="필수 생활비(월)" value={i.living} min={600_000} max={2_500_000} step={50_000} onChange={(v) => set({ living: v, rent: Math.min(i.rent, v) })} format={manFmt} prov="assumed" />
      <Slider label="근로 병행 소득(월)" value={i.partTimeIncome} min={0} max={2_000_000} step={50_000} onChange={(v) => set({ partTimeIncome: v })} format={manFmt} prov="assumed" />
      <Slider label="근로 결정 → 첫 소득" value={i.partTimeLead} min={1} max={6} step={1} onChange={(v) => set({ partTimeLead: v })} format={(v) => `${v}개월`} help="구직·면접·채용·첫 급여까지. 1 = 다음 달. 아르바이트가 바로 구해진다고 확정하지 않기 위해 별도 변수로 둡니다." />
      <Slider label="최소 안전자금" value={i.safetyMin} min={0} max={8_000_000} step={100_000} onChange={(v) => set({ safetyMin: v })} format={manFmt} />
      <Slider label="신호 1 (근로 병행)" value={i.signal1} min={i.signal2} max={14_000_000} step={100_000} onChange={(v) => set({ signal1: v })} format={manFmt} help="조건부 전환(D): 월말 잔액이 이 값 이하가 되면 근로 병행을 시작합니다." />
      <Slider label="신호 2 (구직 착수)" value={i.signal2} min={0} max={i.signal1} step={100_000} onChange={(v) => set({ signal2: v })} format={manFmt} help="D: 이 값 이하가 되면 구직을 시작합니다(취업 임금 입력 시 효과 반영)." />
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          가족 지원 중단 월 <Prov kind="assumed" />
        </div>
        <MonthInput value={i.supportStopFrom} onChange={(v) => set({ supportStopFrom: v < i.supportReduceFrom ? i.supportReduceFrom : v })} />
      </div>
      <div className="border-t border-rule pt-3">
        <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          취업 전환 세후 월급 <Prov kind="validate" />
          <Help>임금 자료가 확정되지 않아 비워 두었습니다. 입력해야 전략 C와 신호 2의 취업 효과를 계산합니다.</Help>
        </div>
        <WonInput value={i.jobWage} optional onChange={(v) => set({ jobWage: v })} className="w-full" />
        <div className="mt-2">
          <Slider label="구직 → 첫 급여" value={i.jobLead} min={1} max={9} step={1} onChange={(v) => set({ jobLead: v })} format={(v) => `${v}개월`} />
        </div>
      </div>
    </div>
  )
}

function ShortTab({ a, i, set }: P) {
  const focus = useCpa((s) => s.focus)
  const setFocus = useCpa((s) => s.setFocus)
  const [detail, setDetail] = useState(false)
  const sel: Strategy = focus ?? 'A'
  const get = (s: Strategy) => a.short.find((p) => p.strategy === s)!
  const selPath = get(sel)
  const A = get('A'),
    B = get('B'),
    D = get('D')
  const pt = D.events.find((e) => e.kind === 'partTimeStart')
  const s1 = a.signals.items.find((x) => x.id === 1)!
  const s2 = a.signals.items.find((x) => x.id === 2)!
  const miss = selPath.missing.length > 0
  const top = a.long.strategies.find((v) => v.rank === 1)
  return (
    <div className="grid gap-5 lg:grid-cols-[270px_1fr]">
      <div className="order-2 lg:order-1">
        <Controls i={i} set={set} />
      </div>
      <div className="order-1 min-w-0 space-y-4 lg:order-2">
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4" role="radiogroup" aria-label="전략 선택">
          {a.short.map((p) => {
            const on = sel === p.strategy
            const missing = p.missing.length > 0
            const ok = !missing && p.tau == null && p.insolvent == null
            return (
              <button key={p.strategy} role="radio" aria-checked={on} onClick={() => setFocus(p.strategy)} className={cn('card p-3 text-left transition-[border-color,box-shadow]', on ? 'border-sky/50 shadow-[0_0_0_1.5px_rgba(0,0,0,.45)]' : 'hover:border-sky-2')}>
                <div className="flex items-center gap-2">
                  <StrategyBadge s={p.strategy} />
                  <span className="text-[13.5px] font-semibold text-navy">{STRATEGY_META[p.strategy].name}</span>
                </div>
                <div className={cn('mt-2 inline-flex rounded-full px-2 py-[1px] text-[11.5px] font-semibold', missing ? 'bg-paper-2 text-ink-3' : ok ? 'bg-good-soft text-good' : 'bg-caution-soft text-caution')}>{missing ? '임금 입력 필요' : ok ? '18개월 통과' : `${ym(p.tau ?? p.insolvent)} 하한 도달`}</div>
              </button>
            )
          })}
        </div>

        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StrategyBadge s={sel} />
            <span className="text-[15px] font-semibold text-navy">{STRATEGY_META[sel].name} 요약</span>
            <Prov kind="engine" />
            <span className="text-[12px] text-ink-3">{STRATEGY_META[sel].desc}</span>
          </div>
          {miss ? (
            <div className="rounded-xl bg-[#f6f6f7] px-3 py-3 text-[13px] text-ink-2">
              {selPath.missing.map((m) => MISSING_LABEL[m]).join(', ')}이(가) 입력되지 않아 계산하지 않았습니다. ‘조건 바꿔 보기’에서 입력하면 바로 계산합니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="최초 하한 도달" value={selPath.tau ? ym(selPath.tau) : '없음'} sub="월말 잔액 < 안전자금" tone={selPath.tau ? 'caution' : 'good'} />
              <Stat label="18개월 최저 월말 잔액" value={man(selPath.minCash)} sub={`${ym(selPath.minMonth)} · 절대값`} />
              <Stat label="안전자금 하한 대비" value={`${selPath.minCash - i.safetyMin >= 0 ? '+' : '−'}${man(Math.abs(selPath.minCash - i.safetyMin))}`} sub={`최저 잔액 − ${man(i.safetyMin)}`} tone={selPath.minCash < i.safetyMin ? 'caution' : 'good'} />
              <Stat label="월중 지급" value={selPath.insolvent ? `${ym(selPath.insolvent)} 불가` : '가능'} sub="월초 잔액으로 그달 지출" tone={selPath.insolvent ? 'caution' : 'good'} />
              <Stat label="18개월 말 잔액" value={man(selPath.endCash)} sub="절대값" />
              <Stat label="전업(A) 대비 18개월 말" value={sel === 'A' ? '기준' : `${selPath.endCash - A.endCash >= 0 ? '+' : '−'}${man(Math.abs(selPath.endCash - A.endCash))}`} sub="기준안과의 차이" />
            </div>
          )}
        </div>

        <div className="card p-4 sm:p-5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-navy">18개월 월말 가용현금과 안전자금 하한</span>
            <Prov kind="engine" />
            <span className="text-[12px] text-ink-3">단위: 만 원</span>
          </div>
          <div className="mb-1 flex flex-wrap gap-3 text-[12px] text-ink-2">
            {a.short
              .filter((p) => p.missing.length === 0)
              .map((p) => (
                <button key={p.strategy} onClick={() => setFocus(p.strategy)} className={cn('flex items-center gap-1.5', focus && focus !== p.strategy && 'opacity-45')}>
                  <StrategyDot s={p.strategy} /> {p.strategy} {STRATEGY_META[p.strategy].name}
                </button>
              ))}
            {focus && (
              <button onClick={() => setFocus(null)} className="text-sky hover:underline">
                모두 보기
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <CashChart a={a} focus={focus} onFocus={setFocus} />
            </div>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-3">* 2027년 시험·발표는 공고 전 임시 일정. 합격·수습·취업 이후 소득은 이 그래프에 넣지 않았습니다(‘합격 후 지연’ 탭에서 결과별로 계산).</p>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-navy">
            전환 조건과 예상 도달 시점 <Prov kind="engine" />
            <Link to="/plan" className="ml-auto text-[12.5px] font-normal text-sky hover:underline">
              실행 계획 →
            </Link>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { t: `신호 1 · 잔액 ≤ ${man(i.signal1)}`, d: '근로 병행 시작', na: s1.ifNoAction, rule: s1.ruleTrigger },
              { t: `신호 2 · 잔액 ≤ ${man(i.signal2)}`, d: '구직 착수·지출 축소', na: s2.ifNoAction, rule: s2.ruleTrigger },
              { t: `안전자금 하한 · ${man(i.safetyMin)}`, d: '하한 아래로 내려가는 달', na: A.tau, rule: D.tau },
            ].map((r) => (
              <div key={r.t} className="rounded-xl border border-rule bg-white/80 px-3 py-2.5">
                <div className="text-[12.5px] font-semibold text-ink">{r.t}</div>
                <div className="text-[11.5px] text-ink-3">{r.d}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[12px]">
                  <span className="text-ink-3">전업 유지 시</span>
                  <span className="t-num text-right">{r.na ? ym(r.na) : '도달 없음'}</span>
                  <span className="text-ink-3">조건부 전환 시</span>
                  <span className="t-num text-right font-semibold">{r.rule ? ym(r.rule) : '도달 없음'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <Interpretation>
            {A.tau ? (
              <>
                전업(A)을 유지하면 <b>{ym(A.tau)}</b> 월말 잔액이 {man(A.tauCash)}으로 하한 아래로 내려갑니다.{' '}
              </>
            ) : (
              <>전업(A)도 18개월 동안 안전자금을 지킵니다. </>
            )}
            {pt && (
              <>
                잔액 신호에 따라 {ym(pt.month)}부터 근로하는 조건부 전환(D)은{' '}
                {D.tau ? (
                  <>
                    하한 도달을 <b>{ym(D.tau)}</b>로 늦춥니다{A.tau ? ` (${monthsBetween(A.tau, D.tau)}개월)` : ''}.
                  </>
                ) : (
                  <>18개월 동안 하한을 지킵니다.</>
                )}{' '}
              </>
            )}
            처음부터 병행(B)하면 18개월 말 {man(B.endCash)}이 남습니다. 이 그림만으로 B·D가 최종 권고라는 뜻은 아닙니다 — 수험시간 감소는 장기 가치 비교에서 함께 봅니다.
          </Interpretation>
          <div className="card p-4">
            <div className="text-[13px] font-semibold text-navy">60개월 장기 가치</div>
            <p className="mt-1 text-[12.5px] text-ink-2">{a.long.available ? (top ? `18개월 통과 전략 중 1위: ${STRATEGY_META[top.strategy].name} ${man(top.value)}` : '통과 전략 없음') : '수습·취업 임금 입력 전 — 계산 보류'}</p>
            <Link to="?tab=long" className="mt-2 inline-block text-[12.5px] font-medium text-sky hover:underline">
              장기 가치 보기 →
            </Link>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <button onClick={() => setDetail((v) => !v)} aria-expanded={detail} className="flex w-full items-center gap-2 text-left text-[14px] font-semibold text-navy">
            상세 근거 — 월별 현금흐름·이벤트·표
            <ChevronDown className={cn('ml-auto h-4 w-4 text-ink-3 transition-transform', detail && 'rotate-180')} />
          </button>
          {detail && (
            <div className="mt-3 space-y-3">
              <div className="text-[13px] text-ink-2">{STRATEGY_META[sel].name} · 월별 순현금흐름(유입 − 지출, 만 원)</div>
              {miss ? <div className="text-[13px] text-ink-3">입력이 필요해 계산하지 않았습니다.</div> : <NetBars p={selPath} />}
              {!miss && selPath.events.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-[12px]">
                  {selPath.events.map((e) => (
                    <span key={e.kind + e.month} className="rounded-full border border-rule bg-white px-2 py-0.5 text-ink-2">
                      {ym(e.month)} · {EVENT_LABEL[e.kind] ?? e.kind}
                    </span>
                  ))}
                </div>
              )}
              {!miss && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-right text-[12.5px]">
                    <thead className="text-ink-3">
                      <tr className="border-b border-rule">
                        {['월', '상태', '가족 지원', '근로·급여', '미확인 유입', '생활비', '수험비', '채무·상환', '순현금흐름', '월중 최저', '월말 잔액'].map((h) => (
                          <th key={h} className="px-2 py-1.5 font-normal first:text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="t-num">
                      {selPath.months.map((m) => (
                        <tr key={m.month} className="border-b border-rule/60">
                          <td className="px-2 py-1.5 text-left">{ym(m.month)}</td>
                          <td className="px-2 text-ink-2">{MODE_LABEL[m.mode]}</td>
                          <td className="px-2">{man(m.support, false)}</td>
                          <td className="px-2">{man(m.base + m.partTime + m.wage + m.trainee, false)}</td>
                          <td className="px-2">{man(m.extra, false)}</td>
                          <td className="px-2">{man(m.living, false)}</td>
                          <td className="px-2">{man(m.exam, false)}</td>
                          <td className="px-2">{man(m.debt + m.icl, false)}</td>
                          <td className={cn('px-2', m.net < 0 ? 'text-caution' : 'text-good')}>{man(m.net, false)}</td>
                          <td className={cn('px-2', m.midLow < 0 && 'font-semibold text-caution')}>{man(m.midLow, false)}</td>
                          <td className={cn('px-2 font-semibold', m.cash < i.safetyMin && 'text-caution')}>{man(m.cash, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[11.5px] text-ink-3">단위: 만 원(절대값) · 원 단위 계산 후 표시 반올림</div>
                </div>
              )}
              <Formula>
                <p className="font-mono text-[12.5px] text-ink">C(t) = C(t−1) + 실제 현금유입 − 필수생활비 − 수험비 − 실제 채무지급액</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>최초 하한 도달 τ = 월말 C(t) &lt; 최소 안전자금({man(i.safetyMin)})이 처음 발생한 달.</li>
                  <li>월중 최저 잔액 = 전월 말 잔액 + 월초 유입(가족 지원) − 이번 달 지출. 근로·급여는 월말 입금. 음수면 그 달 지급의무를 이행할 수 없습니다.</li>
                  <li>수험비: {ym(addMonths(i.examCostChange, -1))}까지 월 {man(i.examCost)}, 이후 {man(i.examCostAfter)}. 근로·수습·구직 상태에서는 0원.</li>
                  <li>조건부 전환(D): 월말 잔액 ≤ 신호 1이면 {i.partTimeLead}개월 뒤부터 근로소득, ≤ 신호 2이면 구직(임금 입력 시 {i.jobLead}개월 뒤 급여).</li>
                  <li>보증금은 가용현금이 아니며, 학자금은 의무상환액을 입력하기 전까지 월 지출에 넣지 않습니다. 확인되지 않은 지원금·임금은 유입에 넣지 않습니다.</li>
                </ul>
              </Formula>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = { signal1: '신호 1 발동', signal2: '신호 2 발동', partTimeStart: '근로 소득 시작', jobStart: '취업 첫 급여', traineeStart: '수습 첫 급여', cpaStart: '수습 후 급여' }

function Tree({ i, set }: Omit<P, 'a'>) {
  const p = i.pPct,
    q = i.qPct
  const Node = ({ title, sub, w, tone }: { title: string; sub: string; w: string; tone?: 'sky' }) => (
    <div className={cn('rounded-lg border px-3 py-2 text-center', tone === 'sky' ? 'border-sky/50 bg-sky-soft' : 'border-rule bg-card')}>
      <div className="text-[13px] font-semibold text-navy">{title}</div>
      <div className="text-[11.5px] text-ink-2">{sub}</div>
      <div className="t-num mt-0.5 text-[11px] text-ink-3">가정 가중치 {w}</div>
    </div>
  )
  return (
    <div className="card p-4 sm:p-5">
      <div className="rounded-xl border border-sky/20 bg-sky-soft px-4 py-2.5 text-ink">
        <div className="text-[13.5px] font-semibold">{ym(i.startMonth)} · 지금</div>
        <div className="text-[12px] text-ink-2">현금·부채·지원 조건과 마지막 유예 기회를 기준으로 전업·병행·취업 전환 계획을 세운다</div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Node title={`불합격 · (1 − p)`} sub="유예 종료 → 구직·대체 근로로 필수지출 유지" w={`${100 - p}%`} />
        <div className="space-y-2">
          <Node title="합격 · p" sub="합격해도 급여가 바로 시작되지 않는다" w={`${p}%`} tone="sky" />
          <div className="grid grid-cols-2 gap-2">
            <Node title="수습 확보 · q" sub={`L개월 뒤 실제 급여`} w={`${Math.round((p * q) / 100)}%`} />
            <Node title="미지정 · (1 − q)" sub="대체 근로소득을 별도 가정" w={`${Math.round((p * (100 - q)) / 100)}%`} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Slider label="합격 조건 p" value={p} min={0} max={100} step={5} onChange={(v) => set({ pPct: v })} format={(v) => `${v}%`} help="개인의 합격확률이 아니라 결론이 바뀌는 경계를 찾기 위한 시나리오 조건입니다. 2026년 유예생 집단 합격률 61%를 자동 적용하지 않습니다." />
        <Slider label="수습 확보 조건 q" value={q} min={0} max={100} step={5} onChange={(v) => set({ qPct: v })} format={(v) => `${v}%`} help="수습기관 등록률(집계 시점 상태)을 q로 직접 쓰지 않습니다." />
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-caution-soft px-3 py-2 text-[12.5px] text-ink">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
        p·q는 예측값이 아니라 시나리오 조건입니다. 화면의 가중치는 “이 조건을 가정하면”이라는 뜻이며, 고객 개인의 합격 가능성을 말하지 않습니다.
      </div>
    </div>
  )
}

function Cell({ b, safety }: { b: BranchSummary; safety: number }) {
  if (!b.complete)
    return (
      <td className="px-2 py-2 text-center text-[12px] text-ink-3">
        입력 필요
        <div className="text-[11px] text-ink-3">{b.missing.map((m) => MISSING_LABEL[m]).join(', ')}</div>
      </td>
    )
  return (
    <td className={cn('px-2 py-2 text-center', !b.safe && 'bg-caution-soft/70')}>
      <div className={cn('t-num flex items-center justify-center gap-1 text-[13px] font-semibold', b.minCash < safety ? 'text-caution' : 'text-ink')}>
        {b.safe ? <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-label="안전자금 유지" /> : <CircleAlert className="h-3.5 w-3.5" aria-label="안전자금 위반" />}
        {man(b.minCash)}
      </div>
      <div className="text-[11px] text-ink-3">{b.tau ? `하한 도달 ${ym(b.tau)}` : '위반 없음'}</div>
    </td>
  )
}

function UncertaintyTab({ a, i, set }: P) {
  const strat: Strategy[] = ['A', 'B', 'C', 'D']
  const heads = a.uncertainty[0].branches.map((b) => b.outcome)
  // 합격했는데도 안전자금이 깨지는 경로(계산 가능한 것만)
  const passBreaks = a.uncertainty.flatMap((u) => u.branches.filter((b) => b.outcome.kind === 'passPlaced' && b.complete && !b.safe).map((b) => ({ s: u.strategy, b })))
  const D = a.short.find((p) => p.strategy === 'D')!
  const { data: ex } = useExplore(i)
  return (
    <div className="space-y-6">
      <FanChart a={a} data={ex} delay={i.delay} />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Tree i={i} set={set} />
        <div className="card p-4 sm:p-5">
          <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-navy">
            첫 급여가 늦어져도 버틸 수 있는 기간 <Prov kind="engine" />
          </div>
          <p className="mb-4 text-[12.5px] text-ink-2">
            합격을 가정하고 가장 빠른 첫 급여월을 {ym(a.tolerance[0].earliestPay)}로 둘 때, 안전자금을 지키며 기다릴 수 있는 지연 개월 수. 수습 보수 수준을 몰라도 계산됩니다 — 첫 급여 직전까지의 최저 잔액은 그 이전 현금흐름만으로 정해지기 때문입니다.
          </p>
          <ToleranceBars a={a} delay={i.delay} />
          <div className="mt-4">
            <Slider label="검토할 수습 지연 L" value={i.delay} min={0} max={9} step={3} onChange={(v) => set({ delay: v })} format={(v) => `${v}개월`} help="표에서는 L = 0·3·6·9개월을 모두 계산합니다. 이 값은 그래프의 세로선과 60개월 비교에 쓰입니다." />
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <SectionHead
          title="결과 상태별 18개월 최저 잔액"
          help="각 칸 = 해당 전략을 실행하다 그 결과 상태를 맞았을 때의 18개월 최저 월말 잔액과 최초 위반월. 수습 급여·취업 임금이 입력되지 않은 경로는 결과를 만들지 않습니다."
          right={
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-ink-2">수습 세후 월급</span>
              <WonInput value={i.traineeSalary} optional onChange={(v) => set({ traineeSalary: v })} className="w-[120px]" />
              <span className="text-ink-2">취업 세후 월급</span>
              <WonInput value={i.jobWage} optional onChange={(v) => set({ jobWage: v })} className="w-[120px]" />
              <Prov kind="validate" />
            </div>
          }
          className="mb-3"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-rule text-ink-3">
                <th className="px-2 py-2 text-left font-normal">전략</th>
                {heads.map((h, k) => (
                  <th key={k} className={cn('px-2 py-2 font-normal', h.kind === 'passPlaced' && h.delay === i.delay && 'text-navy')}>
                    {outcomeLabel(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strat.map((s) => {
                const u = a.uncertainty.find((x) => x.strategy === s)!
                return (
                  <tr key={s} className="border-b border-rule/70">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2 font-medium">
                        <StrategyBadge s={s} /> {STRATEGY_META[s].name}
                      </div>
                      {s === 'C' && <div className="mt-0.5 text-[11px] text-ink-3">수험 중단 — 결과 상태와 무관</div>}
                    </td>
                    {u.branches.map((b, k) => (
                      <Cell key={k} b={b} safety={i.safetyMin} />
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Callout tone={passBreaks.length ? 'caution' : 'good'} title="합격해도 자금이 부족해지는 상황">
          {passBreaks.length ? (
            <ul className="space-y-1">
              {passBreaks.slice(0, 6).map(({ s, b }, k) => (
                <li key={k}>
                  · {s} {STRATEGY_META[s].short} + {outcomeLabel(b.outcome)} → {ym(b.tau)} 월말 {man(b.minCash)}까지 하락
                </li>
              ))}
            </ul>
          ) : i.traineeSalary == null ? (
            '수습 급여를 입력하면 합격 경로의 잔액까지 계산합니다. 입력 전에도 위 “버틸 수 있는 기간”으로 단기 위험을 비교할 수 있습니다.'
          ) : (
            '계산한 합격 경로에서 안전자금이 깨지는 경우가 없습니다.'
          )}
        </Callout>
        <Interpretation title="위험이 발생하기 전에 할 일">
          <ul className="space-y-1">
            <li>· 발표 전({ym(i.announceMonth)}) 수습처 지원 일정을 확인하고, 급여 시작이 늦어질 경우의 근로 계획을 미리 정해 둡니다.</li>
            <li>· 지금 계획(D)대로면 발표 시점 잔액은 {man(a.signals.cashAtAnnounce)}입니다. 이 잔액으로 지연 {a.tolerance.find((t) => t.strategy === 'D')?.months ?? 0}개월까지 버틸 수 있습니다.</li>
            <li>· 불합격 시에는 구직 기간({i.jobLead}개월) 동안의 지출을 버틸 수 있는지 먼저 확인합니다{D.tau ? ` — D 경로는 ${ym(D.tau)}에 안전자금이 깨집니다` : ''}.</li>
          </ul>
        </Interpretation>
      </div>
    </div>
  )
}

function LongTab({ a, i, set }: P) {
  const focus = useCpa((s) => s.focus)
  const [ignoreGate, setIgnoreGate] = useState(false)
  const L = a.long
  const gate = a.short.map((p) => ({ s: p.strategy, ok: p.missing.length === 0 && p.tau == null && p.insolvent == null, p }))
  const defaults = useCpa((s) => s.defaults)
  const ranked = L.strategies.filter((v) => v.rank != null).sort((x, y) => (x.rank ?? 9) - (y.rank ?? 9))
  const diffCells = L.heatmap.filter((c) => c.winner !== c.winnerIgnoringGate).length
  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <div className="mb-3 text-[14px] font-semibold text-navy">분석 순서가 곧 책임 있는 권고의 순서</div>
        <ol className="grid gap-2 sm:grid-cols-5">
          {['지급의무 이행 여부', '안전자금 유지 여부', '실행 가능한 전략만', '60개월 가치·기회비용', '고객의 최종 결정'].map((t, k) => (
            <li key={t} className={cn('rounded-lg px-3 py-2 text-[12.5px]', k < 3 ? 'bg-paper-2' : k === 3 ? 'bg-sky-soft' : 'border border-rule')}>
              <span className="t-num mr-1 text-sky">0{k + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {gate.map((g) => (
            <div key={g.s} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]', g.ok ? 'border-good/25 bg-good-soft' : 'border-caution/25 bg-caution-soft')}>
              <StrategyBadge s={g.s} />
              <div>
                <div className="font-medium">{g.ok ? '18개월 통과' : g.p.missing.length ? '입력 필요' : '18개월 탈락'}</div>
                <div className="text-[11.5px] text-ink-2">{g.p.missing.length ? MISSING_LABEL[g.p.missing[0]] : g.p.tau ? `하한 도달 ${ym(g.p.tau)}` : g.p.insolvent ? `월중 지급 불가 ${ym(g.p.insolvent)}` : '18개월 안전자금 유지'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <SectionHead
          title="60개월 비교에 필요한 가정"
          help="필요한 임금 가정이 준비되지 않으면 결과를 만들지 않습니다. 모든 가정은 화면에 공개됩니다."
          right={
            <div className="flex flex-wrap gap-2">
              {defaults && (
                <Btn variant="line" onClick={() => set({ traineeSalary: defaults.traineeSalary, cpaSalary: defaults.cpaSalary, jobWage: defaults.jobWage })}>
                  조사 기준값으로 되돌리기
                </Btn>
              )}
              {(i.traineeSalary != null || i.cpaSalary != null) && (
                <Btn variant="ghost" onClick={() => set({ traineeSalary: null, cpaSalary: null, jobWage: null })}>
                  비우기
                </Btn>
              )}
            </div>
          }
          className="mb-3"
        />
        <ul className="mb-3 space-y-0.5 rounded-lg bg-paper-2 px-3 py-2 text-[12px] text-ink-2">
          {Object.values(WAGE_SOURCES).map((t) => (
            <li key={t}>· {t}</li>
          ))}
          <li className="text-ink-3">세전 연봉은 보도·조사 자료, 세후 월급은 4대보험·간이세액 근사입니다. 고객의 실제 제안 금액이 있으면 그 값으로 바꿔 넣으세요.</li>
        </ul>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
          {LONG_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="mb-1 flex items-center gap-1.5 text-[12.5px] text-ink-2">
                {f.label} <Prov kind={f.prov} />
                <Help>{f.help}</Help>
              </div>
              {f.kind === 'won' ? (
                <WonInput value={i[f.key] as number | null} optional onChange={(v) => set({ [f.key]: v } as Partial<CpaInputs>)} className="w-full" />
              ) : (
                <Slider label="" value={i[f.key] as number} min={f.min!} max={f.max!} step={1} onChange={(v) => set({ [f.key]: v } as Partial<CpaInputs>)} format={(v) => `${v}개월`} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 border-t border-rule pt-4 md:grid-cols-2 xl:grid-cols-4">
          <Slider label="합격 조건 p" value={i.pPct} min={0} max={100} step={5} onChange={(v) => set({ pPct: v })} format={(v) => `${v}%`} help="시나리오 조건(예측 아님). 기획서 격자: 30·45·60·80%." />
          <Slider label="수습 확보 조건 q" value={i.qPct} min={0} max={100} step={5} onChange={(v) => set({ qPct: v })} format={(v) => `${v}%`} help="시나리오 조건. 기획서 격자: 50·70·90%." />
          <Slider label="병행 시 p 하락폭" value={i.partTimePenaltyPp} min={0} max={15} step={5} onChange={(v) => set({ partTimePenaltyPp: v })} format={(v) => `${v}%p`} help="근로 병행에 따른 수험시간 감소를 p 하락으로 반영(B 항상, D는 시험 전에 근로를 시작할 때만)." />
          <Slider label="할인율 r(연)" value={i.discountBps} min={0} max={1000} step={100} onChange={(v) => set({ discountBps: v })} format={(v) => `${v / 100}%`} help="월 할인율 = 연율 ÷ 12. 기획서 격자: 3·5·7%." />
        </div>
      </div>

      {!L.available ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <CircleSlash className="h-8 w-8 text-ink-3" />
          <div className="text-[16px] font-semibold text-navy">60개월 비교는 아직 계산하지 않았습니다</div>
          <p className="max-w-[560px] text-[13.5px] text-ink-2">
            필요한 가정: <b>{L.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}</b>. 값을 입력하거나 위의 “조사 기준값으로 되돌리기”를 누르면 계산합니다.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-navy">
                전략별 60개월 현재가치 <Prov kind="engine" />
                <Help>막대 = 조건부 기대가치 V(가정 p·q·L). 연한 띠 = 결과 상태(합격·수습 지연 0·3·6·9 / 미지정 / 불합격)별 현재가치 범위. 빗금 = 시계 1 탈락으로 순위에서 제외.</Help>
              </div>
              <ValueBars items={L.strategies} />
              <Interpretation className="mt-4">
                {ranked.length ? (
                  <>
                    지급능력을 통과한 전략 중 가정 p={i.pPct}%, q={i.qPct}%, L={i.delay}개월, r={i.discountBps / 100}%에서는 <b>{ranked[0].strategy} {STRATEGY_META[ranked[0].strategy].name}</b>의 가치가 가장 큽니다. 이는 예측이 아니라 “이 조건이라면”의 비교이며, 조건이 바뀌면 오른쪽 지도처럼 결론이 달라질 수 있습니다.
                  </>
                ) : (
                  '시계 1을 통과한 전략이 없어 순위를 정하지 않았습니다. 먼저 지출·근로 조건을 조정하세요.'
                )}
              </Interpretation>
            </div>
            <div className="card p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-navy">p × q 전략 우위 지도</span>
                <label className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-2">
                  <input type="checkbox" checked={ignoreGate} onChange={(e) => setIgnoreGate(e.target.checked)} />
                  단기 제약 무시(E6 비교)
                </label>
              </div>
              <Heatmap cells={L.heatmap} steps={L.heatSteps} ignoreGate={ignoreGate} p={i.pPct} q={i.qPct} />
              <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-ink-2">
                {(['A', 'B', 'C', 'D'] as Strategy[]).map((s) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm" style={{ background: STRATEGY_META[s].color }} /> {s} {STRATEGY_META[s].short}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="hatch h-3 w-3 rounded-sm bg-paper-2" /> 통과 전략 없음
                </span>
              </div>
              <p className="mt-2 text-[12px] text-ink-2">
                {ignoreGate ? <>단기 제약을 무시하면 {diffCells}개 칸에서 승자가 바뀝니다 — 장기 기대가치만 보는 권고가 중간의 자금 부족을 놓치는 지점입니다.</> : <>네모 테두리 = 현재 가정(p={i.pPct}%, q={i.qPct}%). 고객은 자신의 상황이 경계의 어느 쪽에 가까운지 스스로 판단할 수 있습니다.</>}
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="card p-4 sm:p-5">
              <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-navy">
                60개월 기대 월말 잔액 <Prov kind="engine" />
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <ExpectedCashChart months={L.months} items={L.strategies} safety={i.safetyMin} focus={focus} />
                </div>
              </div>
              <p className="text-[11.5px] text-ink-3">가정 가중치(p·q)로 평균한 잔액 경로. 실제 한 사람의 잔액은 결과 상태 중 하나를 따릅니다.</p>
            </div>
            <div className="card p-4 sm:p-5">
              <div className="mb-2 text-[14px] font-semibold text-navy">할인율에 따른 민감도</div>
              <table className="w-full text-[12.5px]">
                <thead className="text-ink-3">
                  <tr className="border-b border-rule">
                    <th className="py-1.5 text-left font-normal">전략</th>
                    {L.strategies[0].valueByRate.map(([r]) => (
                      <th key={r} className="py-1.5 text-right font-normal">
                        r={r / 100}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="t-num">
                  {L.strategies.map((v) => (
                    <tr key={v.strategy} className={cn('border-b border-rule/60', !v.feasible && 'text-ink-3')}>
                      <td className="py-1.5">
                        <span className="flex items-center gap-1.5">
                          <StrategyDot s={v.strategy} /> {v.strategy}
                          {!v.feasible && <span className="text-[10.5px]">(제외)</span>}
                        </span>
                      </td>
                      {v.valueByRate.map(([r, val]) => (
                        <td key={r} className="py-1.5 text-right">
                          {man(val, false)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1 text-[11px] text-ink-3">단위: 만 원 · 기대 현재가치</div>
              <Formula className="mt-3" title="장기 가치 계산식">
                <p className="font-mono text-[12px] text-ink">V = p × [q × V(수습 확보, L) + (1 − q) × V(미지정)] + (1 − p) × V(불합격)</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px]">
                  <li>V(경로) = Σ 순현금흐름ₜ ÷ (1 + r/12)ᵗ, t = 1…{i.longHorizon}개월(월말 기준). rust_decimal 계산 후 원 단위 반올림.</li>
                  <li>수습 확보: 발표 다음 달 + L에 첫 수습 급여({wonFull(i.traineeSalary)}), {i.traineeMonths}개월 뒤 수습 이후 급여({wonFull(i.cpaSalary)}).</li>
                  <li>미지정·불합격: 발표 후 {i.jobLead}개월 뒤부터 취업 임금({wonFull(i.jobWage)}). 재도전은 별도 상담으로 다루고 모형에 넣지 않았습니다.</li>
                  <li>B는 p − {i.partTimePenaltyPp}%p, D는 시험 전에 근로를 시작한 경우에만 하락폭 적용. C는 수험을 중단하므로 p와 무관.</li>
                  <li>순위는 시계 1(18개월 결과 미반영 기준선)을 통과한 전략에만 매깁니다.</li>
                </ul>
              </Formula>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
