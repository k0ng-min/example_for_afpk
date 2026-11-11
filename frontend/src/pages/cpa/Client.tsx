import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Calculator, CheckCircle2, CircleAlert, CircleDashed, RotateCcw, Undo2 } from 'lucide-react'
import { cn } from '@/utils/format'
import { errorText } from '@/services/api/client'
import { cpaApi, useCpa } from '@/features/cpa/store'
import { EXTRA_FIELDS, FIELD_GROUPS, LONG_FIELDS, MISSING_LABEL, man, wonFull, ym, ymShort, type FieldMeta } from '@/features/cpa/meta'
import type { Analysis, CpaInputs, IclResult } from '@/features/cpa/types'
import { PageTitle } from '@/components/cpa/Shell'
import { Btn, Help, Interpretation, MonthInput, Prov, Skel, Tabs, WonInput } from '@/components/cpa/ui'

const ALL_FIELDS: FieldMeta[] = [...FIELD_GROUPS.flatMap((g) => g.fields), ...LONG_FIELDS, ...EXTRA_FIELDS]
const F = (k: keyof CpaInputs) => ALL_FIELDS.find((f) => f.key === k)!

type Group = 'basic' | 'flow' | 'balance' | 'schedule' | 'basis'
const GROUPS: { id: Group; label: string; keys: (keyof CpaInputs)[] }[] = [
  { id: 'basic', label: '기본 상황', keys: ['currentIncome', 'cash0', 'living', 'safetyMin'] },
  { id: 'flow', label: '18개월 현금흐름', keys: ['living', 'rent', 'examCost', 'examCostAfter', 'examCostChange', 'supportInitial', 'supportReduced', 'supportReduceFrom', 'supportStopFrom'] },
  { id: 'balance', label: '자산·부채', keys: ['cash0', 'deposit', 'studentLoan', 'iclMonthly', 'iclStart', 'otherDebtPayment'] },
  { id: 'schedule', label: '일정과 소득 공백', keys: ['examMonth', 'announceMonth', 'delay', 'partTimeIncome', 'partTimeLead', 'jobWage', 'jobLead', 'traineeSalary', 'cpaSalary'] },
  { id: 'basis', label: '가정 및 계산 기준', keys: ['safetyMin', 'signal1', 'signal2', 'signal2Cut', 'pPct', 'qPct', 'partTimePenaltyPp', 'discountBps'] },
]

function display(f: FieldMeta | undefined, v: unknown): string {
  if (v == null) return '미입력'
  if (!f) return String(v)
  if (f.kind === 'won') return man(v as number)
  if (f.kind === 'month') return ym(v as string)
  if (f.key === 'discountBps') return `${(v as number) / 100}%`
  if (f.key === 'pPct' || f.key === 'qPct') return `${v}%`
  if (f.key === 'partTimePenaltyPp') return `${v}%p`
  return `${v}개월`
}
const LABEL: Partial<Record<keyof CpaInputs, string>> = { partTimePenaltyPp: '병행 시 p 하락폭', discountBps: '할인율(연)' }

