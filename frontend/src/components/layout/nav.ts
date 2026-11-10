import type { LucideIcon } from 'lucide-react'
import { ClipboardCheck, FileText, Home, LineChart, ListChecks, MessageCircle, Network, Settings2, UserRound } from 'lucide-react'

export type NavItem = { to: string; ko: string; desc: string; icon: LucideIcon; stage?: string }

/** 상단 메뉴(재무설계 여정 순서) */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', ko: '홈', desc: '고객 재무 현황 한눈에 보기', icon: Home, stage: '1단계 · 관계 정립' },
  { to: '/client', ko: '고객 정보', desc: '소득·지출·자산·목표 입력', icon: UserRound, stage: '2단계 · 목표 설정과 자료 수집' },
  { to: '/canvas', ko: 'AI 분석 캔버스', desc: '판단 근거를 연결해 보기', icon: Network, stage: '3단계 · 재무상태 분석' },
  { to: '/copilot', ko: 'AI 재무 상담', desc: '계산 근거로 답하는 질의응답', icon: MessageCircle, stage: '3단계 · 재무상태 분석' },
  { to: '/scenarios', ko: '미래 시뮬레이션', desc: '조건을 바꿔 미래 비교', icon: LineChart, stage: '4단계 · 설계안 제시' },
  { to: '/verification', ko: 'AI 검증', desc: 'AI 주장을 계산으로 확인', icon: ClipboardCheck, stage: '4단계 · 설계안 검증' },
  { to: '/actions', ko: '실행 계획', desc: '할 일과 진행 상태 관리', icon: ListChecks, stage: '5단계 · 실행' },
  { to: '/report', ko: '보고서', desc: '재무설계 보고서 출력', icon: FileText, stage: '6단계 · 점검' },
]

export const STUDIO_ITEM: NavItem = { to: '/studio', ko: '아이디어 설정', desc: '공모전 주제 구성(관리자)', icon: Settings2 }
