import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, Printer } from 'lucide-react'
import { cn } from '@/utils/format'
import { useCpa } from '@/features/cpa/store'
import { MODE_LABEL, STRATEGY_META, addMonths, man, monthsBetween, ym } from '@/features/cpa/meta'
import type { Analysis, CpaInputs } from '@/features/cpa/types'
import { PageTitle } from '@/components/cpa/Shell'
import { CheckinSection } from '@/components/cpa/checkin'
import { CashChart } from '@/components/cpa/charts'
import { Btn, Callout, Help, Interpretation, Prov, SectionHead, Skel } from '@/components/cpa/ui'

export default function Plan() {
  const { analysis: a, inputs: i } = useCpa()
  return (
    <div>
      <PageTitle
        eyebrow="5단계 · 실행 · 6단계 · 점검"
        title="실행 계획"
        lead="할 일 목록이 아니라 전환 규칙을 실행하는 도구입니다. 잔액이 어느 선에 닿으면 무엇을 바꿀지 미리 합의하고, 매달 점검합니다. 조건부 전환(D)은 네 번째 선택지가 아니라 A·B·C 사이를 이동하는 실행 규칙입니다."
        right={
          <Btn variant="line" onClick={() => window.print()} className="cpa-chrome">
            <Printer className="h-4 w-4" /> 결과 요약 출력
          </Btn>
        }
      />
      {!a || !i ? <Skel className="h-[480px]" /> : <Body a={a} i={i} />}
    </div>
  )
}

