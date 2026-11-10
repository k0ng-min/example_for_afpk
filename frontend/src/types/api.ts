// Rust 백엔드 타입과 1:1로 대응하는 Zod 스키마. API 응답은 런타임에 검증해 타입 불일치를 즉시 드러낸다.
// 변경 시 backend/src/domain, backend/src/finance 의 serde 구조체와 docs/API_SPEC.md 를 함께 수정할 것.
import { z } from 'zod'

// 이전 디자인에서 저장된 시나리오 색을 현재 검증 팔레트로 바꿔 표시(저장값은 그대로 둔다)
const LEGACY_COLORS: Record<string, string> = {
  '#22d3ee': '#3060a8', '#0a9cb8': '#3060a8', '#a78bfa': '#7e60c6', '#8b6cf0': '#7e60c6', '#34d399': '#20907a', '#16a37a': '#20907a',
  '#fbbf24': '#b57d22', '#c27c0e': '#b57d22', '#f472b6': '#c4547d', '#e0559a': '#c4547d', '#fb923c': '#2f93c9', '#e0601f': '#2f93c9',
}
const SeriesColor = z.string().transform((c) => LEGACY_COLORS[c.toLowerCase()] ?? c)

export const LiabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['household', 'business']).default('household'),
  balance: z.number().int(),
  annualRateBps: z.number().int(),
  monthlyPayment: z.number().int(),
})
export type Liability = z.infer<typeof LiabilitySchema>

export const GoalSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetAmount: z.number().int(),
  targetMonth: z.number().int(),
  priority: z.number().int(),
  category: z.string().default(''),
})
export type Goal = z.infer<typeof GoalSchema>

export const BusinessSchema = z.object({
  monthlyRevenue: z.number().int(),
  monthlyCost: z.number().int(),
  operatingCash: z.number().int(),
  ownerDraw: z.number().int(),
})
export type BusinessProfile = z.infer<typeof BusinessSchema>

export const AnnualItemSchema = z.object({ name: z.string(), calendarMonth: z.number().int(), amount: z.number().int() })
export type AnnualItem = z.infer<typeof AnnualItemSchema>

/** 현실 패턴(계절 지출·연간 정기 유입/유출·연 인상률) — 계산은 Rust 엔진(finance/pattern.rs) */
export const CashflowPatternSchema = z.object({
  startCalendarMonth: z.number().int().default(1),
  variableExpenseSeasonBps: z.array(z.number().int()).default([]),
  businessRevenueSeasonBps: z.array(z.number().int()).default([]),
  annualInflows: z.array(AnnualItemSchema).default([]),
  annualOutflows: z.array(AnnualItemSchema).default([]),
  annualIncomeGrowthBps: z.number().int().default(0),
  annualExpenseGrowthBps: z.number().int().default(0),
})
export type CashflowPattern = z.infer<typeof CashflowPatternSchema>

export const ClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int(),
  occupation: z.string(),
  familySituation: z.string(),
  topicId: z.string(),
  synthetic: z.boolean(),
  monthlyIncome: z.number().int(),
  fixedExpenses: z.number().int(),
  variableExpenses: z.number().int(),
  familySupport: z.number().int(),
  cashAssets: z.number().int(),
  investmentAssets: z.number().int(),
  otherAssets: z.number().int(),
  liabilities: z.array(LiabilitySchema),
  goals: z.array(GoalSchema),
  business: BusinessSchema.nullable().optional(),
  pattern: CashflowPatternSchema.nullable().optional(),
  emergencyFundTargetMonths: z.number().int(),
  extensions: z.record(z.string(), z.number()),
  assumptions: z.array(z.string()),
  notes: z.string(),
})
export type Client = z.infer<typeof ClientSchema>

export const EventKindSchema = z.enum(['income_change', 'expense_change', 'one_time_inflow', 'one_time_outflow'])
export type EventKind = z.infer<typeof EventKindSchema>

export const FutureEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: EventKindSchema,
  startMonth: z.number().int(),
  endMonth: z.number().int().nullable().optional(),
  amount: z.number().int(),
})
export type FutureEvent = z.infer<typeof FutureEventSchema>