export default function ClientPage() {
  const { analysis: a, inputs, defaults, set, reset } = useCpa()
  const [sp, setSp] = useSearchParams()
  const group = (GROUPS.find((g) => g.id === sp.get('g'))?.id ?? 'basic') as Group
  const [draft, setDraft] = useState<CpaInputs | null>(inputs)
  useEffect(() => {
    setDraft(inputs)
  }, [inputs])
  const changed = useMemo(() => (draft && inputs ? (Object.keys(inputs) as (keyof CpaInputs)[]).filter((k) => draft[k] !== inputs[k]) : []), [draft, inputs])
  const fromDefault = inputs && defaults ? (Object.keys(defaults) as (keyof CpaInputs)[]).filter((k) => inputs[k] !== defaults[k]).length : 0
  const patch = (p: Partial<CpaInputs>) => setDraft((d) => (d ? { ...d, ...p } : d))

  return (
    <div>
      <PageTitle
        eyebrow="2단계 · 정보 수집 및 목표 설정"
        title="고객 정보"
        lead="가상 고객 김유예(27세, CPA 2차 유예생 · 합성 데이터)의 상황과 가정입니다. 값을 바꾸면 적용하기 전에 바뀌는 항목과 핵심 결과를 먼저 보여 줍니다."
        right={
          fromDefault > 0 && (
            <Btn variant="line" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> 기본값 복원 ({fromDefault}개 변경됨)
            </Btn>
          )
        }
      />
      <Tabs value={group} onChange={(g) => setSp(g === 'basic' ? {} : { g }, { replace: true })} items={GROUPS.map((g) => ({ id: g.id, label: g.label }))} className="mb-5" />

      {!a || !draft ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skel className="h-72" />
          <Skel className="h-72" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-4">
            <div className="card p-4 sm:p-5">
              <div className="mb-1 text-[13.5px] font-semibold text-navy">{GROUPS.find((g) => g.id === group)!.label}</div>
              <div className="divide-y divide-rule">
                {GROUPS.find((g) => g.id === group)!.keys.map((k) => (
                  <Field key={k} f={F(k)} label={LABEL[k]} value={draft[k]} changed={changed.includes(k)} onChange={(v) => patch({ [k]: v } as Partial<CpaInputs>)} />
                ))}
              </div>
            </div>
            {group === 'balance' && <IclCalc onApply={(r) => patch({ iclMonthly: r.monthlyWithholding, iclStart: r.withholdingFrom })} />}
            {group === 'basis' && (
              <div className="note px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
                <b className="text-ink">계산 기준</b> — 금액은 정수 원 단위로 Rust 엔진이 계산합니다. 확인되지 않은 지원금·수습 급여·취업 임금은 유입에 넣지 않습니다. p·q는 개인의 미래 예측이 아니라 결론이 바뀌는 경계를 찾기 위한 조건이며, 2026년 유예생 집단 합격률(61%)을 개인 확률로 쓰지 않습니다.
              </div>
            )}
          </div>
          <div className="space-y-4">
            {group === 'basic' && <Basic a={a} />}
            {group === 'flow' && <FlowSchedule a={a} />}
            {group === 'balance' && <BalanceSheet a={a} />}
            {group === 'schedule' && <Schedule a={a} />}
            {group === 'basis' && <Basis a={a} />}
          </div>
        </div>
      )}

      {draft && inputs && changed.length > 0 && <ChangeBar inputs={inputs} draft={draft} keys={changed} current={a} onApply={() => set(draft)} onDiscard={() => setDraft(inputs)} />}
    </div>
  )
}

function Field({ f, label, value, changed, onChange }: { f: FieldMeta; label?: string; value: unknown; changed: boolean; onChange: (v: number | string | null) => void }) {
  const id = `f-${f.key}`
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5', changed && '-mx-2 rounded-lg bg-sky-soft/60 px-2')}>
      <label htmlFor={id} className="min-w-0 flex-1 text-[13px] text-ink">
        <span className="mr-1">{label ?? f.label}</span>
        {f.help && <Help>{f.help}</Help>}
      </label>
      <div className="flex items-center gap-1.5">
        <Prov kind={changed ? 'input' : f.prov} />
        {f.kind === 'won' && <WonInput id={id} value={value as number | null} optional={f.optional} onChange={onChange} className="w-[124px]" />}
        {f.kind === 'month' &&
          (f.optional ? (
            <span className="flex items-center gap-1">
              <input id={id} type="month" value={(value as string | null) ?? ''} onChange={(e) => onChange(e.target.value || null)} className="t-num h-9 rounded-lg border border-rule-strong bg-white px-2.5 text-[14px] outline-none focus:border-sky" />
            </span>
          ) : (
            <MonthInput id={id} value={value as string} onChange={onChange} />
          ))}
        {f.kind === 'count' && (
          <span className="inline-flex h-9 items-center rounded-lg border border-rule-strong bg-white pr-2.5">
            <input id={id} type="number" min={f.min} max={f.max} step={f.step} value={f.key === 'discountBps' ? (value as number) / 100 : (value as number)} onChange={(e) => e.target.value !== '' && onChange(Math.max(f.min ?? 0, Math.min(f.max ?? 999, Number(e.target.value))) * (f.key === 'discountBps' ? 100 : 1))} className="t-num h-full w-16 bg-transparent px-2 text-right text-[14px] outline-none" />
            <span className="text-[12px] text-ink-3">{f.key === 'pPct' || f.key === 'qPct' || f.key === 'discountBps' ? '%' : f.key === 'partTimePenaltyPp' ? '%p' : '개월'}</span>
          </span>
        )}
      </div>
    </div>
  )
}

