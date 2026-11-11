// 현재 영상에 쓰는 주제 설정. 다른 아이디어로 바꾸려면 src/ideas/<id>.json 을 만들고
// 아래 IDEAS 에 등록한 뒤 ACTIVE_IDEA 를 바꾸고 `npm run check && npm run render` 하면 된다.
// (렌더 때 --props='{"ideaId":"<id>"}' 로 덮어쓸 수도 있다)
import cpaGap from '../ideas/cpa_gap.json'
import { IdeaVideoConfigSchema, type IdeaVideoConfig } from './schema.ts'

export const ACTIVE_IDEA = 'cpa_gap'

/** 새 주제 JSON 을 추가하면 여기에 한 줄 등록한다 */
const IDEAS: Record<string, unknown> = {
  cpa_gap: cpaGap,
}

export const IDEA_IDS = Object.keys(IDEAS)

export function loadIdea(id: string = ACTIVE_IDEA): IdeaVideoConfig {
  const raw = IDEAS[id]
  if (!raw) throw new Error(`알 수 없는 주제 설정: ${id} (등록: ${IDEA_IDS.join(', ')})`)
  // 신뢰하지 않는 입력으로 보고 스키마 검증 후 사용
  return IdeaVideoConfigSchema.parse(raw)
}