export const AdjustmentsSchema = z.object({
  horizonMonths: z.number().int(),
  incomeChange: z.number().int(),
  fixedExpenseChange: z.number().int(),
  variableExpenseChange: z.number().int(),
  familySupportOverride: z.number().int().nullable().optional(),
  extraDebtPayment: z.number().int(),
  monthlyInvestment: z.number().int(),
  investmentReturnBps: z.number().int(),
  cashReturnBps: z.number().int(),
  businessRevenueChangeBps: z.number().int(),
  householdBackstop: z.boolean(),
  events: z.array(FutureEventSchema),
  goals: z.array(GoalSchema).nullable().optional(),
})
export type Adjustments = z.infer<typeof AdjustmentsSchema>

export const ScenarioSchema = AdjustmentsSchema.extend({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  description: z.string(),
  isBaseline: z.boolean(),
  color: SeriesColor,
})
export type Scenario = z.infer<typeof ScenarioSchema>

export const MonthRowSchema = z.object({
  month: z.number(),
  income: z.number(),
  livingExpenses: z.number(),
  familySupport: z.number(),
  debtPayment: z.number(),
  interestPaid: z.number(),
  principalPaid: z.number(),
  oneTimeNet: z.number(),
  householdTransfer: z.number(),
  netCashflow: z.number(),
  cash: z.number(),
  investments: z.number(),
  otherAssets: z.number(),
  businessCash: z.number(),
  householdDebt: z.number(),
  businessDebt: z.number(),
  totalAssets: z.number(),
  totalLiabilities: z.number(),
  netWorth: z.number(),
})
export type MonthRow = z.infer<typeof MonthRowSchema>

export const GoalResultSchema = z.object({
  goalId: z.string(),
  name: z.string(),
  priority: z.number(),
  targetAmount: z.number(),
  targetMonth: z.number(),
  cumulativeTarget: z.number(),
  achievedMonth: z.number().nullable(),
  onTrack: z.boolean(),
  gapAtTarget: z.number(),
  requiredMonthlySaving: z.number(),
})
export type GoalResult = z.infer<typeof GoalResultSchema>

export const WarningSchema = z.object({
  code: z.string(),
  severity: z.string(),
  month: z.number().nullable(),
  message: z.string(),
})
export type EngineWarning = z.infer<typeof WarningSchema>

export const SummarySchema = z.object({
  horizonMonths: z.number(),
  firstMonthNetCashflow: z.number(),
  averageNetCashflow: z.number(),
  negativeCashflowMonths: z.number(),
  firstNegativeCashMonth: z.number().nullable(),
  minCash: z.number(),
  minCashMonth: z.number(),
  finalCash: z.number(),
  finalNetWorth: z.number(),
  netWorthChange: z.number(),
  totalInterestPaid: z.number(),
  householdDebtFreeMonth: z.number().nullable(),
  emergencyReserve: z.number(),
  savingsRateBps: z.number().nullable(),
  debtServiceRatioBps: z.number().nullable(),
  emergencyFundMonthsX10: z.number().nullable(),
  totalHouseholdTransfer: z.number(),
  businessCashDepletedMonth: z.number().nullable(),
  goals: z.array(GoalResultSchema),
})
export type ProjectionSummary = z.infer<typeof SummarySchema>

export const ProjectionSchema = z.object({
  rows: z.array(MonthRowSchema),
  summary: SummarySchema,
  warnings: z.array(WarningSchema),
  assumptions: z.array(z.string()),
})
export type Projection = z.infer<typeof ProjectionSchema>

export const UnitSchema = z.enum(['won', 'bps', 'months_x10', 'months', 'count'])
export type Unit = z.infer<typeof UnitSchema>

export const MetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  unit: UnitSchema,
  formula: z.string(),
  inputs: z.array(z.object({ label: z.string(), value: z.number() })),
})
export type Metric = z.infer<typeof MetricSchema>

export const CalcResponseSchema = z.object({ projection: ProjectionSchema, metrics: z.array(MetricSchema) })
export type CalcResponse = z.infer<typeof CalcResponseSchema>

