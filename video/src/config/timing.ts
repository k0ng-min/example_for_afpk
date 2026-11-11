// 장면 길이·전체 길이·자막 계산. Remotion(영상)과 검사 스크립트(node --experimental-strip-types)가 같은 코드를 쓴다.
import { FPS, MAX_SECONDS, MIN_SECONDS, SCENE_ORDER, TRANSITION_FRAMES, IdeaVideoConfigSchema, type IdeaVideoConfig, type SceneId } from './schema.ts'

export type Cue = { from: number; to: number; text: string }

/** 차분한 한국어 내레이션 속도(초당 글자 수, 공백 제외). 이보다 빠르면 대본이 장면에 들어가지 않는다 */
export const MAX_CHARS_PER_SECOND = 6.2
/** 자막 한 줄 최대 길이(1920px, 34px 글씨 기준 두 줄 이하로 유지) */
export const MAX_CAPTION_CHARS = 38

export function sceneFrames(cfg: IdeaVideoConfig, id: SceneId): number {
  return Math.round(cfg.durations[id] * FPS)
}

/** 전환 겹침을 뺀 전체 프레임 수 */
export function totalFrames(cfg: IdeaVideoConfig): number {
  const sum = SCENE_ORDER.reduce((a, id) => a + sceneFrames(cfg, id), 0)
  return sum - TRANSITION_FRAMES * (SCENE_ORDER.length - 1)
}

const visibleLen = (s: string) => s.replace(/\s/g, '').length

/** 문장을 자막 길이에 맞게 쪼갠다: 문장 → 너무 길면 쉼표·띄어쓰기 기준으로 가운데 근처에서 분할 */
export function splitCaptionText(text: string): string[] {
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  const push = (s: string) => {
    if (s.length <= MAX_CAPTION_CHARS) return void out.push(s)
    const mid = s.length / 2
    // 쉼표 뒤 우선, 없으면 공백
    const cands = [...s.matchAll(/, /g)].map((m) => m.index! + 1)
    const spaces = [...s.matchAll(/ /g)].map((m) => m.index!)
    const pool = cands.length ? cands : spaces
    const cut = pool.reduce((b, i) => (Math.abs(i - mid) < Math.abs(b - mid) ? i : b), pool[0] ?? Math.floor(mid))
    push(s.slice(0, cut).trim())
    push(s.slice(cut).trim())
  }
  sentences.forEach(push)
  // 너무 짧은 조각(예: 'FINOVA.')은 앞 자막과 합친다(길이가 허용될 때)
  const merged: string[] = []
  for (const p of out) {
    const prev = merged[merged.length - 1]
    if (prev && visibleLen(p) < 8 && prev.length + p.length + 1 <= MAX_CAPTION_CHARS + 6) merged[merged.length - 1] = `${prev} ${p}`
    else merged.push(p)
  }
  return merged
}

/** 내레이션에서 자막 시간표 자동 생성(글자 수 비례). 앞뒤 여백을 둬 장면 전환과 겹치지 않게 한다 */
export function captionsFor(cfg: IdeaVideoConfig, id: SceneId): Cue[] {
  const manual = cfg.captions?.[id]
  // 직접 지정한 자막(빈 배열 = 이 장면은 자막 없음)이 있으면 그대로 쓴다
  if (manual) return manual
  const sec = cfg.durations[id]
  const lead = 0.6
  const tail = 0.9
  const parts = splitCaptionText(cfg.narration[id])
  const total = parts.reduce((a, p) => a + visibleLen(p), 0) || 1
  const span = Math.max(1, sec - lead - tail)
  let t = lead
  return parts.map((text) => {
    const d = (visibleLen(text) / total) * span
    const cue = { from: +t.toFixed(2), to: +(t + d - 0.12).toFixed(2), text }
    t += d
    return cue
  })
}

export type CheckResult = { ok: boolean; seconds: number; errors: string[]; warnings: string[] }

/** 설정 검증: 스키마 + 전체 길이 90~120초 + 대본 속도 + 자막 길이·시간 */
export function checkConfig(raw: unknown): CheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const parsed = IdeaVideoConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, seconds: 0, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), warnings }
  }
  const cfg = parsed.data
  for (const id of SCENE_ORDER) {
    if (cfg.durations[id] == null) errors.push(`durations.${id} 없음`)
    if (!cfg.narration[id]) errors.push(`narration.${id} 없음`)
  }
  if (errors.length) return { ok: false, seconds: 0, errors, warnings }
  const seconds = totalFrames(cfg) / FPS
  if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) errors.push(`전체 길이 ${seconds.toFixed(1)}초 — ${MIN_SECONDS}~${MAX_SECONDS}초 범위를 벗어남`)
  for (const id of SCENE_ORDER) {
    const rate = visibleLen(cfg.narration[id]) / cfg.durations[id]
    if (rate > MAX_CHARS_PER_SECOND) errors.push(`${id}: 대본이 너무 김(초당 ${rate.toFixed(1)}자 > ${MAX_CHARS_PER_SECOND}). 장면을 늘리거나 대본을 줄이세요`)
    for (const c of captionsFor(cfg, id)) {
      if (c.text.length > MAX_CAPTION_CHARS + 6) errors.push(`${id}: 자막이 너무 김 "${c.text}"`)
      if (c.to > cfg.durations[id]) errors.push(`${id}: 자막이 장면 길이를 넘음 "${c.text}"`)
      if (c.to - c.from < 1.2) warnings.push(`${id}: 자막 노출이 짧음(${(c.to - c.from).toFixed(1)}초) "${c.text}"`)
    }
  }
  return { ok: errors.length === 0, seconds, errors, warnings }
}
