// 주제 구성(JSON)의 허용 목록 id → 실제 UI 자원(아이콘·색·라벨) 매핑. 구성 파일은 코드가 아니라 id만 담는다.
import {
  Activity,
  Bot,
  CheckCircle2,
  Compass,
  Flag,
  HeartHandshake,
  HeartPulse,
  Layers,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Store,
  Target,
  User,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { NodeKind, SignatureVisual } from '@/types/api'

export const TOPIC_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  heart_handshake: HeartHandshake,
  store: Store,
  heart_pulse: HeartPulse,
  compass: Compass,
  scale: Scale,
  shield: Shield,
  target: Target,
  users: Users,
  wallet: Wallet,
}

export const NODE_META: Record<NodeKind, { label: string; icon: LucideIcon; color: string }> = {
  client: { label: '고객', icon: User, color: 'var(--cyan)' },
  goal: { label: '목표', icon: Target, color: 'var(--ok)' },
  risk: { label: '위험', icon: ShieldAlert, color: 'var(--danger)' },
  analysis: { label: '분석', icon: Activity, color: 'var(--blue)' },
  scenario: { label: '시나리오', icon: Layers, color: 'var(--warn)' },
  ai_proposal: { label: 'AI 제안', icon: Bot, color: 'var(--violet)' },
  evidence: { label: '검증 근거', icon: CheckCircle2, color: 'var(--cyan)' },
  action: { label: '실행 행동', icon: Zap, color: 'var(--accent)' },
}

/** 노드 내용의 출처(색이 아니라 아이콘·글자로도 구분). 'draft' = 주제 구성에 미리 작성된 AI 초안(실시간 LLM 아님) */
export const NODE_ORIGIN: Record<NodeKind, { source: 'input' | 'engine' | 'rule' | 'draft' | 'human'; short: string }> = {
  client: { source: 'input', short: '사용자 입력' },
  goal: { source: 'input', short: '사용자 입력' },
  risk: { source: 'rule', short: '규칙 판정' },
  analysis: { source: 'engine', short: 'Rust 계산' },
  scenario: { source: 'engine', short: 'Rust 계산' },
  ai_proposal: { source: 'draft', short: 'AI 초안' },
  evidence: { source: 'engine', short: '독립 계산' },
  action: { source: 'human', short: '사람 실행' },
}

export const VISUAL_LABEL: Record<SignatureVisual, string> = {
  commitment_graph: '가족 약속 흐름도',
  contagion_map: '위험 전파 지도',
  care_timeline: '위기 타임라인',
  goal_discovery: '목표 우선순위 비교표',
  verification_court: 'AI 검증 심리 흐름',
  scenario_overview: '시나리오 순자산 비교',
}

export const STAGES = [
  { n: 1, name: '관계 정립', path: '/' },
  { n: 2, name: '목표 설정·자료 수집', path: '/client' },
  { n: 3, name: '재무상태 분석', path: '/canvas' },
  { n: 4, name: '설계안 제시', path: '/scenarios' },
  { n: 5, name: '실행', path: '/actions' },
  { n: 6, name: '점검', path: '/report' },
] as const

export const PAGE_STAGE: Record<string, number> = {
  '/': 1,
  '/client': 2,
  '/canvas': 3,
  '/copilot': 3,
  '/scenarios': 4,
  '/verification': 4,
  '/actions': 5,
  '/report': 6,
}

export { Flag }