export const ComparisonSchema = z.object({
  baselineId: z.string(),
  scenarios: z.array(z.object({ scenarioId: z.string(), name: z.string(), color: SeriesColor, projection: ProjectionSchema })),
  deltas: z.array(
    z.object({
      scenarioId: z.string(),
      metric: z.string(),
      label: z.string(),
      value: z.number().nullable(),
      baseline: z.number().nullable(),
      delta: z.number().nullable(),
    }),
  ),
})
export type Comparison = z.infer<typeof ComparisonSchema>

export const SeveritySchema = z.enum(['info', 'warning', 'critical'])
export const InsightSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  severity: SeveritySchema,
  metric: z.string(),
  value: z.number().nullable(),
  source: z.string(),
  formula: z.string(),
})
export type Insight = z.infer<typeof InsightSchema>

export const AnalysisResponseSchema = z.object({
  aiMode: z.string(),
  aiNote: z.string(),
  topicId: z.string(),
  metrics: z.array(MetricSchema),
  insights: z.array(InsightSchema),
  projection: ProjectionSchema,
  answer: z
    .object({
      supported: z.boolean(),
      intent: z.string(),
      text: z.string(),
      citedMetrics: z.array(z.string()),
      source: z.string(),
      model: z.string().nullable().optional(),
      ruleText: z.string().nullable().optional(),
      numbersChecked: z.number().int().default(0),
      unverifiedNumbers: z.array(z.string()).default([]),
      llmError: z.string().nullable().optional(),
    })
    .nullable(),
  agents: z.array(z.object({ agent: z.string(), focus: z.string(), runtime: z.string() })),
})
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>

// ── 주제 구성 ──
export const SignatureVisualSchema = z.enum(['commitment_graph', 'contagion_map', 'care_timeline', 'goal_discovery', 'verification_court', 'scenario_overview'])
export type SignatureVisual = z.infer<typeof SignatureVisualSchema>
export const NodeKindSchema = z.enum(['client', 'goal', 'risk', 'analysis', 'scenario', 'ai_proposal', 'evidence', 'action'])
export type NodeKind = z.infer<typeof NodeKindSchema>
export const ChartIdSchema = z.enum(['monthly_cashflow', 'cash_balance', 'assets_liabilities', 'net_worth', 'goal_timeline', 'scenario_compare'])
export type ChartId = z.infer<typeof ChartIdSchema>

export const TopicConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  serviceName: z.string(),
  tagline: z.string(),
  problem: z.string(),
  targetCustomer: z.string(),
  primaryClientId: z.string(),
  signatureVisual: SignatureVisualSchema,
  accent: z.enum(['cyan', 'blue', 'violet', 'emerald', 'amber', 'rose']),
  icon: z.string(),
  modules: z.array(z.string()),
  agents: z.array(z.object({ agent: z.string(), focus: z.string() })),
  requiresDevelopment: z.array(z.string()),
  inputSchema: z.array(z.object({ key: z.string(), label: z.string(), unit: z.string(), min: z.number(), max: z.number(), default: z.number(), description: z.string() })),
  canvas: z.object({
    nodes: z.array(z.object({ id: z.string(), kind: NodeKindSchema, label: z.string(), detail: z.string(), x: z.number(), y: z.number(), metric: z.string().nullable().optional() })),
    edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), label: z.string() })),
  }),
  scenarioPresets: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), color: z.string(), adjustments: AdjustmentsSchema })),
  visual: z.object({ charts: z.array(ChartIdSchema), kpis: z.array(z.string()), heroMotif: z.string(), signatureTitle: z.string(), signatureDescription: z.string() }),
  content: z.object({
    heroTitle: z.string(),
    heroSubtitle: z.string(),
    intro: z.string(),
    problemStatement: z.string(),
    analysisQuestions: z.array(z.string()),
    stageDescriptions: z.array(z.string()),
    insightsHeading: z.string(),
    reportTitle: z.string(),
    reportSections: z.array(z.object({ id: z.string(), title: z.string() })),
    actionTemplates: z.array(z.object({ id: z.string(), title: z.string(), priority: z.number(), dueMonth: z.number(), amount: z.number(), reviewCondition: z.string() })),
    disclaimer: z.string(),
  }),
  rules: z.array(z.object({ id: z.string(), metric: z.string(), op: z.string(), threshold: z.number(), severity: SeveritySchema, title: z.string(), message: z.string() })),
  verificationChecklist: z.array(z.string()),
  aiDraftClaims: z.array(z.object({ id: z.string(), statement: z.string(), metric: z.string().nullable().optional(), claimedValue: z.number().nullable().optional(), scenarioPreset: z.string().nullable().optional(), rationale: z.string() })),
})
export type TopicConfig = z.infer<typeof TopicConfigSchema>

