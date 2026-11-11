// 표시용 메타데이터(라벨·단위·출처 구분). 계산은 하지 않는다.
import type { CpaInputs, Mode, Outcome, Strategy } from './types'

export const STRATEGY_META: Record<Strategy, { name: string; short: string; desc: string; color: string; check: string }> = {
  A: { name: '전업 수험', short: '전업', desc: '보유자금과 가족 지원으로 시험 준비에 집중', color: 'var(--s-a)', check: '수습 소득이 시작되기 전에 자금이 부족해지는가?' },
  B: { name: '근로 병행', short: '병행', desc: '처음부터 월 근로소득을 얻으며 수험 지속', color: 'var(--s-b)', check: '현금흐름 개선과 수험시간 감소를 함께 반영했는가?' },
  C: { name: '취업 전환', short: '취업', desc: '수험을 중단하고 구직기간 이후 임금소득 확보', color: 'var(--s-c)', check: '구직기간의 비용과 유예 기회 포기를 반영했는가?' },
  D: { name: '조건부 전환', short: '조건부', desc: 'A로 시작하되 잔액 신호에 따라 B·C로 이동하는 실행 규칙', color: 'var(--s-d)', check: '전환이 실제 자금 부족 이전에 실행 가능한가?' },
}

export const MODE_LABEL: Record<Mode, string> = {
  study: '전업 수험',
  studyWork: '근로 병행',
  job: '취업 근로',
  trainee: '수습 근무',
  cpa: '회계사 근무',
  search: '구직 중',
}

export function outcomeLabel(o: Outcome): string {
  switch (o.kind) {
    case 'unresolved':
      return '결과 미반영'
    case 'passPlaced':
      return `합격 · 수습 확보 (L=${o.delay})`
    case 'passUnplaced':
      return '합격 · 미지정'
    case 'fail':
      return '불합격'
  }
}

/** 출처 구분: 공식 확인 / 팀 가정 / 검증 필요 / 엔진 계산 / AI 생성 / 사용자 입력 */
export type Prov = 'official' | 'assumed' | 'validate' | 'engine' | 'ai' | 'input'
export const PROV_META: Record<Prov, { label: string; cls: string; help: string }> = {
  official: { label: '공식 확인', cls: 'bg-good-soft text-good', help: '공식 공고·발표로 확인한 사실' },
  assumed: { label: '팀 가정', cls: 'bg-sky-soft text-sky', help: '팀이 정한 가상 고객 설정값(국가 통계 아님)' },
  validate: { label: '검증 필요', cls: 'bg-caution-soft text-caution', help: '원문·현실성 대조 전에는 결과에 넣지 않거나 결과를 확정하지 않는 값' },
  engine: { label: '엔진 계산', cls: 'bg-[#18181b] text-white', help: 'Rust 계산 엔진이 입력값으로 계산한 결과(결정론적)' },
  ai: { label: 'AI 생성', cls: 'bg-violet-soft text-violet-ink', help: '생성형 AI 출력 — 검증 전에는 사실로 쓰지 않음' },
  input: { label: '직접 입력', cls: 'bg-paper-2 text-ink-2', help: '사용자가 기본값에서 바꾼 값' },
}

export type FieldKind = 'won' | 'month' | 'count' | 'pct' | 'bps'

/** 화면 그룹과 무관하게 키로 찾는 추가 필드 */
export const EXTRA_FIELDS: FieldMeta[] = [
  { key: 'currentIncome', label: '현재 정기 근로소득(월)', kind: 'won', prov: 'assumed', help: '0원 = 무소득. 입력하면 모든 전략에 월말 소득으로 더합니다.', min: 0, max: 3_000_000, step: 50_000 },
  { key: 'iclStart', label: '의무상환 원천공제 시작 월', kind: 'month', prov: 'official', help: '국세청: 귀속연도 다음 해 7월부터 12개월 원천공제. 비우면 급여가 있는 모든 달에 차감.', optional: true },
  { key: 'delay', label: '합격 후 첫 급여까지 추가 대기 L', kind: 'count', prov: 'validate', help: '발표 다음 달부터 첫 수습 급여까지 추가로 기다리는 개월. 60개월 비교에 사용.', min: 0, max: 12, step: 1 },
  { key: 'pPct', label: '합격 조건 p(%)', kind: 'count', prov: 'assumed', help: '예측 확률이 아닌 시나리오 조건.', min: 0, max: 100, step: 5 },
  { key: 'qPct', label: '수습 확보 조건 q(%)', kind: 'count', prov: 'assumed', help: '수습기관 등록률을 직접 쓰지 않는 시나리오 조건.', min: 0, max: 100, step: 5 },
]

export type FieldMeta = { key: keyof CpaInputs; label: string; kind: FieldKind; prov: Prov; help: string; min?: number; max?: number; step?: number; optional?: boolean }

