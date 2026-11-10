import { z } from 'zod'
import { request } from './client'
import {
  ActionItemSchema,
  ActionsResponseSchema,
  ActiveTopicSchema,
  AgentsResponseSchema,
  AnalysisResponseSchema,
  CalcResponseSchema,
  ClientSchema,
  ComparisonSchema,
  GenerateResponseSchema,
  GoalSchema,
  HealthSchema,
  IdeaAnalysisSchema,
  PreviewSchema,
  ReviewRecordSchema,
  ScenarioSchema,
  ValidationReportSchema,
  VerificationResponseSchema,
  VersionsResponseSchema,
  type ActionItem,
  type Adjustments,
  type ClaimInput,
  type Client,
  type IdeaInput,
  type Scenario,
} from '@/types/api'

const Ok = z.object({ ok: z.boolean() }).passthrough()

export const api = {
  health: () => request('/health', HealthSchema),
  clients: () => request('/clients', z.array(ClientSchema)),
  client: (id: string) => request(`/clients/${encodeURIComponent(id)}`, ClientSchema),
  saveClient: (c: Client) => request(`/clients/${encodeURIComponent(c.id)}`, ClientSchema, { method: 'PUT', body: c }),
  resetData: () => request('/clients/reset', Ok, { method: 'POST' }),
  goalTemplates: () => request('/goals/templates', z.array(GoalSchema)),

  scenarios: (clientId: string) => request(`/clients/${encodeURIComponent(clientId)}/scenarios`, z.array(ScenarioSchema)),
  createScenario: (b: { clientId: string; name: string; description?: string; color?: string; adjustments: Partial<Adjustments> }) =>
    request('/scenarios', ScenarioSchema, { method: 'POST', body: b }),
  updateScenario: (s: Scenario) => request(`/scenarios/${encodeURIComponent(s.id)}`, ScenarioSchema, { method: 'PUT', body: s }),
  deleteScenario: (id: string) => request(`/scenarios/${encodeURIComponent(id)}`, Ok, { method: 'DELETE' }),
  duplicateScenario: (id: string) => request(`/scenarios/${encodeURIComponent(id)}/duplicate`, ScenarioSchema, { method: 'POST' }),

  calculate: (b: { clientId?: string; client?: Client; adjustments: Partial<Adjustments> }, signal?: AbortSignal) =>
    request('/scenarios/calculate', CalcResponseSchema, { method: 'POST', body: b, signal }),
  compare: (b: { clientId?: string; client?: Client; scenarios: Scenario[] }, signal?: AbortSignal) =>
    request('/scenarios/compare', ComparisonSchema, { method: 'POST', body: b, signal }),
  analysis: (b: { clientId?: string; client?: Client; adjustments?: Partial<Adjustments>; question?: string }, signal?: AbortSignal) =>
    request('/analysis', AnalysisResponseSchema, { method: 'POST', body: b, signal }),

  verification: (b: { clientId: string; claims?: ClaimInput[] }) => request('/verification', VerificationResponseSchema, { method: 'POST', body: b }),
  saveReview: (clientId: string, claimId: string, b: { statement: string; decision: string; correctedValue?: number | null; correctedStatement?: string; note?: string; reviewer?: string }) =>
    request(`/clients/${encodeURIComponent(clientId)}/reviews/${encodeURIComponent(claimId)}`, ReviewRecordSchema, { method: 'PUT', body: b }),

  actions: (clientId: string) => request(`/clients/${encodeURIComponent(clientId)}/actions`, ActionsResponseSchema),
  saveActions: (clientId: string, items: ActionItem[]) =>
    request(`/clients/${encodeURIComponent(clientId)}/actions`, z.array(ActionItemSchema), { method: 'PUT', body: items }),

  activeTopic: () => request('/topics/active', ActiveTopicSchema),
  agents: () => request('/ai/agents', AgentsResponseSchema),

  // ── 관리자 전용(Idea Configuration Studio) ──
  adminSession: () => request('/admin/session', Ok, { admin: true }),
  versions: () => request('/topics/versions', VersionsResponseSchema, { admin: true }),
  backup: () => request('/admin/backup', z.record(z.string(), z.unknown()), { admin: true }),
  analyzeIdea: (i: IdeaInput) => request('/ideas/analyze', IdeaAnalysisSchema, { method: 'POST', body: i, admin: true }),
  generateIdea: (b: { input?: IdeaInput; presetId?: string }) => request('/ideas/generate', GenerateResponseSchema, { method: 'POST', body: b, admin: true }),
  importTopic: (b: { config: unknown; client?: unknown }) =>
    request('/ideas/import', z.object({ versionId: z.string(), validation: ValidationReportSchema }), { method: 'POST', body: b, admin: true }),
  preview: (id: string) => request(`/ideas/${encodeURIComponent(id)}/preview`, PreviewSchema, { admin: true }),
  validate: (id: string) => request(`/ideas/${encodeURIComponent(id)}/validate`, z.object({ versionId: z.string(), status: z.string(), validation: ValidationReportSchema }), { method: 'POST', admin: true }),
  activate: (id: string) => request(`/ideas/${encodeURIComponent(id)}/activate`, Ok, { method: 'POST', admin: true }),
  rollback: () => request('/ideas/rollback', Ok, { method: 'POST', admin: true }),
}