export const VersionMetaSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  label: z.string(),
  source: z.string(),
  status: z.string(),
  createdAt: z.string(),
  active: z.boolean(),
  validationOk: z.boolean().nullable(),
  name: z.string().nullable().optional(),
  signatureVisual: z.string().nullable().optional(),
  accent: z.string().nullable().optional(),
})
export type VersionMeta = z.infer<typeof VersionMetaSchema>

export const ActiveTopicSchema = z.object({ version: VersionMetaSchema, config: TopicConfigSchema, historyDepth: z.number() })
export type ActiveTopic = z.infer<typeof ActiveTopicSchema>

export const CheckSchema = z.object({ id: z.string(), label: z.string(), passed: z.boolean(), details: z.array(z.string()) })
export const ValidationReportSchema = z.object({ ok: z.boolean(), checks: z.array(CheckSchema) })
export type ValidationReport = z.infer<typeof ValidationReportSchema>

// ── 검증 ──
export const VerificationStatusSchema = z.enum(['verified', 'needs_review', 'insufficient_evidence', 'error_found', 'corrected'])
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>

export const ReviewRecordSchema = z.object({
  claimId: z.string(),
  statement: z.string(),
  decision: z.enum(['pending', 'approved', 'rejected', 'corrected']),
  correctedValue: z.number().nullable().optional(),
  correctedStatement: z.string(),
  note: z.string(),
  reviewer: z.string(),
  updatedAt: z.string(),
})
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>

const ClaimResultBase = z.object({
  claimId: z.string(),
  statement: z.string(),
  source: z.string(),
  status: VerificationStatusSchema,
  metric: z.string().nullable(),
  metricLabel: z.string().nullable(),
  unit: UnitSchema.nullable(),
  claimedValue: z.number().nullable(),
  computedValue: z.number().nullable(),
  difference: z.number().nullable(),
  tolerance: z.number().nullable(),
  formula: z.string().nullable(),
  inputs: z.array(z.object({ label: z.string(), value: z.number() })),
  scenarioName: z.string(),
  method: z.string(),
})
export const VerifiedClaimSchema = ClaimResultBase.extend({
  displayStatus: VerificationStatusSchema,
  review: ReviewRecordSchema.nullable(),
  correctedCheck: ClaimResultBase.nullable(),
})
export type VerifiedClaim = z.infer<typeof VerifiedClaimSchema>

export const VerificationResponseSchema = z.object({
  topicId: z.string(),
  checklist: z.array(z.string()),
  results: z.array(VerifiedClaimSchema),
  summary: z.object({ verified: z.number(), needsReview: z.number(), insufficientEvidence: z.number(), errorFound: z.number(), corrected: z.number() }),
})
export type VerificationResponse = z.infer<typeof VerificationResponseSchema>

export type ClaimInput = { id: string; statement: string; metric?: string | null; claimedValue?: number | null; scenarioPreset?: string | null; source: 'ai_draft' | 'user' | 'rule_engine' }

// ── 실행계획 ──
export const ActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.number(),
  targetDate: z.string(),
  amount: z.number(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']),
  reviewCondition: z.string(),
  notes: z.string(),
  templateId: z.string().nullable().optional(),
})
export type ActionItem = z.infer<typeof ActionItemSchema>
export const ActionsResponseSchema = z.object({ items: z.array(ActionItemSchema), saved: z.boolean() })