export const FIELD_GROUPS: { title: string; fields: FieldMeta[] }[] = [
  {
    title: '자산·부채',
    fields: [
      { key: 'cash0', label: '가용 현금성 예금', kind: 'won', prov: 'assumed', help: '유동성 분석의 출발점(분석 시작 직전 잔액).', min: 0, max: 50_000_000, step: 100_000 },
      { key: 'deposit', label: '주거 보증금', kind: 'won', prov: 'assumed', help: '자산에는 포함하지만 매달 쓸 수 있는 돈이 아니므로 가용현금에서 제외합니다.', min: 0, max: 100_000_000, step: 1_000_000 },
      { key: 'studentLoan', label: '학자금 대출 잔액(취업 후 상환)', kind: 'won', prov: 'assumed', help: '취업 후 상환(ICL) 가정. 의무상환액은 소득 요건에 따라 정해지므로 잔액만으로 월 지출을 만들지 않습니다.', min: 0, max: 100_000_000, step: 1_000_000 },
      { key: 'iclMonthly', label: '의무상환액(월)', kind: 'won', prov: 'validate', help: '국세청 상환기준소득을 확인하기 전에는 0원. 입력하면 급여가 있는 달에만 차감합니다.', min: 0, max: 2_000_000, step: 10_000 },
      { key: 'otherDebtPayment', label: '그 밖의 채무지급(월)', kind: 'won', prov: 'assumed', help: '실제로 매달 내야 하는 다른 채무 지급액. 기본 0원.', min: 0, max: 2_000_000, step: 10_000 },
    ],
  },
  {
    title: '지출',
    fields: [
      { key: 'living', label: '필수 생활비(월)', kind: 'won', prov: 'assumed', help: '월세를 포함한 필수 생활비.', min: 300_000, max: 4_000_000, step: 50_000 },
      { key: 'rent', label: '그중 월세', kind: 'won', prov: 'assumed', help: '표시용. 생활비에 이미 포함되어 있습니다.', min: 0, max: 2_000_000, step: 10_000 },
      { key: 'examCost', label: '수험 관련 비용(월)', kind: 'won', prov: 'assumed', help: '시험 전 수험 비용.', min: 0, max: 1_000_000, step: 10_000 },
      { key: 'examCostAfter', label: '시험 후 수험 비용(월)', kind: 'won', prov: 'assumed', help: '변경 월부터 적용. 근로·수습 소득이 시작되면 0원.', min: 0, max: 1_000_000, step: 10_000 },
      { key: 'examCostChange', label: '수험 비용 변경 월', kind: 'month', prov: 'assumed', help: '기획서: 2027년 6월까지 20만 원.' },
    ],
  },
  {
    title: '가족 지원',
    fields: [
      { key: 'supportInitial', label: '초기 지원(월)', kind: 'won', prov: 'assumed', help: '분석 시작 시점의 가족 지원.', min: 0, max: 2_000_000, step: 50_000 },
      { key: 'supportReduced', label: '감액 후 지원(월)', kind: 'won', prov: 'assumed', help: '감액 월부터 적용.', min: 0, max: 2_000_000, step: 50_000 },
      { key: 'supportReduceFrom', label: '감액 시작 월', kind: 'month', prov: 'assumed', help: '' },
      { key: 'supportStopFrom', label: '지원 중단 월', kind: 'month', prov: 'assumed', help: '이 달부터 가족 지원 0원.' },
    ],
  },
  {
    title: '근로·취업',
    fields: [
      { key: 'partTimeIncome', label: '근로 병행 소득(월)', kind: 'won', prov: 'assumed', help: '전략 B·D에 적용하는 파트타임 세후 소득.', min: 0, max: 2_500_000, step: 50_000 },
      { key: 'partTimeLead', label: '근로 결정 → 첫 소득', kind: 'count', prov: 'assumed', help: '구직·면접·채용·첫 급여까지 걸리는 개월. 1 = 다음 달(기획서 09 예시와 같은 가정).', min: 1, max: 6, step: 1 },
      { key: 'jobWage', label: '취업 전환 세후 월급', kind: 'won', prov: 'validate', help: '기본값 270만 원: 경총 대졸 초임 분석(2025.01) 정규직 평균 연 3,675만 원의 세후 근사. 비우면 C·불합격·미지정 경로를 계산하지 않습니다.', min: 0, max: 6_000_000, step: 50_000, optional: true },
      { key: 'jobLead', label: '구직 → 첫 급여', kind: 'count', prov: 'assumed', help: '구직을 시작한 달 말부터 첫 급여가 들어오는 달까지.', min: 1, max: 12, step: 1 },
    ],
  },
  {
    title: '일정(공고 확인 전 임시)',
    fields: [
      { key: 'examMonth', label: '제2차 시험 월', kind: 'month', prov: 'validate', help: '2027.06: 2026년 제61회 제2차가 6월 27~28일 시행된 일정 기준. 2027년 제62회 시행계획은 2026.11 현재 미공고(예년 11월 말 공고).' },
      { key: 'announceMonth', label: '합격 발표 월', kind: 'month', prov: 'validate', help: '2027.09: 2026년 제61회 최종 합격자가 9월 1일 발표된 일정 기준. 공고 후 확인 필요.' },
    ],
  },
  {
    title: '안전자금·전환 신호',
    fields: [
      { key: 'safetyMin', label: '최소 안전자금', kind: 'won', prov: 'assumed', help: '필수 생활비 3개월분 — 고객과 합의하는 하한.', min: 0, max: 15_000_000, step: 100_000 },
      { key: 'signal1', label: '신호 1 임계값', kind: 'won', prov: 'assumed', help: '안전자금 + 생활비 3개월. 이하가 되면 근로 병행 시작.', min: 0, max: 20_000_000, step: 100_000 },
      { key: 'signal2', label: '신호 2 임계값', kind: 'won', prov: 'assumed', help: '안전자금 + 생활비 1개월. 이하가 되면 구직 착수·지출 조정.', min: 0, max: 20_000_000, step: 100_000 },
      { key: 'signal2Cut', label: '신호 2 지출 절감(월)', kind: 'won', prov: 'assumed', help: '신호 2 발동 다음 달부터 줄이는 생활비. 기본 0원(필수 항목만 남긴다는 가정치는 고객과 합의 후 입력).', min: 0, max: 1_000_000, step: 10_000 },
    ],
  },
]

