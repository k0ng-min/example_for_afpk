// 심사위원 데모 동선: 고객 정보 → AI 분석 → 시뮬레이션 → 검증 → 실행 계획 → 보고서
// 각 단계의 상태는 실제 API 데이터(목표·위험·저장 시나리오·검증 판정·실행 항목)로 계산한다. 임의로 "완료"를 표시하지 않는다.
import { create } from 'zustand'
import type { ActionItem, AnalysisResponse, VerificationResponse } from '@/types/api'

export type JourneyKey = 'client' | 'analysis' | 'simulation' | 'verification' | 'actions' | 'report'
export type JourneyStep = { key: JourneyKey; label: string; path: string; stage: string; look: string; seconds: number }

export const JOURNEY: JourneyStep[] = [
  { key: 'client', label: '고객 정보', path: '/client', stage: '2단계 · 자료 수집', seconds: 30, look: '합성 고객의 소득·지출·부채·목표와 계산 가정을 확인합니다. 값을 바꾸면 저장 전에도 계산 결과 변화가 바로 보입니다.' },
  { key: 'analysis', label: 'AI 분석', path: '/canvas', stage: '3단계 · 재무상태 분석', seconds: 30, look: '노드를 눌러 사용자 입력 → Rust 계산 → AI 초안 → 검증 근거가 어떻게 이어지는지 확인합니다.' },
  { key: 'simulation', label: '시뮬레이션', path: '/scenarios', stage: '4단계 · 설계안 제시', seconds: 40, look: '시나리오를 고르면 기준안 대비 순자산·최저 현금·목표 달성 시점 변화가 맨 위에 요약됩니다. 슬라이더를 움직여 다시 계산해 보세요.' },
  { key: 'verification', label: 'AI 검증', path: '/verification', stage: '4단계 · 설계안 검증', seconds: 40, look: 'AI 초안 주장을 Rust 독립 계산값과 대조한 판정을 보고, 사람의 최종 판단(사유·수정 요구)을 기록합니다.' },
  { key: 'actions', label: '실행 계획', path: '/actions', stage: '5단계 · 실행', seconds: 20, look: '검증된 권고를 실행 항목·기한·예상 금액·재점검 조건으로 관리합니다.' },
  { key: 'report', label: '보고서', path: '/report', stage: '6단계 · 점검', seconds: 20, look: '고객 요약부터 검증 결과·실행·점검 계획까지 한 문서로 묶고 인쇄(PDF)합니다.' },
]

export type StepState = 'done' | 'attention' | 'todo'
export type StepStatus = { key: JourneyKey; state: StepState; note: string }

export function journeyStatus(input: {
  goals: number
  analysis: AnalysisResponse | null
  savedScenarios: number | null
  verification: VerificationResponse | null
  actions: ActionItem[] | null
}): StepStatus[] {
  const { analysis, verification, actions } = input
  const critical = analysis?.insights.filter((i) => i.severity === 'critical').length ?? 0
  const results = verification?.results ?? []
  const reviewed = results.filter((r) => r.review && r.review.decision !== 'pending').length
  const openErrors = results.filter((r) => r.displayStatus === 'error_found' && !(r.review && r.review.decision !== 'pending')).length
  const unresolved = results.filter((r) => (r.displayStatus === 'needs_review' || r.displayStatus === 'insufficient_evidence') && !(r.review && r.review.decision !== 'pending')).length
  const acted = actions?.filter((a) => a.status !== 'todo').length ?? 0
  const s = (key: JourneyKey, state: StepState, note: string): StepStatus => ({ key, state, note })
  return [
    input.goals > 0 ? s('client', 'done', `목표 ${input.goals}개 입력됨`) : s('client', 'todo', '재무목표가 없습니다'),
    !analysis ? s('analysis', 'todo', '분석 결과 불러오는 중') : critical > 0 ? s('analysis', 'attention', `심각 위험 ${critical}건 확인 필요`) : s('analysis', 'done', `위험 ${analysis.insights.length}건 탐지`),
    input.savedScenarios == null ? s('simulation', 'todo', '시나리오 불러오는 중') : input.savedScenarios >= 2 ? s('simulation', 'done', `저장 시나리오 ${input.savedScenarios}개 비교`) : s('simulation', 'todo', '대안 시나리오를 만들어 비교하세요'),
    !verification ? s('verification', 'todo', '검증 결과 불러오는 중') : openErrors > 0 ? s('verification', 'attention', `오류 발견 ${openErrors}건 · 사람 판단 필요`) : unresolved > 0 ? s('verification', 'attention', `미검토 ${unresolved}건 · 사람 판단 ${reviewed}/${results.length}`) : s('verification', 'done', `사람 판단 ${reviewed}/${results.length}건`),
    !actions ? s('actions', 'todo', '실행 계획 불러오는 중') : acted > 0 ? s('actions', 'done', `진행·완료 ${acted}/${actions.length}건`) : s('actions', 'todo', `실행 항목 ${actions.length}건 모두 시작 전`),
    openErrors > 0 ? s('report', 'attention', '오류 주장이 검토 전 · 보고서에 미해결로 표시됨') : s('report', 'todo', '미리보기·인쇄 가능'),
  ]
}

/** 다음 권장 단계: 확인이 필요한 단계 → 시작 전 단계 순 */
export function nextStep(st: StepStatus[]): { step: JourneyStep; status: StepStatus } {
  const pick = st.find((x) => x.state === 'attention') ?? st.find((x) => x.state === 'todo') ?? st[st.length - 1]
  return { step: JOURNEY.find((j) => j.key === pick.key)!, status: pick }
}

// ── 3분 데모 안내(세션 동안만 유지) ──
const KEY = 'finova.demo'
function load(): number | null {
  try {
    const v = sessionStorage.getItem(KEY)
    return v == null ? null : Number(v)
  } catch {
    return null
  }
}
function persist(v: number | null) {
  try {
    if (v == null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, String(v))
  } catch {
    /* 무시 */
  }
}

type DemoState = { step: number | null; start: () => void; go: (i: number) => void; stop: () => void }
export const useDemo = create<DemoState>((set) => ({
  step: load(),
  start: () => (persist(0), set({ step: 0 })),
  go: (i) => {
    const v = Math.max(0, Math.min(JOURNEY.length - 1, i))
    persist(v)
    set({ step: v })
  },
  stop: () => (persist(null), set({ step: null })),
}))
