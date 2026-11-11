// Rust `finance::cpa_gap` 응답 타입(백엔드 serde camelCase 와 1:1). 계산은 서버 전담.
import { z } from 'zod'

export type Strategy = 'A' | 'B' | 'C' | 'D'
export const STRATEGIES: Strategy[] = ['A', 'B', 'C', 'D']

export type CpaInputs = {
  startMonth: string
  shortHorizon: number
  longHorizon: number
  cash0: number
  deposit: number
  studentLoan: number
  iclMonthly: number
  iclStart: string | null
  otherDebtPayment: number
  currentIncome: number
  living: number
  rent: number
  examCost: number
  examCostAfter: number
  examCostChange: string
  supportInitial: number
  supportReduced: number
  supportReduceFrom: string
  supportStopFrom: string
  safetyMin: number
  partTimeIncome: number
  partTimeLead: number
  jobWage: number | null
  jobLead: number
  examMonth: string
  announceMonth: string
  signal1: number
  signal2: number
  signal2Cut: number
  unverifiedInflow: number
  /** 기간 한정 흐름(지원 제도·대출 가정). 서버 기본값은 빈 배열 */
  extraFlows?: ExtraFlow[]
  traineeSalary: number | null
  cpaSalary: number | null
  traineeMonths: number
  delay: number
  pPct: number
  qPct: number
  partTimePenaltyPp: number
  discountBps: number
}

export type Outcome = { kind: 'unresolved' } | { kind: 'passPlaced'; delay: number } | { kind: 'passUnplaced' } | { kind: 'fail' }
export type Mode = 'study' | 'studyWork' | 'job' | 'trainee' | 'cpa' | 'search'

export type MonthRow = {
  index: number
  month: string
  mode: Mode
  support: number
  base: number
  partTime: number
  wage: number
  trainee: number
  extra: number
  living: number
  exam: number
  debt: number
  icl: number
  inflow: number
  outflow: number
  net: number
  midLow: number
  cash: number
}

export type PathEvent = { index: number; month: string; kind: string; detail: string }

export type PathResult = {
  strategy: Strategy
  outcome: Outcome
  months: MonthRow[]
  minCash: number
  minMonth: string
  tau: string | null
  tauCash: number | null
  insolvent: string | null
  endCash: number
  firstIncome: string | null
  partTimeFrom: number | null
  events: PathEvent[]
  missing: string[]
  notes: string[]
}

export type Tolerance = {
  strategy: Strategy
  months: number | null
  openEnded: boolean
  margin: number | null
  earliestPay: string
  available: boolean
  missing: string[]
}

export type BranchSummary = {
  outcome: Outcome
  minCash: number
  minMonth: string
  tau: string | null
  insolvent: string | null
  endCash: number
  firstIncome: string | null
  safe: boolean
  complete: boolean
  missing: string[]
}

export type SignalStatus = {
  id: number
  threshold: number | null
  current: number
  ifNoAction: string | null
  ifNoActionCash: number | null
  ruleTrigger: string | null
  ruleTriggerCash: number | null
  effectFrom: string | null
  triggeredNow: boolean
}

export type StrategyValue = {
  strategy: Strategy
  feasible: boolean
  pUsed: number
  value: number
  valueByRate: [number, number][]
  range: [number, number]
  paths: { outcome: Outcome; pv: number; endCash: number; minCash: number }[]
  expectedCash: number[]
  lowCash: number[]
  highCash: number[]
  rank: number | null
}

export type HeatCell = { p: number; q: number; winner: Strategy | null; winnerIgnoringGate: Strategy }

export type Analysis = {
  inputs: CpaInputs
  short: PathResult[]
  tolerance: Tolerance[]
  uncertainty: { strategy: Strategy; branches: BranchSummary[] }[]
  signals: {
    items: SignalStatus[]
    ruleBreach: string | null
    ruleBreachCash: number | null
    ruleInsolvent: string | null
    cashAtAnnounce: number
    notes: string[]
  }
  long: { available: boolean; missing: string[]; months: string[]; strategies: StrategyValue[]; heatmap: HeatCell[]; heatSteps: number[] }
  markers: { month: string; kind: string; label: string }[]
  balanceSheet: { liquid: number; deposit: number; totalAssets: number; studentLoan: number; netWorth: number; runwayX10: number }
}