// ── Health / AI ──
export const HealthSchema = z.object({
  status: z.string(),
  version: z.string(),
  activeTopic: z.object({ versionId: z.string(), topicId: z.string(), name: z.string() }),
  ai: z.object({ mode: z.string(), llmKeyDetected: z.boolean(), llmCallsEnabled: z.boolean(), note: z.string(), model: z.string().nullable().optional(), llmFeatures: z.array(z.string()).optional().default([]), llmInputScope: z.string().optional().default('') }),
  adminEnabled: z.boolean(),
  devAdminHint: z.boolean(),
})
export type Health = z.infer<typeof HealthSchema>

export const AgentsResponseSchema = z.object({
  status: HealthSchema.shape.ai,
  agents: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), runtime: z.string(), systemPromptText: z.string(), taskPromptText: z.string(), inputSchema: z.string(), outputSchema: z.string() }).passthrough()),
})
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>

// ── Adaptive Idea Engine ──
export type IdeaInput = {
  ideaName: string
  description: string
  coreProblem?: string
  targetCustomer?: string
  financialProblem?: string
  aiRole?: string
  requiredData?: string
  expectedGoals?: string
  keyRisks?: string
  desiredFeatures?: string
  references?: string
  notes?: string
}

const ScoreEntry = z.object({ id: z.string(), label: z.string(), score: z.number(), matched: z.array(z.string()) })
export const IdeaAnalysisSchema = z.object({
  ideaName: z.string(),
  analysisMode: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  baseArchetype: z.string(),
  archetypeScores: z.array(ScoreEntry),
  dimensionScores: z.array(ScoreEntry),
  recommendedVisual: SignatureVisualSchema,
  problemDefinition: z.string(),
  customerType: z.string(),
  financialGoals: z.array(z.string()),
  keyRisks: z.array(z.string()),
  variables: z.array(z.string()),
  userActions: z.array(z.string()),
  aiFunctions: z.array(z.string()),
  verifiableOutcomes: z.array(z.string()),
  stageMapping: z.array(z.object({ stage: z.number(), stageName: z.string(), screen: z.string(), feature: z.string() })),
  capabilities: z.array(z.object({ capability: z.string(), status: z.enum(['supported', 'partial', 'requires_development']), module: z.string().nullable(), note: z.string() })),
  extracted: z.object({
    age: z.number().nullable(),
    monthlyIncome: z.number().nullable(),
    livingExpenses: z.number().nullable(),
    cashAssets: z.number().nullable(),
    debtBalance: z.number().nullable(),
    familySupport: z.number().nullable(),
  }),
  notices: z.array(z.string()),
})
export type IdeaAnalysis = z.infer<typeof IdeaAnalysisSchema>

export const GenerationNoteSchema = z.object({ item: z.string(), mode: z.enum(['generated', 'reused', 'requires_development']), detail: z.string() })
export type GenerationNote = z.infer<typeof GenerationNoteSchema>

export const GenerateResponseSchema = z.object({ versionId: z.string(), mode: z.string(), validation: ValidationReportSchema, notes: z.array(GenerationNoteSchema) })

export const PreviewSchema = z.object({
  version: VersionMetaSchema,
  config: TopicConfigSchema,
  client: ClientSchema.nullable(),
  meta: z.record(z.string(), z.unknown()),
  validation: ValidationReportSchema.nullable(),
  scenarioPreview: z.array(
    z.object({ presetId: z.string(), name: z.string(), color: z.string(), summary: SummarySchema, netWorth: z.array(z.number()), cash: z.array(z.number()), kpis: z.array(MetricSchema) }),
  ),
})
export type Preview = z.infer<typeof PreviewSchema>

export const VersionsResponseSchema = z.object({
  activeVersionId: z.string(),
  historyDepth: z.number(),
  versions: z.array(VersionMetaSchema),
  log: z.array(z.object({ action: z.string(), fromVersion: z.string(), toVersion: z.string(), at: z.string() })),
})
export type VersionsResponse = z.infer<typeof VersionsResponseSchema>

export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown() }) })