function Body({ a, i }: { a: Analysis; i: CpaInputs }) {
  const A = a.short.find((p) => p.strategy === 'A')!
  const D = a.short.find((p) => p.strategy === 'D')!
  const s = a.signals
  const sig = (n: number) => s.items.find((x) => x.id === n)!
  const tolD = a.tolerance.find((t) => t.strategy === 'D')!
  const s1 = sig(1),
    s2 = sig(2)

  const cards = [
    {
      id: 1,
      when: '매월 말',
      cond: `가용현금 ≤ ${man(i.signal1)}`,
      condHelp: '안전자금 + 생활비 3개월',
      status: s1.triggeredNow ? '지금 발동' : s1.ruleTrigger ? `${ym(s1.ruleTrigger)} 예상` : '18개월 내 발동 없음',
      tone: s1.triggeredNow ? 'alert' : s1.ruleTrigger ? 'caution' : 'good',
      action: `다음 달부터 근로 병행을 시작한다 (A → B). 첫 소득까지 ${i.partTimeLead}개월 준비 기간을 둔다.`,
      delay: A.tau ? `근로를 시작하지 않으면 ${ym(A.tau)}에 안전자금이 깨지고(${man(A.tauCash)}), ${A.insolvent ? `${ym(A.insolvent)}에는 월세·생활비를 낼 수 없습니다.` : '이후 잔액이 계속 줄어듭니다.'}` : '전업을 유지해도 18개월 안에 안전자금이 깨지지 않습니다.',
      detail: s1.ruleTriggerCash != null ? `발동 시 잔액 ${man(s1.ruleTriggerCash)} · 근로소득 ${s1.effectFrom ? ym(s1.effectFrom) : '—'}부터` : null,
    },
    {
      id: 2,
      when: '매월 말',
      cond: `가용현금 ≤ ${man(i.signal2)}`,
      condHelp: '안전자금 + 생활비 1개월',
      status: s2.triggeredNow ? '지금 발동' : s2.ruleTrigger ? `${ym(s2.ruleTrigger)} 예상` : '18개월 내 발동 없음',
      tone: s2.triggeredNow ? 'alert' : s2.ruleTrigger ? 'caution' : 'good',
      action: `구직 준비에 착수하고 지출을 필수 항목으로 줄인다 (→ C 준비). 첫 급여까지 ${i.jobLead}개월을 가정한다.`,
      delay: s2.ruleTrigger ? (i.jobWage == null ? '취업 임금이 입력되지 않아 전환 효과는 계산에 넣지 않았습니다. 임금을 입력하면 구직 효과를 반영합니다.' : `구직을 미루면 근로 병행 소득만으로는 ${D.tau ? `${ym(D.tau)} 위반을 피하지 못합니다.` : '잔액 감소가 계속됩니다.'}`) : '규칙대로 근로를 시작하면 18개월 안에는 발동하지 않습니다.',
      detail: s2.ifNoAction ? `전업 유지 시 ${ym(s2.ifNoAction)}에 도달` : null,
    },
    {
      id: 3,
      when: `${ym(i.announceMonth)}* 발표`,
      cond: '합격',
      condHelp: '',
      status: `발표 시 잔액 ${man(s.cashAtAnnounce)}`,
      tone: 'sky',
      action: '수습 지연 L을 0·3·6·9개월로 두고 잔액을 다시 계산해 근로 유지 여부를 정한다.',
      delay: tolD.months == null ? '발표 전에 이미 안전자금 아래입니다. 합격해도 첫 급여까지 버틸 수 없습니다.' : `지금 계획(D)으로는 첫 급여가 ${tolD.openEnded ? `${tolD.months}개월 이상` : `${tolD.months}개월`}까지 늦어져도 버팁니다. 그보다 늦으면 근로를 유지해야 합니다.`,
      detail: null,
    },
    {
      id: 4,
      when: `${ym(i.announceMonth)}* 발표`,
      cond: '불합격',
      condHelp: '',
      status: '유예 종료',
      tone: 'sky',
      action: '취업 전환 계획을 실행하고, 재도전 여부는 별도 상담으로 다룬다.',
      delay: `구직 ${i.jobLead}개월 동안 필수지출을 메울 수 있는지가 관건입니다 — ② 탭의 불합격 경로에서 확인합니다.`,
      detail: null,
    },
  ] as const

  // 월별 실행 계획: D 경로 + 일정 표식에서 행동이 필요한 달만 추린다
  type Row = { month: string; what: string; action: string; tone?: 'alert' | 'caution' | 'sky' }
  const rows: Row[] = []
  rows.push({ month: i.startMonth, what: '계획 시작 · 월말 잔액 점검 시작', action: `신호 1·2 임계값(${man(i.signal1, false)}·${man(i.signal2, false)}만 원)과 안전자금(${man(i.safetyMin, false)}만 원)을 고객과 합의` })
  rows.push({ month: i.supportReduceFrom, what: `가족 지원 ${man(i.supportInitial, false)}→${man(i.supportReduced, false)}만 원`, action: '변동 지출 점검, 근로처 탐색을 미리 시작' })
  rows.push({ month: i.examMonth, what: '제2차 시험*', action: '시험 직후 근로 시작이 가능하도록 지원서 준비' })
  for (const e of D.events) {
    if (e.kind === 'signal1') rows.push({ month: e.month, what: '신호 1 발동', action: `근로 병행 결정 → ${ym(addMonths(e.month, i.partTimeLead))} 첫 소득`, tone: 'caution' })
    if (e.kind === 'partTimeStart') rows.push({ month: e.month, what: `근로 병행 소득 시작(월 ${man(i.partTimeIncome, false)}만 원)`, action: '근로 시간과 남은 수험 일정 조정' })
    if (e.kind === 'signal2') rows.push({ month: e.month, what: '신호 2 발동', action: '구직 착수 · 지출을 필수 항목으로 축소', tone: 'caution' })
    if (e.kind === 'jobStart') rows.push({ month: e.month, what: '취업 첫 급여', action: '안전자금 재적립 계획' })
  }
  rows.push({ month: i.announceMonth, what: '합격 발표* · 가족 지원 종료', action: '전략 재계산: 신호 3(합격 → 지연 L을 넣어 다시 계산) 또는 신호 4(불합격 → 취업 전환)', tone: 'sky' })

  if (tolD?.months != null && !tolD.openEnded) rows.push({ month: addMonths(i.announceMonth, tolD.months), what: '수습처 미확보가 이어지면', action: `지연 내성(${tolD.months}개월)의 끝 — 이 달까지 수습처가 없으면 취업 전환 검토`, tone: 'caution' })
  rows.push({ month: addMonths(i.announceMonth, 1), what: '부채 상환 조건 재확인', action: '급여가 생기면 학자금 의무상환 기준(국세청)을 다시 확인 — 원천공제는 귀속연도 다음 해 7월부터' })
  if (D.tau) rows.push({ month: D.tau, what: `안전자금 위반(${man(D.tauCash)})`, action: '이 달 전에 재상담: 지출 조정·근로 시간 확대·구직 일정 앞당기기', tone: 'alert' })
  rows.sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : 0))
  const cashAt = (m: string) => D.months.find((r) => r.month === m)

  return (
    <div className="space-y-8">
      <section>
        <SectionHead eyebrow="고객에게 건네는 전환 규칙 카드" title="잔액 신호와 행동" help="예상 발동 시점은 지금 입력값으로 Rust 엔진이 계산한 조건부 전환(D) 경로 기준입니다. 근로·취업이 다음 달 바로 가능하다고 확정하지 않고 준비 기간을 따로 반영합니다." right={<span className="flex items-center gap-1.5 text-[12.5px] text-ink-2">현재 가용현금 <b className="t-num text-navy">{man(i.cash0)}</b></span>} />
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="card flex flex-col p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-sky-soft px-2 py-0.5 text-[12px] font-semibold text-sky">신호 {c.id}</span>
                <span className="text-[12px] text-ink-3">{c.when}</span>
                <span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-semibold', c.tone === 'alert' && 'bg-caution-soft text-caution', c.tone === 'caution' && 'bg-caution-soft text-caution', c.tone === 'good' && 'bg-good-soft text-good', c.tone === 'sky' && 'bg-sky-soft text-sky')}>{c.status}</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[15px] font-semibold text-navy">
                발동 조건: {c.cond}
                {c.condHelp && <Help>{c.condHelp} — 고객과 합의해 확정하는 예시값입니다.</Help>}
              </div>
              {c.detail && <div className="mt-0.5 text-[12.5px] text-ink-2">{c.detail}</div>}
              <dl className="mt-3 grid gap-2 text-[13px]">
                <div className="rounded-lg bg-paper-2 px-3 py-2">
                  <dt className="text-[11.5px] text-ink-3">실행할 행동</dt>
                  <dd className="mt-0.5 text-ink">{c.action}</dd>
                </div>
                <div className="rounded-lg border border-caution/20 bg-caution-soft/60 px-3 py-2">
                  <dt className="text-[11.5px] text-caution">행동을 미뤘을 때</dt>
                  <dd className="mt-0.5 text-ink">{c.delay}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        {s.ruleBreach ? (
          <Callout tone="caution" className="mt-4" title="전환 규칙을 실행해도 안전자금을 지키지 못하는 구간">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
              <span>
                규칙대로 근로를 시작해도 <b>{ym(s.ruleBreach)}</b>에 월말 잔액이 {man(s.ruleBreachCash)}으로 안전자금 아래로 내려갑니다{s.ruleInsolvent ? `, ${ym(s.ruleInsolvent)}에는 월중 지급도 불가능합니다` : ''}. 규칙이 지켜 주지 못하는 구간을 고객에게 그대로 알리고, 그 전에 지출 조정·근로 확대·구직 일정을 다시 협의합니다.
              </span>
            </div>
          </Callout>
        ) : (
          <Callout tone="good" className="mt-4" title="규칙 실행 시">
            전환 규칙을 지키면 18개월 동안 월말 잔액이 안전자금 이상으로 유지됩니다(결과 상태 미반영 기준선).
          </Callout>
        )}
        {s.notes.length > 0 && <p className="mt-2 text-[12.5px] text-caution">※ {s.notes.join(' ')}</p>}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <SectionHead eyebrow="월별 실행 계획" title="언제 무엇을 하는가" help="조건부 전환(D) 경로의 엔진 결과에서 행동이 필요한 달만 추렸습니다. 잔액은 결과 상태(합격·불합격)를 반영하지 않은 기준선입니다." />
          <div className="card divide-y divide-rule">
            {rows.map((r, k) => {
              const m = cashAt(r.month)
              return (
                <div key={k} className="grid grid-cols-[70px_1fr] gap-3 px-4 py-3 sm:grid-cols-[80px_1fr_110px]">
                  <div className="t-num text-[13px] font-semibold text-navy">{ym(r.month)}</div>
                  <div>
                    <div className={cn('text-[13.5px] font-medium', r.tone === 'alert' ? 'text-caution' : r.tone === 'caution' ? 'text-caution' : r.tone === 'sky' ? 'text-sky' : 'text-ink')}>{r.what}</div>
                    <div className="text-[12.5px] text-ink-2">{r.action}</div>
                  </div>
                  <div className="col-start-2 text-[12px] text-ink-3 sm:col-start-auto sm:text-right">
                    {m && (
                      <>
                        <div className="t-num text-[13px] text-ink">{man(m.cash)}</div>
                        <div>{MODE_LABEL[m.mode]}</div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold text-navy">
              규칙 실행(D) vs 전업 유지(A) <Prov kind="engine" />
            </div>
            <CashChart a={a} focus={null} visible={['A', 'D']} height={230} showMarkers={false} />
          </div>
          <Interpretation>
            {D.tau && A.tau ? (
              <>규칙을 실행하면 안전자금 위반이 {ym(A.tau)}에서 {ym(D.tau)}로 {monthsBetween(A.tau, D.tau)}개월 늦춰집니다. 그 사이 시험 결과가 나오므로, 결과에 따라 신호 3·4로 계획을 다시 세울 시간이 생깁니다.</>
            ) : A.tau ? (
              <>규칙을 실행하면 {ym(A.tau)}의 안전자금 위반을 피합니다.</>
            ) : (
              <>현재 조건에서는 전업도 18개월 안전자금을 지킵니다. 신호는 조건이 나빠질 때를 대비한 안전장치입니다.</>
            )}
          </Interpretation>
          <Recheck />
        </div>
      </section>

      <CheckinSection i={i} />

      <section className="hidden print:block">
        <div className="card p-4 text-[12.5px]">
          <div className="font-semibold">요약 (출력용)</div>
          <div>
            고객: 김유예(가상) · 가용현금 {man(i.cash0)} · 안전자금 {man(i.safetyMin)} · 전략별 최초 위반월:{' '}
            {a.short.map((p) => `${p.strategy} ${STRATEGY_META[p.strategy].short} ${p.missing.length ? '입력 필요' : p.tau ? ym(p.tau) : '없음'}`).join(' / ')}
          </div>
          <div>출력 시점의 가정값으로 Rust 엔진이 계산한 결과이며, 합성 데이터 사례입니다.</div>
        </div>
      </section>

      <div className="cpa-chrome flex justify-end">
        <Link to="/report" className="text-[14px] font-medium text-sky hover:underline">
          보고서에서 전체 흐름 보기 →
        </Link>
      </div>
    </div>
  )
}

const CHECKS = [
  { id: 'monthly', t: '매월 말 가용현금을 기록하고 신호 1·2 임계값·안전자금 하한과 비교한다' },
  { id: 'support', t: '가족 지원이 줄어드는 달에 변동 지출을 다시 조정한다' },
  { id: 'expense', t: '분기마다 필수 생활비(월세 포함) 변동을 확인한다' },
  { id: 'notice', t: '2027년 시행계획 공고로 시험·발표 일정을 확정해 다시 계산한다' },
  { id: 'icl', t: '취업 후 상환 학자금 의무상환 기준을 국세청 자료로 확인한다' },
  { id: 'announce', t: '발표 직후 신호 3·4에 따라 계획을 다시 세운다' },
  { id: 'trainee', t: '수습처 확정 시 첫 급여월을 넣고 잔액을 재계산한다' },
]

function Recheck() {
  const KEY = 'cpa.recheck.v1'
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(done))
    } catch {
      /* 무시 */
    }
  }, [done])
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-navy">
        <CalendarClock className="h-4 w-4 text-sky" /> 재점검 계획
        <span className="ml-auto text-[12px] font-normal text-ink-3">
          {Object.values(done).filter(Boolean).length}/{CHECKS.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {CHECKS.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input type="checkbox" className="mt-1" checked={!!done[c.id]} onChange={(e) => setDone((d) => ({ ...d, [c.id]: e.target.checked }))} />
              <span className={cn(done[c.id] && 'text-ink-3 line-through')}>{c.t}</span>
              {done[c.id] && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-good" />}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