// 응답 구조의 뼈대만 검사(필드 상세는 Rust 테스트가 보장). 형식이 달라지면 화면 대신 오류를 보여준다.
export const AnalysisSchema = z
  .object({
    inputs: z.object({ cash0: z.number() }).passthrough(),
    short: z.array(z.object({ strategy: z.enum(['A', 'B', 'C', 'D']), months: z.array(z.object({ cash: z.number(), month: z.string() }).passthrough()) }).passthrough()).length(4),
    tolerance: z.array(z.unknown()),
    uncertainty: z.array(z.unknown()),
    signals: z.object({ items: z.array(z.unknown()) }).passthrough(),
    long: z.object({ available: z.boolean() }).passthrough(),
    markers: z.array(z.unknown()),
    balanceSheet: z.object({ liquid: z.number() }).passthrough(),
  })
  .passthrough()

export type Flagged = { flags: string[] }

export type Experiment = {
  id: string
  title: string
  risk: string
  harm: string
  method: string
  sources: string[]
  check: string
  prompt: string
}

export type ExperimentsDoc = {
  version: string
  note: string
  systemPrompt: string
  clientBrief: string
  sources: { id: string; title: string }[]
  experiments: Experiment[]
  ai: { configured: boolean; model: string | null }
}

export const ExperimentsSchema = z
  .object({
    systemPrompt: z.string(),
    clientBrief: z.string(),
    sources: z.array(z.object({ id: z.string(), title: z.string() })),
    experiments: z.array(z.object({ id: z.string(), title: z.string(), prompt: z.string() }).passthrough()),
    ai: z.object({ configured: z.boolean(), model: z.string().nullable() }),
  })
  .passthrough()

export const RunSchema = z.object({
  experimentId: z.string(),
  provider: z.string(),
  model: z.string(),
  ranAt: z.string(),
  systemPrompt: z.string(),
  prompt: z.string(),
  output: z.string(),
  flags: z.array(z.string()),
})
export type RunResult = z.infer<typeof RunSchema>

export type IclResult = {
  grossAnnual: number
  deduction: number
  earnedIncome: number
  threshold: number
  thresholdYear: number
  thresholdConfirmed: boolean
  rateBps: number
  annualObligation: number
  monthlyWithholding: number
  withholdingFrom: string
}

export type ExtraFlow = { from: string; months: number; amount: number; label: string }

export type StrategyEffect = { strategy: Strategy; tau: string | null; minCash: number; endCash: number }
export type SensitivityRow = { key: string; label: string; lowLabel: string; highLabel: string; runwayLow: number | null; runwayHigh: number | null; endLow: number; endHigh: number }
export type SupportOption = {
  id: string
  name: string
  kind: 'grant' | 'loan'
  summary: string
  flows: ExtraFlow[]
  totalIn: number
  totalOut: number
  conditions: string
  caution: string
  source: string
  sourceUrl: string
  verified: boolean
  runway: number | null
  effects: StrategyEffect[]
}
export type Explore = {
  sensitivity: { runwayBase: number | null; endBase: number; horizon: number; rows: SensitivityRow[] }
  supports: { baseRunway: number | null; base: StrategyEffect[]; options: SupportOption[] }
  stress: { base: StressCase; cases: StressCase[] }
  fans: Fan[]
}

export type Fan = { strategy: Strategy; delays: number[]; months: string[]; series: number[][]; taus: (string | null)[]; missing: string[] }
export type StressEffect = { strategy: Strategy; tau: string | null; insolvent: string | null; minCash: number; endCash: number; missing: boolean }
export type StressCase = { id: string; label: string; detail: string; effects: StressEffect[] }
export type CheckinEntry = { month: string; cash: number }
export type CheckinRow = { month: string; actual: number; plan: number | null; diff: number | null; level: 'safe' | 'signal1' | 'signal2' | 'belowSafety'; action: string }
export type Checkin = {
  strategy: Strategy
  plan: { month: string; cash: number }[]
  rows: CheckinRow[]
  reprojection: { from: string; cash: number; runway: number | null; strategyTau: string | null; strategyEnd: number; endMonth: string } | null
}
