// 영상 콘텐츠 설정 스키마. 주제(아이디어)마다 이 형태의 JSON 하나만 바꾸면
// 장면의 문구·고객 사례·그래프 데이터·자막·내레이션이 함께 바뀐다. 디자인·전환·애니메이션은 코드에 고정.
import { z } from 'zod'

const SceneId = z.enum(['problem', 'intro', 'client', 'ai', 'simulate', 'verify', 'plan', 'ending'])
export type SceneId = z.infer<typeof SceneId>
export const SCENE_ORDER: SceneId[] = ['problem', 'intro', 'client', 'ai', 'simulate', 'verify', 'plan', 'ending']

/** 장면 8개 키를 모두 요구하는 객체(빠진 장면이 있으면 검증 실패) */
const perScene = <T extends z.ZodTypeAny>(v: T) => z.object({ problem: v, intro: v, client: v, ai: v, simulate: v, verify: v, plan: v, ending: v }).strict()

const Caption = z.object({
  /** 장면 시작 기준 초 */
  from: z.number().min(0),
  to: z.number().positive(),
  text: z.string().min(1).max(60),
})

const Card = z.object({
  label: z.string().min(1).max(16),
  /** 'client.cash0' 처럼 스냅샷 경로(엔진 값, 원 단위) 또는 text */
  from: z.string().optional(),
  text: z.string().max(20).optional(),
  /** 공고 전·가정 등 표시 */
  tag: z.string().max(10).optional(),
})

export const IdeaVideoConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  brand: z.string().min(1).max(20),
  /** 서비스(아이디어) 이름 */
  ideaTitle: z.string().min(1).max(30),
  /** 첫 장면의 한 줄 문제 제기 */
  hook: z.string().min(1).max(30),
  problemStatement: z.string().min(1).max(60),
  targetCustomer: z.string().min(1).max(40),
  financialChallenge: z.string().min(1).max(60),
  /** 엔진 스냅샷 파일 이름(src/data 안). 재무 수치는 모두 여기서 온다 */
  snapshot: z.string().regex(/^[a-z0-9_-]+\.json$/),
  problemCards: z.array(Card).min(6).max(10),
  /** 소개 장면의 핵심 구조(예: 두 번의 소득 공백) */
  gaps: z.array(z.object({ label: z.string().max(16), sub: z.string().max(30) })).length(2),
  navItems: z.array(z.string().max(8)).min(5).max(9),
  aiAnalysis: z.object({
    /** AI 분석 캔버스의 노드(순서대로 연결). kind: input | engine | ai | check | action */
    nodes: z.array(z.object({ title: z.string().max(14), kind: z.enum(['input', 'engine', 'ai', 'check', 'action']) })).min(5).max(8),
  }),
  /** 전략(스냅샷 short 순서)별 한 줄 설명 */
  scenarioExamples: z.array(z.object({ hint: z.string().max(26) })).length(4),
  verificationProcess: z.object({
    steps: z.array(z.string().min(1).max(20)).min(3).max(5),
    reviewNote: z.string().min(1).max(40),
  }),
  planRules: z.array(z.object({ when: z.string().max(20), action: z.string().max(20), from: z.string().optional() })).min(2).max(4),
  reportSections: z.array(z.string().max(10)).min(5).max(10),
  expectedBenefits: z.array(z.string().min(1).max(24)).min(2).max(4),
  endingMessage: z.string().min(1).max(40),
  endingSub: z.string().min(1).max(60),
  /** 장면별 길이(초). 전환 겹침을 뺀 전체 길이는 90~120초여야 한다 */
  durations: perScene(z.number().min(4).max(40)),
  /** 장면별 내레이션 대본(한국어). 자막은 기본적으로 이 대본을 문장 단위로 나눠 자동 생성 */
  narration: perScene(z.string().min(1).max(260)),
  captions: perScene(z.array(Caption)).partial().optional(),
  /** 내레이션 음성 파일(public/ 기준). 대본을 바꾸면 다시 녹음·생성해야 한다 */
  narrationAudio: perScene(z.string()).partial().optional(),
})

export type IdeaVideoConfig = z.infer<typeof IdeaVideoConfigSchema>

export const FPS = 30
/** 장면 사이 전환(겹침) 길이 */
export const TRANSITION_FRAMES = 15
export const MIN_SECONDS = 90
export const MAX_SECONDS = 120