/** 적용 전 변경 사항과 재계산되는 핵심 결과 */
function ChangeBar({ inputs, draft, keys, current, onApply, onDiscard }: { inputs: CpaInputs; draft: CpaInputs; keys: (keyof CpaInputs)[]; current: Analysis | null; onApply: () => void; onDiscard: () => void }) {
  const [preview, setPreview] = useState<Analysis | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setErr(null)
      cpaApi
        .analyze(draft, ctl.signal)
        .then(setPreview)
        .catch((e) => (e as Error).name !== 'AbortError' && setErr(errorText(e)))
    }, 250)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [draft])
  const metric = (a: Analysis | null, f: (a: Analysis) => string) => (a ? f(a) : '…')
  const p = (a: Analysis, s: string) => a.short.find((x) => x.strategy === s)!
  const rows: [string, (a: Analysis) => string][] = [
    ['전업 안전자금 도달', (a) => ym(p(a, 'A').tau)],
    ['조건부 전환 안전자금 도달', (a) => ym(p(a, 'D').tau)],
    ['병행 18개월 말 잔액', (a) => man(p(a, 'B').endCash)],
    ['합격 후 지연 내성(D)', (a) => `${a.tolerance.find((t) => t.strategy === 'D')?.months ?? 0}개월`],
  ]
  return (
    <div className="cpa-chrome fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6">
      <div className="glass-bar mx-auto max-w-[1100px] rounded-2xl border border-sky/25 px-4 py-3 shadow-[0_20px_50px_-24px_rgba(0,0,0,.45)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-sky">적용 전 변경 {keys.length}개</span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-1 text-[12px] text-ink-2">
            {keys.slice(0, 4).map((k) => (
              <span key={k} className="rounded-full bg-white px-2 py-0.5">
                {LABEL[k] ?? F(k)?.label ?? k}: {display(F(k), inputs[k])} → <b className="text-ink">{display(F(k), draft[k])}</b>
              </span>
            ))}
            {keys.length > 4 && <span>외 {keys.length - 4}개</span>}
          </span>
          <Btn variant="ghost" className="h-9" onClick={onDiscard}>
            <Undo2 className="h-4 w-4" /> 되돌리기
          </Btn>
          <Btn variant="solid" className="h-9" onClick={onApply} disabled={!!err}>
            적용하고 다시 계산
          </Btn>
        </div>
        {err ? (
          <div className="mt-2 text-[12.5px] text-alert">{err}</div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {rows.map(([label, f]) => {
              const before = metric(current, f)
              const after = metric(preview, f)
              return (
                <div key={label} className="rounded-lg bg-white/80 px-2.5 py-1.5">
                  <div className="text-[11px] text-ink-3">{label}</div>
                  <div className="t-num text-[12.5px]">
                    {before} → <b className={cn(before !== after ? 'text-sky' : 'text-ink')}>{after}</b>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Basic({ a }: { a: Analysis }) {
  const i = a.inputs
  const ok = a.short.filter((p) => p.missing.length === 0)
  const safe = ok.filter((p) => p.tau == null).map((p) => p.strategy)
  const pay = ok.filter((p) => p.insolvent == null).map((p) => p.strategy)
  const indep = ok
    .filter((p) => {
      let run = 0
      for (const m of p.months) {
        run = m.support === 0 && m.net >= 0 ? run + 1 : 0
        if (run >= 3) return true
      }
      return false
    })
    .map((p) => p.strategy)
  const facts = [
    ['나이·거주', '27세 · 서울'],
    ['시험 상황', '2026년 제1차 합격, 제2차 두 과목 부분합격'],
    ['마지막 유예 여부', '예 — 2027년이 마지막 유예 응시'],
    ['현재 소득', i.currentIncome > 0 ? `정기 근로소득 월 ${man(i.currentIncome)}` : '정기 소득 없음(무소득)'],
    ['시험·발표 예상', `${ym(i.examMonth)}* 시험 · ${ym(i.announceMonth)}* 발표 (공고 전 임시)`],
    ['고객의 고민', '“떨어지면 어떡하지”보다 “붙어도 월세는 누가 내지”'],
  ]
  const goals = [
    { n: '①', t: '지급능력 유지', d: '18개월 동안 안전자금 하한 이상', pass: safe },
    { n: '②', t: '의무 이행', d: '필수지출·상환 연체 없음', pass: pay },
    { n: '③', t: '경제적 자립', d: '가족 지원 없이 3개월 연속 흑자', pass: indep },
  ]
  return (
    <>
      <div className="card p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-navy">
          고객 상황 <Prov kind="assumed" />
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="card-soft px-3 py-2">
              <dt className="text-[11.5px] text-ink-3">{k}</dt>
              <dd className="text-[13px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-navy">
          우선순위가 있는 재무목표 <Prov kind="engine" />
          <Help>①~③을 통과한 전략만 ④ 장기 가치를 비교합니다.</Help>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {goals.map((g) => (
            <div key={g.n} className="rounded-xl border border-rule bg-white/80 px-3 py-2.5">
              <div className="text-[13.5px] font-semibold text-ink">
                <span className="mr-1 text-sky">{g.n}</span>
                {g.t}
              </div>
              <div className="text-[12px] text-ink-3">{g.d}</div>
              <div className={cn('mt-1.5 flex items-center gap-1 text-[12.5px] font-medium', g.pass.length ? 'text-good' : 'text-caution')}>
                {g.pass.length ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                {g.pass.length ? `충족 전략 ${g.pass.join('·')}` : '충족 전략 없음'}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-rule bg-white/80 px-3 py-2.5">
            <div className="text-[13.5px] font-semibold text-ink">
              <span className="mr-1 text-sky">④</span>장기 가치
            </div>
            <div className="text-[12px] text-ink-3">①~③ 통과 전략 중 60개월 비교</div>
            <div className={cn('mt-1.5 flex items-center gap-1 text-[12.5px] font-medium', a.long.available ? 'text-good' : 'text-ink-3')}>
              {a.long.available ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
              {a.long.available ? '비교 가능' : `계산 보류 — ${a.long.missing.map((m) => MISSING_LABEL[m]).join(', ')} 필요`}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function BalanceSheet({ a }: { a: Analysis }) {
  const b = a.balanceSheet
  const max = Math.max(b.totalAssets, b.studentLoan)
  const w = (v: number) => `${(v / max) * 100}%`
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-navy">
        재무상태표 <Help>보증금은 자산이지만 매달 꺼내 쓸 수 없어 가용현금에서 제외합니다. 학자금은 취업 후 상환 대출이라 소득이 없는 동안 월 지출을 만들지 않습니다.</Help>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[12.5px]">
            <span className="text-ink-2">자산</span>
            <span className="t-num font-semibold">{man(b.totalAssets)}</span>
          </div>
          <div className="flex h-8 gap-[2px] overflow-hidden rounded-lg">
            <div className="flex items-center bg-sky px-2 text-[11.5px] font-semibold whitespace-nowrap text-white" style={{ width: w(b.liquid) }}>
              가용현금 {man(b.liquid, false)}
            </div>
            <div className="hatch flex items-center border border-sky/30 bg-sky-soft px-2 text-[11.5px] whitespace-nowrap text-sky" style={{ width: w(b.deposit) }}>
              보증금 {man(b.deposit, false)}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[12.5px]">
            <span className="text-ink-2">부채</span>
            <span className="t-num font-semibold">{man(b.studentLoan)}</span>
          </div>
          <div className="flex h-8 items-center rounded-lg border border-caution/30 bg-caution-soft px-2 text-[11.5px] whitespace-nowrap text-caution" style={{ width: w(b.studentLoan) }}>
            학자금(취업 후 상환)
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-rule pt-4">
        {[
          ['순자산', man(b.netWorth)],
          ['지원 없이 버티는 기간', `${(b.runwayX10 / 10).toFixed(1)}개월`],
          ['의무상환(월)', a.inputs.iclMonthly ? `${man(a.inputs.iclMonthly)}${a.inputs.iclStart ? ` · ${ym(a.inputs.iclStart)}~` : ''}` : '0원(소득 전)'],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[11.5px] text-ink-3">{k}</div>
            <div className="t-num mt-0.5 text-[16px] text-navy">{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IclCalc({ onApply }: { onApply: (r: IclResult) => void }) {
  const [gross, setGross] = useState<number | null>(36_000_000)
  const [year, setYear] = useState(2028)
  const [rate, setRate] = useState(2000)
  const [r, setR] = useState<IclResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (gross == null) return
    cpaApi
      .icl({ grossAnnual: gross, incomeYear: year, rateBps: rate })
      .then((x) => {
        setR(x)
        setErr(null)
      })
      .catch((e) => setErr(errorText(e)))
  }, [gross, year, rate])
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-navy">
        <Calculator className="h-4 w-4 text-sky" /> 취업 후 상환 의무상환액 계산기 <Prov kind="official" />
        <Help>국세청 기준: 의무상환액 = (총급여 − 근로소득공제 − 상환기준소득) × 20%(대학원 25%). 2025년 귀속 상환기준소득 1,898만 원(총급여 2,851만 원). 다음 해 7월부터 12개월 원천공제. [S4]</Help>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[12px] text-ink-3">
          귀속연도 총급여(세전)
          <WonInput value={gross} onChange={setGross} className="mt-1 w-full" />
        </label>
        <label className="text-[12px] text-ink-3">
          귀속연도
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-rule-strong bg-white px-2 text-[14px] text-ink">
            {[2025, 2026, 2027, 2028, 2029].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-3">
          대출 구분
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-rule-strong bg-white px-2 text-[14px] text-ink">
            <option value={2000}>대학생(20%)</option>
            <option value={2500}>대학원생(25%)</option>
          </select>
        </label>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-alert">{err}</p>}
      {r && (
        <div className="mt-3 rounded-xl bg-[#f6f6f7] px-3 py-2.5 text-[12.5px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <span className="text-ink-3">근로소득공제</span>
            <span className="t-num text-right">{wonFull(r.deduction)}</span>
            <span className="text-ink-3">상환기준소득</span>
            <span className="t-num text-right">{wonFull(r.threshold)}</span>
            <span className="text-ink-3">연 의무상환액</span>
            <span className="t-num text-right font-semibold">{wonFull(r.annualObligation)}</span>
            <span className="text-ink-3">월 원천공제</span>
            <span className="t-num text-right font-semibold">{wonFull(r.monthlyWithholding)}</span>
          </div>
          <div className={cn('mt-2 text-[12px]', r.thresholdConfirmed ? 'text-good' : 'text-caution')}>
            {r.thresholdConfirmed ? `${r.thresholdYear}년 귀속 공식 기준 적용` : `${year}년 귀속 기준은 아직 공표되지 않아 ${r.thresholdYear}년 귀속 기준(${man(r.threshold)})을 대신 적용 — 검증 필요`}
            {' · '}원천공제 시작 {ym(r.withholdingFrom)}
          </div>
          <Btn variant="line" className="mt-2 h-8 text-[12.5px]" onClick={() => onApply(r)}>
            이 금액·시작 월을 고객 가정에 반영(적용 전 미리보기)
          </Btn>
        </div>
      )}
    </div>
  )
}

function FlowSchedule({ a }: { a: Analysis }) {
  const data = useMemo(() => a.short[0].months.map((m) => ({ month: m.month, support: m.support + m.base, need: m.living + m.exam + m.debt, gap: m.living + m.exam + m.debt - m.support - m.base })), [a])
  const peak = data.reduce((b, d) => (d.gap > b.gap ? d : b), data[0])
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-navy">
        18개월 유입과 필수 지출 — 전업 수험 기준 <Prov kind="engine" className="ml-auto" />
      </div>
      <div className="mt-2 h-[220px]">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={ymShort} tick={{ fontSize: 11, fill: 'var(--ink-3)' }} tickLine={false} axisLine={{ stroke: 'var(--rule-strong)' }} minTickGap={18} />
            <YAxis tickFormatter={(v: number) => `${v / 10_000}`} tick={{ fontSize: 11, fill: 'var(--ink-3)' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as (typeof data)[number]
                return (
                  <div className="rounded-xl border border-rule bg-white px-3 py-2 text-[12px] shadow-lg">
                    <div className="mb-1 font-semibold text-navy">{ym(r.month)}</div>
                    <div className="flex justify-between gap-6">
                      <span className="text-ink-2">지원·소득</span>
                      <span className="t-num">{man(r.support)}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-ink-2">필수 지출</span>
                      <span className="t-num">{man(r.need)}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-6 border-t border-rule pt-1 font-semibold">
                      <span>예금에서 메울 돈</span>
                      <span className="t-num text-caution">{man(r.gap)}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Area type="stepAfter" dataKey="need" stroke="var(--caution)" strokeWidth={2} fill="var(--caution)" fillOpacity={0.08} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="support" stroke="var(--sky)" strokeWidth={2} fill="#ffffff" fillOpacity={1} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="need" stroke="var(--caution)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded bg-caution" /> 필수 지출(생활비+수험비) · 만 원
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded bg-sky" /> 가족 지원 + 현재 소득
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-caution/15" /> 예금에서 메우는 부족분
        </span>
      </div>
      <Interpretation className="mt-3">
        지원과 지출의 차이를 매달 예금으로 메웁니다. 부족분은 지원이 끊기는 <b>{ym(peak.month)}</b>부터 월 <b>{man(peak.gap)}</b>로 가장 커집니다.
      </Interpretation>
    </div>
  )
}

function Schedule({ a }: { a: Analysis }) {
  const i = a.inputs
  const rows = [
    { m: i.startMonth, t: '분석 시작 · 공백 ① 시작', d: '정기 소득 없음', k: 'gap' },
    { m: i.supportReduceFrom, t: '가족 지원 감소', d: `월 ${man(i.supportInitial)} → ${man(i.supportReduced)}`, k: '' },
    { m: i.examMonth, t: '제2차 시험*', d: '공고 전 임시 일정', k: '' },
    { m: i.announceMonth, t: '합격 발표* · 가족 지원 0원', d: '공백 ② 시작(합격 시)', k: 'gap' },
    { m: a.tolerance[0].earliestPay, t: '가장 빠른 첫 급여', d: `수습 지연 L=${i.delay}개월 가정 시 ${ym(addM(a.tolerance[0].earliestPay, i.delay))}`, k: 'pay' },
  ].sort((x, y) => (x.m < y.m ? -1 : 1))
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-navy">
        일정과 두 번의 소득 공백 <Prov kind="validate" />
      </div>
      <ol className="relative space-y-3 border-l-2 border-sky/25 pl-5">
        {rows.map((r) => (
          <li key={r.t} className="relative">
            <span className={cn('absolute top-1 -left-[27px] h-3 w-3 rounded-full border-2 border-white', r.k === 'gap' ? 'bg-caution' : r.k === 'pay' ? 'bg-good' : 'bg-sky')} />
            <div className="t-num text-[12px] text-ink-3">{ym(r.m)}</div>
            <div className="text-[13.5px] font-medium text-ink">{r.t}</div>
            <div className="text-[12px] text-ink-2">{r.d}</div>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-xl bg-[#f6f6f7] px-3 py-2.5 text-[12.5px] text-ink-2">
        소득 공백 동안의 필수 지출: 월 {man(i.living + i.examCost)}(시험 전) → {man(i.living + i.examCostAfter)}(시험 후). 근로를 결정하면 첫 소득까지 {i.partTimeLead}개월, 구직은 첫 급여까지 {i.jobLead}개월이 걸린다고 가정합니다.
      </div>
    </div>
  )
}

function addM(s: string, n: number) {
  const [y, m] = s.split('-').map(Number)
  const k = y * 12 + m - 1 + n
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`
}

function Basis({ a }: { a: Analysis }) {
  const i = a.inputs
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 text-[13.5px] font-semibold text-navy">안전자금과 전환 신호의 기준</div>
      <div className="space-y-2">
        {[
          ['최소 안전자금', man(i.safetyMin), '필수 생활비 3개월분 — 고객과 합의하는 하한'],
          ['신호 1', man(i.signal1), '안전자금 + 생활비 3개월 → 근로 병행 시작'],
          ['신호 2', man(i.signal2), '안전자금 + 생활비 1개월 → 구직 착수·지출 조정'],
        ].map(([k, v, d]) => (
          <div key={k} className="flex items-center gap-3 rounded-xl border border-rule bg-white/80 px-3 py-2.5">
            <span className="w-24 text-[13px] text-ink-2">{k}</span>
            <span className="t-num w-28 text-[15px] font-semibold text-navy">{v}</span>
            <span className="text-[12.5px] text-ink-2">{d}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 text-[12.5px] sm:grid-cols-2">
        <div className="card-soft px-3 py-2">
          <div className="text-[11.5px] text-ink-3">출처 구분</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Prov kind="official" />
            <Prov kind="assumed" />
            <Prov kind="validate" />
            <Prov kind="engine" />
            <Prov kind="ai" />
          </div>
        </div>
        <div className="card-soft px-3 py-2">
          <div className="text-[11.5px] text-ink-3">반올림</div>
          <div>정수 원 계산 · 화면은 만 원 단위 반올림 · 현재가치는 원 단위 반올림(0.5 이상 올림)</div>
        </div>
      </div>
    </div>
  )
}
