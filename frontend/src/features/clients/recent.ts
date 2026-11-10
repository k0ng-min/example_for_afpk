// 최근 분석 기록(브라우저별 편의 기능). 분석 결과 자체는 저장하지 않고 질문·시각만 남긴다.
type Entry = { question: string; at: number; supported: boolean }
const key = (clientId: string) => `finova.recent.${clientId}`

export const recentAnalyses = {
  list(clientId: string): Entry[] {
    try {
      return JSON.parse(localStorage.getItem(key(clientId)) ?? '[]') as Entry[]
    } catch {
      return []
    }
  },
  add(clientId: string, e: Entry) {
    try {
      const next = [e, ...recentAnalyses.list(clientId)].slice(0, 20)
      localStorage.setItem(key(clientId), JSON.stringify(next))
    } catch {
      /* 저장소 차단 무시 */
    }
  },
}
