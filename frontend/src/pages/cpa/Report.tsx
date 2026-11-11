import type { ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { cn } from '@/utils/format'
import { STATUS_META, useAiLog, useCpa } from '@/features/cpa/store'
import { evalClaim, useExperimentStatuses } from '@/features/cpa/verify'
import { STRATEGY_META, man, ym } from '@/features/cpa/meta'
import type { Analysis } from '@/features/cpa/types'
import { PageTitle } from '@/components/cpa/Shell'
import { CashChart } from '@/components/cpa/charts'
import { Btn, Prov, Skel } from '@/components/cpa/ui'

const IDS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']
const TITLES: Record<string, string> = {
  E1: '집단 합격률을 개인 확률로 오인',
  E2: '합격 즉시 급여 가정',
  E3: '부분합격 면제 기간 안내',
  E4: '학자금(ICL)을 월정액 대출로 처리',
  E5: '자격 미확인 지원금을 유입에 반영',
  E6: '장기 기대가치만으로 전략 선택',
  E7: '수습 미지정을 영구 무소득으로 단정',
  E8: '근거 없는 수익률·확정적 표현',
}

export default function Report() {
  const a = useCpa((s) => s.analysis)
  return (
    <div>
      <PageTitle
        eyebrow="6단계 · 점검 · 재무설계 보고서"
        title="보고서"
        lead="문제 정의 → 고객 상황 → 가정 → AI 분석 → 시나리오 비교 → 독립 검증 → 전환 규칙 → 실행 계획 → 한계. 지금 입력값으로 엔진이 계산한 결과를 그대로 묶었습니다."
        right={
          <Btn variant="solid" onClick={() => window.print()} className="cpa-chrome">
            <Printer className="h-4 w-4" /> 인쇄·PDF 저장
          </Btn>
        }
      />
      {!a ? <Skel className="h-[600px]" /> : <Body a={a} />}
    </div>
  )
}

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6 print:break-inside-avoid">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="t-num text-[13px] font-semibold text-sky">{String(n).padStart(2, '0')}</span>
        <h2 className="text-[17px] font-semibold text-navy">{title}</h2>
      </div>
      <div className="text-[13.5px] leading-relaxed text-ink">{children}</div>
    </section>
  )
}

