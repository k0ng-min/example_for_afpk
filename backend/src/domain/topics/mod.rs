//! 주제(Topic) 구성 스키마. topics/<id>/*.json 및 Adaptive Idea Engine 생성물 모두 이 타입으로 역직렬화·검증한다.
//! JSON 에는 실행 가능한 코드를 넣을 수 없다: 시각화·아이콘·모듈·차트·노드 유형은 모두 허용 목록(enum)이다.

pub mod loader;
pub mod validate;

use serde::{Deserialize, Serialize};

use crate::domain::scenarios::ScenarioAdjustments;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SignatureVisual {
    CommitmentGraph,
    ContagionMap,
    CareTimeline,
    GoalDiscovery,
    VerificationCourt,
    ScenarioOverview,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Accent {
    Cyan,
    Blue,
    Violet,
    Emerald,
    Amber,
    Rose,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IconId {
    Sparkles,
    HeartHandshake,
    Store,
    HeartPulse,
    Compass,
    Scale,
    Shield,
    Target,
    Users,
    Wallet,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Motif {
    Orbit,
    Commitment,
    Contagion,
    CareWave,
    Discovery,
    Court,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModuleId {
    CoreCashflow,
    GoalPriority,
    BusinessContagion,
    CareShock,
    ClaimVerification,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChartId {
    MonthlyCashflow,
    CashBalance,
    AssetsLiabilities,
    NetWorth,
    GoalTimeline,
    ScenarioCompare,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Client,
    Goal,
    Risk,
    Analysis,
    Scenario,
    AiProposal,
    Evidence,
    Action,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentId {
    FinancialAnalyst,
    ScenarioPlanner,
    RiskDetector,
    Critic,
    ReportWriter,
    IdeaConfigurator,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuleOp {
    Lt,
    Lte,
    Gt,
    Gte,
    Missing,
    Present,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputField {
    pub key: String,
    pub label: String,
    pub unit: String,
    pub min: i64,
    pub max: i64,
    pub default: i64,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasNode {
    pub id: String,
    pub kind: NodeKind,
    pub label: String,
    #[serde(default)]
    pub detail: String,
    pub x: i32,
    pub y: i32,
    /// 노드에 실시간 계산값을 표시할 지표 key (metrics 레지스트리)
    #[serde(default)]
    pub metric: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasConfig {
    pub nodes: Vec<CanvasNode>,
    pub edges: Vec<CanvasEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub adjustments: ScenarioAdjustments,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisualConfig {
    pub charts: Vec<ChartId>,
    pub kpis: Vec<String>,
    pub hero_motif: Motif,
    #[serde(default)]
    pub signature_title: String,
    #[serde(default)]
    pub signature_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionTemplate {
    pub id: String,
    pub title: String,
    pub priority: u8,
    /// 시작 후 개월 수
    pub due_month: u32,
    pub amount: i64,
    #[serde(default)]
    pub review_condition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportSection {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Content {
    pub hero_title: String,
    pub hero_subtitle: String,
    pub intro: String,
    pub problem_statement: String,
    pub analysis_questions: Vec<String>,
    /// 표준 재무설계 6단계 설명 (정확히 6개)
    pub stage_descriptions: Vec<String>,
    pub insights_heading: String,
    pub report_title: String,
    pub report_sections: Vec<ReportSection>,
    pub action_templates: Vec<ActionTemplate>,
    #[serde(default)]
    pub disclaimer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub metric: String,
    pub op: RuleOp,
    #[serde(default)]
    pub threshold: i64,
    pub severity: Severity,
    pub title: String,
    /// `{value}` 자리표시자만 지원(서버에서 숫자 서식으로 치환)
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftClaim {
    pub id: String,
    pub statement: String,
    #[serde(default)]
    pub metric: Option<String>,
    #[serde(default)]
    pub claimed_value: Option<i64>,
    /// 주장이 전제하는 시나리오 프리셋 id (없으면 기본 상태 기준)
    #[serde(default)]
    pub scenario_preset: Option<String>,
    #[serde(default)]
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentBinding {
    pub agent: AgentId,
    /// 주제별 역할 지시(프롬프트에 데이터로 삽입되는 짧은 문장)
    pub focus: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TopicConfig {
    pub id: String,
    pub name: String,
    pub service_name: String,
    pub tagline: String,
    pub problem: String,
    pub target_customer: String,
    pub primary_client_id: String,
    pub signature_visual: SignatureVisual,
    pub accent: Accent,
    pub icon: IconId,
    pub modules: Vec<ModuleId>,
    pub agents: Vec<AgentBinding>,
    /// 런타임 구성으로 지원되지 않아 Claude Code 개발 작업이 필요한 항목
    #[serde(default)]
    pub requires_development: Vec<String>,
    pub input_schema: Vec<InputField>,
    pub canvas: CanvasConfig,
    pub scenario_presets: Vec<ScenarioPreset>,
    pub visual: VisualConfig,
    pub content: Content,
    pub rules: Vec<Rule>,
    pub verification_checklist: Vec<String>,
    #[serde(default)]
    pub ai_draft_claims: Vec<DraftClaim>,
}