export const LONG_FIELDS: FieldMeta[] = [
  { key: 'traineeSalary', label: '수습 기간 세후 월급', kind: 'won', prov: 'validate', help: '기본값 320만 원: 대형 회계법인 수습 연봉 인하 검토 보도(4천만~5천만 원대) 중 연 4,500만 원의 세후 근사. 비우면 합격·수습 경로를 계산하지 않습니다.', min: 0, max: 8_000_000, step: 50_000, optional: true },
  { key: 'cpaSalary', label: '수습 이후 세후 월급', kind: 'won', prov: 'validate', help: '기본값 410만 원: 대형 회계법인 현행 하단 연 6,000만 원의 세후 근사(아시아경제 2025.03).', min: 0, max: 10_000_000, step: 50_000, optional: true },
  { key: 'jobWage', label: '취업 전환 세후 월급', kind: 'won', prov: 'validate', help: 'C·불합격·미지정 경로의 대체 근로소득. 기본값 270만 원(경총 2025.01 대졸 정규직 평균 초임 세후 근사).', min: 0, max: 6_000_000, step: 50_000, optional: true },
  { key: 'traineeMonths', label: '수습 기간', kind: 'count', prov: 'official', help: '등록에 필요한 최소 1년의 실무수습 [S3].', min: 12, max: 24, step: 1 },
]

export const MISSING_LABEL: Record<string, string> = {
  jobWage: '취업 전환 세후 월급',
  traineeSalary: '수습 기간 세후 월급',
  cpaSalary: '수습 이후 세후 월급',
}

// ── 서식 ──
const nf = new Intl.NumberFormat('ko-KR')
/** 만 원 단위(소수 없이). 음수는 − 기호 */
export function man(v: number | null | undefined, unit = true): string {
  if (v == null) return '—'
  const m = Math.round(v / 10_000)
  const s = `${m < 0 ? '−' : ''}${nf.format(Math.abs(m))}`
  return unit ? `${s}만 원` : s
}
export const wonFull = (v: number | null | undefined) => (v == null ? '—' : `${v < 0 ? '−' : ''}${nf.format(Math.abs(v))}원`)
export function ym(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m] = s.split('-')
  return `${y}.${m}`
}
export function ymShort(s: string): string {
  const [y, m] = s.split('-')
  return `${y.slice(2)}.${m}`
}
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}
export function addMonths(s: string, n: number): string {
  const [y, m] = s.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** 기획서(PDF)·AI 실험 E1~E8 이 쓴 기준 가정: 임금 미입력. AI 주장 대조는 이 가정으로 계산한다 */
export const PDF_BASELINE: Partial<CpaInputs> = { traineeSalary: null, cpaSalary: null, jobWage: null }

/** 기본 임금 가정의 근거(조사 자료). 세후 환산은 4대보험·간이세액 근사 */
export const WAGE_SOURCES = {
  traineeSalary: '수습 세후 월 320만 원 — 대형 회계법인 수습 연봉 6천만~7천만 원, 4천만~5천만 원대 인하 검토 보도(아시아경제 2025.03) 중 보수적으로 연 4,500만 원',
  cpaSalary: '수습 이후 세후 월 410만 원 — 같은 보도의 현행 하단 연 6,000만 원',
  jobWage: '취업 세후 월 270만 원 — 경총 대졸 초임 분석(2025.01) 정규직 평균 연 3,675만 원',
} as const
