// 재무설계 6단계(기획서 13·15) — 각 단계의 고객 정보·AI 역할·사람의 검증·산출물과 실제 화면 연결
import type { Analysis } from './types'
import { man, ym } from './meta'

export type Step = {
  n: number
  title: string
  tag: string
  scope: string
  data: string
  ai: string
  human: string
  record: string
  path: string
  pathLabel: string
  live: (a: Analysis) => string
}

const path = (a: Analysis, s: string) => a.short.find((p) => p.strategy === s)!

export const STEPS: Step[] = [
  {
    n: 1,
    title: '고객과의 관계 정립',
    tag: '범위 합의',
    scope: '합격 가능성 예측과 수험 코칭은 상담 범위에서 제외하고, 재무목표와 서로의 책임을 합의한다.',
    data: '고객의 고민 한 문장: "붙어도 월세는 누가 내지"',
    ai: '고객 면담 질문지 초안',
    human: '질문 확정, 상담 범위 합의',
    record: '프롬프트 · 채택/기각 사유',
    path: '/',
    pathLabel: '홈',
    live: () => '상담 범위: 지급능력·재무목표 (합격 예측·직업 권유 제외)',
  },
  {
    n: 2,
    title: '정보 수집 및 목표 설정',
    tag: 'F1',
    scope: '예금·보증금·학자금대출·지출·가족 지원 종료 시점을 수집하고 우선순위가 있는 네 가지 목표를 확정한다.',
    data: '예금 1,400만 · 보증금 1,000만 · 생활비 월 120만 · 지원 60→30→0',
    ai: '누락 정보 점검(예: ICL 의무상환 기준, 시험 일정 공고)',
    human: '가상 고객 응답 설계, 가정값과 확인 사실 구분',
    record: '가정·확인·미검증 표시',
    path: '/client',
    pathLabel: '고객 정보',
    live: (a) => `가용현금 ${man(a.balanceSheet.liquid)} · 보증금 ${man(a.balanceSheet.deposit)}(가용현금 제외)`,
  },
  {
    n: 3,
    title: '재무상태 분석 및 평가',
    tag: 'F2 · F3 · F4',
    scope: '18개월 현금흐름, 최초 안전자금 위반월, 합격 후 수습 지연에 따른 최저 잔액을 정량 비교한다.',
    data: '전략 A~D의 월별 잔액, 지연 L, 조건 p·q',
    ai: '현금흐름 계산 코드 초안, 시나리오 격자 제안',
    human: '코드 검토 · 단위·이중계상 검증 · Rust 엔진 재실행',
    record: '코드 버전 · 검산 결과',
    path: '/simulator',
    pathLabel: '시뮬레이션',
    live: (a) => {
      const A = path(a, 'A')
      return A.tau ? `전업 유지 시 최초 위반월 τ = ${ym(A.tau)} (${man(A.tauCash)})` : '전업 유지 시 18개월 안 위반 없음'
    },
  },
  {
    n: 4,
    title: '재무설계 제안',
    tag: 'F4 · F5',
    scope: '전략 A·B·C와 전환 규칙 D를 비교하고, 기각한 대안의 이유까지 고객에게 설명한다.',
    data: '시계 1 통과 여부, 60개월 가치(입력 확정 시)',
    ai: '전략별 장단점과 예상 반론 초안',
    human: '진단 결과와 연결, 기각 대안의 사유 판단',
    record: 'AI 초안과 최종안 비교',
    path: '/simulator',
    pathLabel: '전략 비교',
    live: (a) => {
      const ok = a.short.filter((p) => p.tau == null && p.insolvent == null && p.missing.length === 0).map((p) => p.strategy)
      return ok.length ? `18개월 안전자금 유지: 전략 ${ok.join('·')}` : '18개월 안전자금을 유지하는 전략 없음'
    },
  },
  {
    n: 5,
    title: '실행 지원',
    tag: 'F5',
    scope: '근로 병행 시작 시점, 지출 조정 항목, 구직 준비, 긴급 시 자금 운용 우선순위를 월별 계획으로 제시한다.',
    data: '전환 신호 1~4, 월별 실행표',
    ai: '월별 예산표 · 고객 설명문 초안',
    human: '표현 수정, 실행 순서 확정',
    record: '수정 전·후 문안',
    path: '/plan',
    pathLabel: '실행 계획',
    live: (a) => {
      const s1 = a.signals.items.find((s) => s.id === 1)
      return s1?.ruleTrigger ? `신호 1 예상 발동 ${ym(s1.ruleTrigger)} → 근로 병행 시작` : '신호 1 발동 없음'
    },
  },
  {
    n: 6,
    title: '모니터링',
    tag: '전환 규칙',
    scope: '매월 말 잔액과 시험 결과·수습 상태가 바뀔 때마다 신호 1~4에 따라 계획을 다시 세운다.',
    data: '월말 잔액, 발표 결과, 수습 확정 여부',
    ai: '점검 체크리스트 초안',
    human: '전환 임계값 확정과 고객 합의',
    record: '규칙 변경 이력',
    path: '/plan',
    pathLabel: '재점검 계획',
    live: (a) => (a.signals.ruleBreach ? `규칙을 지켜도 ${ym(a.signals.ruleBreach)}에 안전자금 위반 → 그 전에 재상담` : '규칙 실행 시 18개월 안전자금 유지'),
  },
]

/** 화면별로 강조할 단계 */
export const ROUTE_STEPS: Record<string, number[]> = {
  '/': [1],
  '/client': [2],
  '/canvas': [3],
  '/copilot': [3],
  '/simulator': [3, 4],
  '/verification': [4],
  '/plan': [5, 6],
  '/report': [6],
}
