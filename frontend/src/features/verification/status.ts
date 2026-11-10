import type { Tone } from '@/components/ui'
import type { VerificationStatus } from '@/types/api'

/** 판정 상태의 의미(통과 기준)와 다음 행동. "근거 부족"·"검토 필요"는 절대 성공으로 취급하지 않는다. */
export const STATUS_META: Record<VerificationStatus, { label: string; tone: Tone; help: string; criterion: string; next: string; passed: boolean }> = {
  verified: { label: '검증 완료', tone: 'ok', help: '독립 계산값과 허용 오차 안에서 일치', criterion: '주장 값이 Rust 독립 계산값 ± 허용 오차 안에 있음', next: '사람이 승인하면 보고서 권고에 사용', passed: true },
  needs_review: { label: '검토 필요', tone: 'warn', help: '지표는 있으나 주장에 비교할 수치가 없음', criterion: '근거 지표는 연결됐지만 주장에 비교할 수치가 없어 자동 판정 불가', next: '계산값을 보고 승인·기각하거나 수정값을 기록', passed: false },
  insufficient_evidence: { label: '근거 부족', tone: 'neutral', help: '연결된 계산 지표가 없어 자동 검증 불가', criterion: '연결된 계산 지표가 없어 자동 검증 불가 · 성공으로 보지 않음', next: '출처·계산 근거를 확인해 판단 사유를 남기거나 기각', passed: false },
  error_found: { label: '오류 발견', tone: 'danger', help: '독립 계산값과 불일치', criterion: '주장 값과 독립 계산값의 차이가 허용 오차를 넘음', next: '수정값을 기록해 재검증하거나 주장을 기각', passed: false },
  corrected: { label: '수정 완료', tone: 'violet', help: '사람이 기록한 수정값이 재검증을 통과', criterion: '사람이 기록한 수정값이 재검증을 통과(지표 없는 주장은 판단 사유 기록으로 처리)', next: '수정된 내용으로 보고서에 반영', passed: true },
}

export const DECISION_LABEL = { pending: '검토 대기', approved: '승인', rejected: '기각', corrected: '수정' } as const
