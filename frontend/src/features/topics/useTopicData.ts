import { api } from '@/services/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useApp } from '@/stores/app'
import type { Client, Scenario, TopicConfig } from '@/types/api'

/** 주제 프리셋을 비교용 시나리오 객체로 변환(저장하지 않음) */
export function presetScenarios(topic: TopicConfig, clientId: string): Scenario[] {
  return topic.scenarioPresets.map((p, i) => ({
    ...p.adjustments,
    id: p.id,
    clientId,
    name: p.name,
    description: p.description,
    isBaseline: i === 0,
    color: p.color || '#3060a8',
  }))
}

/** 활성 주제의 프리셋 시나리오를 현재 고객으로 비교 계산 */
export function useTopicComparison(client: Client | null) {
  const topic = useApp((s) => s.topic)
  const revision = useApp((s) => s.revision)
  return useAsync(
    (signal) => api.compare({ clientId: client!.id, scenarios: presetScenarios(topic!.config, client!.id) }, signal),
    [client?.id, topic?.version.id, revision],
    { enabled: !!client && !!topic },
  )
}

export function useAnalysis(client: Client | null) {
  const revision = useApp((s) => s.revision)
  const topicId = useApp((s) => s.topic?.version.id)
  return useAsync((signal) => api.analysis({ clientId: client!.id }, signal), [client?.id, revision, topicId], { enabled: !!client })
}

/** 고객이 저장한 시나리오(최대 8개)를 비교 계산. 시나리오가 없으면 주제 프리셋으로 대체 */
export function useClientComparison(client: Client | null) {
  const topic = useApp((s) => s.topic)
  const revision = useApp((s) => s.revision)
  return useAsync(
    async (signal) => {
      const saved = await api.scenarios(client!.id)
      const scenarios = saved.length ? saved.slice(0, 8) : presetScenarios(topic!.config, client!.id)
      return api.compare({ clientId: client!.id, scenarios }, signal)
    },
    [client?.id, topic?.version.id, revision],
    { enabled: !!client && !!topic },
  )
}