function Body({ a }: { a: Analysis }) {
  const i = a.inputs
  const P = (s: string) => a.short.find((p) => p.strategy === s)!
  const A = P('A'),
    B = P('B'),
    D = P('D')
  const ver = useExperimentStatuses(IDS)
  const logs = useAiLog((s) => s.logs)
  const runs = ver.runs ?? []
  const results = runs.flatMap((r) => (r.claims ?? []).map((c) => ({ exp: r.experimentId, ...evalClaim(c, ver.analysisFor(c)) })))
  const ranked = a.long.strategies.filter((v) => v.rank != null).sort((x, y) => (x.rank ?? 9) - (y.rank ?? 9))
  const humanCount = IDS.filter((id) => logs[id] && logs[id].verdict !== 'unset').length

  return (
    <article className="print-area space-y-4">
      <div className="card bg-[linear-gradient(135deg,rgba(240,240,242,.9),rgba(255,255,255,.9))] p-6">
        <div className="eyebrow">AFPK 영 플래너 챌린지 2026 · 가상 고객 사례</div>
        <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-navy">합격해도 끝나지 않는다</h2>
        <p className="mt-1 text-[14px] text-ink-2">CPA 수험생의 소득 공백을 대비하는 AI 기반 조건부 재무설계 · 작성 {new Date().toLocaleDateString('ko-KR')} · 합성 데이터</p>
      </div>

      <Sec n={1} title="문제 정의">
        정기 소득 없이 마지막 유예를 앞둔 고객이 <b>합격 여부</b>와 <b>수습 확보 시점</b>이라는 두 단계의 불확실성 속에서 18개월 동안 지급능력을 지키고, 그 조건을 통과한 선택지 가운데 장기 재무가치가 큰 경로를 고르려면 지금 무엇을 해야 하는가. 이 보고서는 합격 가능성을 예측하지 않고, “얼마를 모을까”가 아니라 <b>“안전자금을 침범하지 않고 언제까지 버틸 수 있는가”</b>를 답합니다.
      </Sec>

      <Sec n={2} title="고객 상황">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['고객', '김유예(가명) · 27세 · 서울 · CPA 2차 마지막 유예(2027)'],
            ['가용현금', `${man(i.cash0)} (보증금 ${man(i.deposit)}은 제외)`],
            ['현재 소득', i.currentIncome ? `월 ${man(i.currentIncome)}` : '정기 소득 없음'],
            ['필수 생활비', `월 ${man(i.living)} (월세 ${man(i.rent)} 포함)`],
            ['가족 지원', `월 ${man(i.supportInitial)} → ${ym(i.supportReduceFrom)} ${man(i.supportReduced)} → ${ym(i.supportStopFrom)} 0원`],
            ['학자금', `${man(i.studentLoan)} · 취업 후 상환(소득 전 월 상환 없음)`],
          ].map(([k, v]) => (
            <div key={k} className="card-soft px-3 py-2">
              <div className="text-[11.5px] text-ink-3">{k}</div>
              <div className="text-[13px]">{v}</div>
            </div>
          ))}
        </div>
      </Sec>

      <Sec n={3} title="가정">
        <table className="w-full text-[12.5px]">
          <tbody>
            {[
              ['최소 안전자금', man(i.safetyMin), 'assumed'],
              ['전환 신호 1·2', `${man(i.signal1)} · ${man(i.signal2)}`, 'assumed'],
              ['근로 병행 소득 / 첫 소득까지', `월 ${man(i.partTimeIncome)} / ${i.partTimeLead}개월`, 'assumed'],
              ['시험·발표', `${ym(i.examMonth)}* · ${ym(i.announceMonth)}* (2027 시행계획 공고 전 임시)`, 'validate'],
              ['수습 급여·취업 임금', i.traineeSalary != null || i.jobWage != null ? `수습 ${man(i.traineeSalary)} · 취업 ${man(i.jobWage)} (확인 필요)` : '미입력 — 해당 경로는 계산하지 않음', 'validate'],
              ['ICL 상환 기준', '2025 귀속 상환기준소득 1,898만 원, 초과분 20% [S4]', 'official'],
              ['조건 p·q·L·r', `${i.pPct}% · ${i.qPct}% · ${i.delay}개월 · ${i.discountBps / 100}% (예측 아닌 시나리오 조건)`, 'assumed'],
            ].map(([k, v, p]) => (
              <tr key={k} className="border-b border-rule/70">
                <td className="py-1.5 pr-3 text-ink-2">{k}</td>
                <td className="py-1.5">{v}</td>
                <td className="py-1.5 text-right">
                  <Prov kind={p as 'assumed' | 'validate' | 'official'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sec>

      <Sec n={4} title="AI 분석">
        AI에게는 질문지·계산 코드·반론·설명문 초안을 맡기고, 모든 수치는 Rust 엔진으로 다시 계산했습니다. 비판적 검증을 위해 서버에서 Gemini를 실제로 호출해 {runs.length}건의 원출력을 편집 없이 보존했고({runs.map((r) => r.model).filter((v, k, s) => s.indexOf(v) === k).join(', ') || '—'}), 원출력에서 {results.length}개의 주장을 떼어 엔진 계산과 대조했습니다. AI 상담 화면의 기본 답변은 규칙 기반이며, 생성형 AI 답변은 요청 시에만 만들고 숫자를 엔진 값과 자동 대조합니다.
      </Sec>

      <Sec n={5} title="시나리오 비교">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead className="text-left text-ink-3">
              <tr className="border-b border-rule">
                {['전략', '최초 안전자금 위반', '18개월 최저 월말 잔액', '18개월 말 잔액', '합격 후 지연 내성'].map((h) => (
                  <th key={h} className="py-1.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="t-num">
              {a.short.map((p) => {
                const t = a.tolerance.find((x) => x.strategy === p.strategy)!
                const miss = p.missing.length > 0
                return (
                  <tr key={p.strategy} className="border-b border-rule/60">
                    <td className="py-1.5">{STRATEGY_META[p.strategy].name}</td>
                    <td className={cn('py-1.5', p.tau && 'text-caution')}>{miss ? '입력 필요' : ym(p.tau)}</td>
                    <td className="py-1.5">{miss ? '—' : man(p.minCash)}</td>
                    <td className="py-1.5">{miss ? '—' : man(p.endCash)}</td>
                    <td className="py-1.5">{p.strategy === 'C' ? '해당 없음' : t.months == null ? '발표 전 도달' : t.openEnded ? `${t.months}개월 이상` : `${t.months}개월`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <CashChart a={a} focus={null} height={250} showMarkers={false} />
        </div>
        <p className="mt-2">
          {a.long.available ? (
            <>60개월 비교(통과 전략만): {ranked.map((v) => `${v.rank}위 ${STRATEGY_META[v.strategy].name} ${man(v.value)}`).join(' · ')} — 가정 조건에 따른 비교이며 예측이 아닙니다.</>
          ) : (
            <>60개월 비교는 수습 급여·취업 임금 자료가 확정되지 않아 계산하지 않았습니다.</>
          )}
        </p>
      </Sec>

      <Sec n={6} title="독립 검증">
        <div className="grid gap-2 sm:grid-cols-2">
          {IDS.map((id) => {
            const st = ver.byExp[id]?.status ?? 'notRun'
            const rs = results.filter((r) => r.exp === id)
            return (
              <div key={id} className="flex items-center gap-2 rounded-xl border border-rule bg-white/70 px-3 py-2">
                <span className="rounded bg-sky-soft px-1.5 text-[11.5px] font-bold text-sky">{id}</span>
                <span className="min-w-0 flex-1 text-[12.5px]">{TITLES[id]}</span>
                <span className="t-num text-[11px] text-ink-3">주장 {rs.length}</span>
                <span className={cn('rounded-full px-2 py-[1px] text-[11px] font-semibold', STATUS_META[st].cls)}>{STATUS_META[st].label}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-2">
          주장 {results.length}건 중 계산 일치 {results.filter((r) => r.status === 'match').length} · 오류 발견 {results.filter((r) => r.status === 'error').length} · 검토 필요·근거 부족 {results.filter((r) => r.status === 'review' || r.status === 'insufficient').length}. 사람의 최종 판정 기록 {humanCount}/8건{humanCount < 8 ? ' — 나머지는 계산 판정 상태이며 사람의 확인이 남아 있습니다' : ''}.
        </p>
      </Sec>

      <Sec n={7} title="전환 규칙">
        <ul className="space-y-1">
          <li>· 신호 1: 월말 가용현금 ≤ {man(i.signal1)} → 다음 달부터 근로 병행(첫 소득까지 {i.partTimeLead}개월) · 예상 {ym(a.signals.items[0].ruleTrigger)}</li>
          <li>· 신호 2: 월말 가용현금 ≤ {man(i.signal2)} → 구직 착수·지출 축소 · 예상 {ym(a.signals.items[1].ruleTrigger)}</li>
          <li>· 신호 3: {ym(i.announceMonth)}* 합격 → 수습 지연 L을 넣어 다시 계산(D 지연 내성 {a.tolerance.find((t) => t.strategy === 'D')?.months ?? 0}개월)</li>
          <li>· 신호 4: {ym(i.announceMonth)}* 불합격 → 취업 전환 실행, 재도전은 별도 상담</li>
        </ul>
        <p className="mt-2 text-ink-2">{a.signals.ruleBreach ? `규칙을 실행해도 ${ym(a.signals.ruleBreach)}에 안전자금 아래(${man(a.signals.ruleBreachCash)})로 내려가므로, 그 전에 재상담합니다.` : '규칙을 실행하면 18개월 동안 안전자금을 지킵니다.'}</p>
      </Sec>

      <Sec n={8} title="실행 계획">
        <ul className="space-y-1">
          <li>· 매월 말: 가용현금 기록 → 신호 1·2와 비교</li>
          <li>· {ym(i.supportReduceFrom)}: 가족 지원 감소 → 변동 지출 재조정, 근로처 탐색 시작</li>
          {D.events
            .filter((e) => e.kind === 'signal1' || e.kind === 'partTimeStart' || e.kind === 'signal2')
            .map((e) => (
              <li key={e.kind}>· {ym(e.month)}: {e.kind === 'signal1' ? '신호 1 발동 → 근로 병행 결정' : e.kind === 'partTimeStart' ? `근로 소득 시작(월 ${man(i.partTimeIncome)})` : '신호 2 발동 → 구직 착수·지출 축소'}</li>
            ))}
          <li>· {ym(i.announceMonth)}*: 발표 후 전략 재계산(신호 3·4), 학자금 의무상환 기준 재확인</li>
          <li>· 수습처 미확보가 길어지면: 지연 내성을 넘기 전에 취업 전환 검토</li>
        </ul>
        <p className="mt-2 text-ink-2">
          전업 유지(A) 대비 규칙 실행(D)은 안전자금 도달을 {ym(A.tau)} → {ym(D.tau)}로 늦추고, 처음부터 병행(B)하면 18개월 말 {man(B.endCash)}이 남습니다.
        </p>
      </Sec>

      <Sec n={9} title="한계 및 주의사항">
        <ul className="space-y-1 text-ink-2">
          <li>· 고객과 금액은 합성 데이터이며 국가 통계가 아닙니다.</li>
          <li>· 2027년 시험·발표 일정, 수습 보수, 취업 임금은 공식 확인 전입니다. 확인 후 다시 계산해야 합니다.</li>
          <li>· p·q는 개인의 합격·수습 확률이 아니라 결론이 바뀌는 경계를 찾기 위한 조건입니다.</li>
          <li>· 근로 병행에 따른 합격 조건 하락폭은 근거 자료가 없는 가정입니다.</li>
          <li>· AI 원출력 대조는 기본 가정 기준이며, 사람의 최종 판정이 없는 항목은 확정 결론으로 쓰지 않습니다.</li>
          <li>· 이 보고서는 투자 권유나 직업 선택 권고가 아니며, 최종 결정은 고객이 내립니다.</li>
        </ul>
      </Sec>
    </article>
  )
}
