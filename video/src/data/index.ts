// 엔진 스냅샷 등록부와 표시용 서식. 재무 수치는 모두 Rust 엔진 스냅샷에서 온다(영상용 임의 수치 없음).
import cpa from './snapshot-cpa.json'
import narrationCpa from './narration-cpa_gap.json'

export type Snapshot = typeof cpa

/** 새 스냅샷을 추가하면 여기에 한 줄 등록한다(Remotion 은 번들 시점에 파일을 포함해야 하므로) */
export const SNAPSHOTS: Record<string, Snapshot> = {
  'snapshot-cpa.json': cpa,
}

const nf = new Intl.NumberFormat('ko-KR')

/** 만 원 단위 표시(음수는 −) */
export function man(v: number | null | undefined): string {
  if (v == null) return '—'
  const s = nf.format(Math.round(Math.abs(v) / 10_000))
  return `${v < 0 ? '−' : ''}${s}만 원`
}

/** "2027-10" → "2027.10" */
export const ym = (s: string | null | undefined) => (s ? s.replace('-', '.') : '—')

/** 'client.cash0' 같은 경로로 스냅샷 값을 꺼낸다 */
export function resolvePath(snap: Snapshot, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), snap)
}

/** 카드·규칙에 쓸 값 문자열: 숫자는 만 원, "YYYY-MM" 문자열은 YYYY.MM */
export function cardValue(snap: Snapshot, card: { from?: string; text?: string }): string {
  if (card.text) return card.text
  const v = card.from ? resolvePath(snap, card.from) : undefined
  if (typeof v === 'number') return man(v)
  if (typeof v === 'string') return /^\d{4}-\d{2}$/.test(v) ? ym(v) : v
  return '—'
}

/** 내레이션 음성(scripts/make-narration.mjs 로 생성): 장면별 음성 파일·시작 시각·실제 말소리에 맞춘 자막 */
export type NarrationScene = { file: string; from: number; dur: number; cues: { from: number; to: number; text: string }[] }
export type Narration = { voice: string; model: string; scenes: Partial<Record<string, NarrationScene>> }
export const NARRATIONS: Record<string, Narration> = {
  cpa_gap: narrationCpa as Narration,
}
