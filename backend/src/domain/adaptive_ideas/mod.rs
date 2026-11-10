//! Adaptive Idea Engine (런타임 방식 B).
//! 아이디어 텍스트는 신뢰할 수 없는 입력이다. 이 모듈은 텍스트를 "데이터"로만 해석하며
//! 코드 생성·실행을 하지 않는다. 결과물은 기존에 구현·검증된 모듈과 컴포넌트의 조합뿐이다.

use serde::{Deserialize, Serialize};

use crate::domain::clients::Client;
use crate::domain::goals::Goal;
use crate::domain::topics::{
    Accent, AgentBinding, AgentId, CanvasEdge, CanvasNode, ChartId, DraftClaim, IconId, ModuleId,
    Motif, NodeKind, ScenarioPreset, SignatureVisual, TopicConfig,
};
use crate::domain::scenarios::ScenarioAdjustments;
use crate::finance::care::{care_events, CareParams};
use crate::finance::validation::{validate_client, FieldError};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdeaInput {
    pub idea_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub core_problem: Option<String>,
    #[serde(default)]
    pub target_customer: Option<String>,
    #[serde(default)]
    pub financial_problem: Option<String>,
    #[serde(default)]
    pub ai_role: Option<String>,
    #[serde(default)]
    pub required_data: Option<String>,
    #[serde(default)]
    pub expected_goals: Option<String>,
    #[serde(default)]
    pub key_risks: Option<String>,
    #[serde(default)]
    pub desired_features: Option<String>,
    #[serde(default)]
    pub references: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl IdeaInput {
    fn optional_fields(&self) -> [(&'static str, &Option<String>); 10] {
        [
            ("coreProblem", &self.core_problem),
            ("targetCustomer", &self.target_customer),
            ("financialProblem", &self.financial_problem),
            ("aiRole", &self.ai_role),
            ("requiredData", &self.required_data),
            ("expectedGoals", &self.expected_goals),
            ("keyRisks", &self.key_risks),
            ("desiredFeatures", &self.desired_features),
            ("references", &self.references),
            ("notes", &self.notes),
        ]
    }

    pub fn full_text(&self) -> String {
        let mut s = format!("{}\n{}", self.idea_name, self.description);
        for (_, v) in self.optional_fields() {
            if let Some(v) = v {
                s.push('\n');
                s.push_str(v);
            }
        }
        s
    }

    pub fn validate(&self) -> Vec<FieldError> {
        let mut e = vec![];
        let mut push = |f: &str, m: &str| e.push(FieldError { field: f.into(), message: m.into() });
        let name = self.idea_name.trim();
        if name.is_empty() {
            push("ideaName", "아이디어명은 필수입니다");
        }
        if name.chars().count() > 80 {
            push("ideaName", "아이디어명은 80자 이하입니다");
        }
        if self.description.chars().count() > 4000 {
            push("description", "설명은 4000자 이하입니다");
        }
        for (f, v) in self.optional_fields() {
            if let Some(v) = v {
                if v.chars().count() > 1500 {
                    push(f, "각 항목은 1500자 이하입니다");
                }
            }
        }
        if self.full_text().chars().any(|c| c.is_control() && c != '\n' && c != '\t' && c != '\r') {
            push("ideaName", "제어 문자는 허용되지 않습니다");
        }
        e
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreEntry {
    pub id: &'static str,
    pub label: &'static str,
    pub score: usize,
    pub matched: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageMapping {
    pub stage: u8,
    pub stage_name: &'static str,
    pub screen: &'static str,
    pub feature: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capability {
    pub capability: String,
    /// "supported" | "partial" | "requires_development"
    pub status: &'static str,
    pub module: Option<ModuleId>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedNumbers {
    pub age: Option<u32>,
    pub monthly_income: Option<i64>,
    pub living_expenses: Option<i64>,
    pub cash_assets: Option<i64>,
    pub debt_balance: Option<i64>,
    pub family_support: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaAnalysis {
    pub idea_name: String,
    /// "rule_based" — AI API 없이 키워드·규칙으로 분석했음을 명시
    pub analysis_mode: &'static str,
    pub confidence: &'static str,
    pub base_archetype: &'static str,
    pub archetype_scores: Vec<ScoreEntry>,
    pub dimension_scores: Vec<ScoreEntry>,
    pub recommended_visual: SignatureVisual,
    pub problem_definition: String,
    pub customer_type: String,
    pub financial_goals: Vec<String>,
    pub key_risks: Vec<String>,
    pub variables: Vec<String>,
    pub user_actions: Vec<String>,
    pub ai_functions: Vec<String>,
    pub verifiable_outcomes: Vec<String>,
    pub stage_mapping: Vec<StageMapping>,
    pub capabilities: Vec<Capability>,
    pub extracted: ExtractedNumbers,
    pub notices: Vec<String>,
}

const ARCHETYPES: &[(&str, &str, &[&str])] = &[
    ("family_commitment", "가족 부양·목표 충돌", &["가족", "부양", "부모", "생활비 지원", "송금", "효도", "형제", "약속", "주거 독립", "자취", "용돈"]),
    ("household_business", "가계·사업 위험 전파", &["사업", "자영업", "소상공인", "매출", "가게", "창업", "프리랜서", "운영자금", "폐업", "사업자", "점포"]),
    ("care_crisis", "돌봄·소득 충격", &["돌봄", "간병", "요양", "치매", "장애", "휴직", "병원", "의료비", "간호", "입원", "사고"]),
    ("goal_discovery", "목표 우선순위 탐색", &["목표", "우선순위", "인터뷰", "질문", "반증", "결혼", "진학", "진로", "유학", "꿈", "버킷"]),
    ("ai_verification", "AI 결과 검증", &["ai", "인공지능", "챗봇", "검증", "환각", "오류", "신뢰", "반론", "심사", "근거", "팩트"]),
];

const DIMENSIONS: &[(&str, &str, &[&str])] = &[
    ("relationship", "관계 중심 → 노드 그래프", &["관계", "연결", "전파", "전이", "가족", "네트워크", "영향", "연쇄", "전염"]),
    ("time", "시간 중심 → 타임라인", &["시간", "시점", "타임라인", "72시간", "갑작스", "갑자기", "위기", "단계", "기간", "응급"]),
    ("change", "재무 변화 중심 → 시뮬레이션 차트", &["변화", "시뮬레이션", "감소", "증가", "추이", "미래", "예측", "전망"]),
    ("choice", "선택 중심 → 의사결정 비교", &["선택", "우선순위", "결정", "트레이드오프", "포기", "비교", "갈등", "충돌"]),
    ("verification", "검증 중심 → 검증 워크플로", &["검증", "근거", "오류", "판단", "신뢰", "심사", "반론", "출처"]),
];

const UNSUPPORTED: &[(&[&str], &str)] = &[
    (&["세금", "절세", "연말정산", "소득공제"], "세금 계산 — 현재 Rust 엔진에 세금 모듈이 없어 Claude Code 개발 필요"),
    (&["연금", "은퇴", "노후"], "연금·은퇴 인출 계산 — 전용 모듈 개발 필요(현재는 목표 금액으로만 표현)"),
    (&["보험", "보장"], "보험 보장 분석 — 전용 모듈 개발 필요"),
    (&["몬테카를로", "확률", "변동성"], "확률적 시뮬레이션 — 현재는 결정론적 계산만 지원"),
    (&["주식", "포트폴리오", "코인", "etf", "자산배분"], "포트폴리오·자산배분 — 단일 기대수익률 가정만 지원"),
    (&["주택담보", "청약", "ltv", "dsr 규제", "전세대출"], "주택금융 규정 계산 — 확인된 규정 데이터와 모듈 개발 필요"),
    (&["마이데이터", "실시간", "계좌 연동", "오픈뱅킹"], "외부 금융데이터 연동 — 초기 범위는 합성 데이터만 사용"),
    (&["이미지 생성", "일러스트 생성", "영상"], "AI 이미지 생성 — 도구 미연결, 주제별 SVG 모티프로 대체"),
];

fn score(text: &str, table: &'static [(&'static str, &'static str, &'static [&'static str])]) -> Vec<ScoreEntry> {
    let mut v: Vec<ScoreEntry> = table
        .iter()
        .map(|(id, label, kws)| {
            let matched: Vec<&'static str> = kws.iter().copied().filter(|k| text.contains(k)).collect();
            ScoreEntry { id, label, score: matched.len(), matched }
        })
        .collect();
    v.sort_by(|a, b| b.score.cmp(&a.score));
    v
}

fn split_list(v: &Option<String>) -> Vec<String> {
    // "1,000만원"의 천 단위 쉼표는 항목 구분자가 아니므로 먼저 제거
    let raw: Vec<char> = v.as_deref().unwrap_or("").chars().collect();
    let cleaned: String = raw
        .iter()
        .enumerate()
        .filter(|(i, c)| !(**c == ',' && *i > 0 && raw[i - 1].is_ascii_digit() && raw.get(i + 1).is_some_and(|n| n.is_ascii_digit())))
        .map(|(_, c)| *c)
        .collect();
    cleaned
        .split(['\n', ',', '·', ';'])
        .map(|s| s.trim().trim_start_matches(['-', '*', '•']).trim().to_string())
        .filter(|s| !s.is_empty())
        .take(6)
        .map(|s| s.chars().take(60).collect())
        .collect()
}

fn first_sentence(s: &str, max: usize) -> String {
    let t = s.trim();
    let end = t.find(['.', '\n', '!', '?']).map(|i| i + 1).unwrap_or(t.len());
    t[..end].trim().chars().take(max).collect()
}

/// "월 소득 300만원", "현금 1,500만 원", "부채 2억" 같은 표현에서 키워드 뒤 첫 금액을 읽는다.
pub fn amount_after(text: &str, keywords: &[&str]) -> Option<i64> {
    for k in keywords {
        let Some(pos) = text.find(k) else { continue };
        let rest: Vec<char> = text[pos + k.len()..].chars().take(24).collect();
        let mut i = 0;
        // 문장·항목 경계를 넘어가면 다른 항목의 금액이므로 중단(예: "대출 부담. 월 소득 290만원")
        while i < rest.len() && !rest[i].is_ascii_digit() && !matches!(rest[i], '.' | ',' | '\n' | ';' | '。') {
            i += 1;
        }
        if i >= rest.len() || !rest[i].is_ascii_digit() {
            continue;
        }
        let mut digits = String::new();
        while i < rest.len() && (rest[i].is_ascii_digit() || rest[i] == ',') {
            if rest[i] != ',' {
                digits.push(rest[i]);
            }
            i += 1;
        }
        while i < rest.len() && rest[i] == ' ' {
            i += 1;
        }
        let Ok(n) = digits.parse::<i64>() else { continue };
        let mult = match rest.get(i) {
            Some('만') => 10_000,
            Some('억') => 100_000_000,
            Some('천') => 10_000_000, // "천만"
            Some('원') => 1,
            _ => continue,
        };
        return n.checked_mul(mult).filter(|v| *v <= 100_000_000_000);
    }
    None
}

pub fn age_in(text: &str) -> Option<u32> {
    let chars: Vec<char> = text.chars().collect();
    for i in 0..chars.len() {
        if chars[i] == '세' || chars[i] == '살' {
            let mut j = i;
            while j > 0 && chars[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j < i {
                let n: String = chars[j..i].iter().collect();
                if let Ok(a) = n.parse::<u32>() {
                    if (15..=100).contains(&a) {
                        return Some(a);
                    }
                }
            }
        }
    }
    None
}

fn visual_for(dim: &str, base: &str) -> SignatureVisual {
    match (dim, base) {
        ("relationship", "household_business") => SignatureVisual::ContagionMap,
        ("relationship", _) => SignatureVisual::CommitmentGraph,
        ("time", _) => SignatureVisual::CareTimeline,
        ("choice", _) => SignatureVisual::GoalDiscovery,
        ("verification", _) => SignatureVisual::VerificationCourt,
        ("change", _) => SignatureVisual::ScenarioOverview,
        _ => match base {
            "family_commitment" => SignatureVisual::CommitmentGraph,
            "household_business" => SignatureVisual::ContagionMap,
            "care_crisis" => SignatureVisual::CareTimeline,
            "goal_discovery" => SignatureVisual::GoalDiscovery,
            "ai_verification" => SignatureVisual::VerificationCourt,
            _ => SignatureVisual::ScenarioOverview,
        },
    }
}

pub fn analyze(input: &IdeaInput) -> IdeaAnalysis {
    let text = input.full_text().to_lowercase();
    let archetypes = score(&text, ARCHETYPES);
    let dims = score(&text, DIMENSIONS);
    let top = &archetypes[0];
    let base_archetype: &'static str = if top.score == 0 { "shared_workspace" } else { top.id };
    let top_dim = if dims[0].score == 0 { "" } else { dims[0].id };
    let mut recommended_visual = visual_for(top_dim, base_archetype);
    // 사업 프로필이 없는 기본 사례에서는 전염 지도를 쓸 수 없다(검증 규칙과 동일).
    if recommended_visual == SignatureVisual::ContagionMap && base_archetype != "household_business" {
        recommended_visual = SignatureVisual::CommitmentGraph;
    }
    let confidence = match top.score {
        0 => "low",
        1 | 2 => "medium",
        _ => "high",
    };

    let mut notices = vec![
        "규칙 기반 분석입니다(AI API 미사용). 키워드 일치로 기존 검증된 모듈만 조합합니다.".to_string(),
    ];
    if top.score == 0 {
        notices.push("기존 5개 후보와 일치하는 키워드가 없어 공통 워크스페이스를 기반으로 구성합니다. 설명을 보강하면 정확도가 높아집니다.".into());
    }
    if archetypes.len() > 1 && archetypes[1].score > 0 && archetypes[1].score == top.score {
        notices.push(format!("'{}'와 '{}' 유형이 동점입니다. 첫 번째 유형을 기반으로 구성합니다.", top.label, archetypes[1].label));
    }

    let mut capabilities: Vec<Capability> = vec![
        Capability { capability: "월별 현금흐름·자산·부채·순자산 시뮬레이션".into(), status: "supported", module: Some(ModuleId::CoreCashflow), note: "기본 Rust 엔진".into() },
        Capability { capability: "목표 우선순위·달성 시점 평가".into(), status: "supported", module: Some(ModuleId::GoalPriority), note: "누적 적립 방식".into() },
    ];
    match base_archetype {
        "household_business" => capabilities.push(Capability { capability: "사업→가계 위험 전파 계산".into(), status: "supported", module: Some(ModuleId::BusinessContagion), note: "finance::business".into() }),
        "care_crisis" => capabilities.push(Capability { capability: "돌봄 충격(소득 감소·비용 증가) 이벤트".into(), status: "supported", module: Some(ModuleId::CareShock), note: "finance::care".into() }),
        "ai_verification" => capabilities.push(Capability { capability: "AI 주장 독립 계산 검증".into(), status: "supported", module: Some(ModuleId::ClaimVerification), note: "services::verification".into() }),
        _ => {}
    }
    for (kws, msg) in UNSUPPORTED {
        if kws.iter().any(|k| text.contains(k)) {
            capabilities.push(Capability { capability: msg.to_string(), status: "requires_development", module: None, note: "런타임 자동 구성 불가 — 개발 방식 A(Claude Code)로 구현 후 프리셋에 등록".into() });
        }
    }

    let mut goals = split_list(&input.expected_goals);
    if goals.is_empty() {
        goals = match base_archetype {
            "family_commitment" => vec!["주거 독립 자금".into(), "가족 지원 지속 가능성 확보".into()],
            "household_business" => vec!["가계 생활 안정 자금".into(), "사업 완충자금".into()],
            "care_crisis" => vec!["돌봄 초기 긴급자금".into(), "돌봄 장기화 대비 자금".into()],
            "goal_discovery" => vec!["실제 1순위 목표 자금".into(), "후순위 목표 재조정".into()],
            "ai_verification" => vec!["검증된 비상예비자금".into(), "고금리 부채 상환".into()],
            _ => vec!["비상예비자금".into(), "1순위 재무목표".into()],
        };
    }
    let mut risks = split_list(&input.key_risks);
    if risks.is_empty() {
        risks = vec!["월 순현금흐름 적자".into(), "비상자금 부족".into()];
    }
    let problem_definition = input
        .core_problem
        .clone()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| input.financial_problem.clone().filter(|s| !s.trim().is_empty()))
        .unwrap_or_else(|| first_sentence(&input.description, 300));
    let customer_type = input
        .target_customer
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "아이디어 설명에서 대상 고객이 명시되지 않음 — 기본 사례 고객 유형 사용".into());

    let feature = |s: &str| format!("{s} ({})", input.idea_name.chars().take(30).collect::<String>());
    let stage_mapping = vec![
        StageMapping { stage: 1, stage_name: "고객과의 관계 정립", screen: "Intelligence Home", feature: feature("주제 소개·상담 범위") },
        StageMapping { stage: 2, stage_name: "재무목표 설정 및 자료수집", screen: "Client Profile", feature: feature("합성 고객·목표 입력") },
        StageMapping { stage: 3, stage_name: "재무상태 분석 및 평가", screen: "AI Reasoning Canvas", feature: feature("위험·분석 노드") },
        StageMapping { stage: 4, stage_name: "재무설계안 수립 및 제시", screen: "Financial Scenario Lab", feature: feature("주제별 시나리오 프리셋") },
        StageMapping { stage: 5, stage_name: "재무설계안 실행", screen: "Action Planner", feature: feature("실행 템플릿") },
        StageMapping { stage: 6, stage_name: "재무설계안 점검", screen: "Verification Lab · Report Studio", feature: feature("검증·재점검 조건") },
    ];

    let raw = input.full_text();
    let extracted = ExtractedNumbers {
        age: age_in(&raw),
        monthly_income: amount_after(&raw, &["월 소득", "월소득", "세후", "월급", "소득"]),
        living_expenses: amount_after(&raw, &["생활비", "월 지출", "지출"]),
        cash_assets: amount_after(&raw, &["현금", "예금", "저축액"]),
        debt_balance: amount_after(&raw, &["부채", "대출", "빚"]),
        family_support: amount_after(&raw, &["가족 지원", "부모님께", "용돈", "송금"]),
    };

    IdeaAnalysis {
        idea_name: input.idea_name.trim().to_string(),
        analysis_mode: "rule_based",
        confidence,
        base_archetype,
        archetype_scores: archetypes,
        dimension_scores: dims,
        recommended_visual,
        problem_definition,
        customer_type,
        financial_goals: goals,
        key_risks: risks,
        variables: vec![
            "월 소득".into(), "고정·변동 지출".into(), "가족 지원".into(), "현금성 자산".into(),
            "부채 잔액·금리·상환액".into(), "목표 금액·시점·우선순위".into(), "미래 이벤트".into(),
        ],
        user_actions: vec![
            "합성 고객 정보 수정".into(), "시나리오 생성·복제·비교".into(), "AI 분석 실행".into(),
            "AI 주장 검증·판결 기록".into(), "실행계획 상태 관리".into(), "보고서 출력".into(),
        ],
        ai_functions: vec![
            "위험 탐색(규칙 기반)".into(), "목표 충돌 분석".into(), "시나리오 비교".into(),
            "반론 생성(Critic 프롬프트)".into(), "주장 검증(독립 계산)".into(), "보고서 작성".into(),
        ],
        verifiable_outcomes: vec![
            "월 순현금흐름".into(), "현금 소진 시점".into(), "목표 달성 시점".into(), "기간 총 이자".into(),
        ],
        stage_mapping,
        capabilities,
        extracted,
        notices,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationNote {
    pub item: &'static str,
    /// "generated" | "reused" | "requires_development"
    pub mode: &'static str,
    pub detail: String,
}

pub struct Generated {
    pub config: TopicConfig,
    pub client: Client,
    pub notes: Vec<GenerationNote>,
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn style_for(visual: SignatureVisual) -> (Accent, IconId, Motif, &'static str) {
    match visual {
        SignatureVisual::CommitmentGraph => (Accent::Violet, IconId::HeartHandshake, Motif::Commitment, "가족 약속 흐름도"),
        SignatureVisual::ContagionMap => (Accent::Rose, IconId::Store, Motif::Contagion, "위험 전파 지도"),
        SignatureVisual::CareTimeline => (Accent::Amber, IconId::HeartPulse, Motif::CareWave, "위기 타임라인"),
        SignatureVisual::GoalDiscovery => (Accent::Emerald, IconId::Compass, Motif::Discovery, "목표 우선순위 비교표"),
        SignatureVisual::VerificationCourt => (Accent::Blue, IconId::Scale, Motif::Court, "AI 검증 심리 흐름"),
        SignatureVisual::ScenarioOverview => (Accent::Cyan, IconId::Sparkles, Motif::Orbit, "시나리오 순자산 비교"),
    }
}

/// `base` 는 분석 결과의 기반 유형에 해당하는 프리셋, `base_client` 는 그 대표 고객.
pub fn generate(input: &IdeaInput, analysis: &IdeaAnalysis, base: &TopicConfig, base_client: &Client, suffix: &str) -> Generated {
    let idea = truncate(analysis.idea_name.trim(), 60);
    let topic_id = format!("gen_{suffix}");
    let client_id = format!("client_gen_{suffix}");
    let mut notes = vec![];
    let visual = analysis.recommended_visual;
    let (accent, icon, motif, sig_title) = style_for(visual);

    // ── 합성 고객 ──
    let mut client = base_client.clone();
    client.id = client_id.clone();
    client.topic_id = topic_id.clone();
    client.synthetic = true;
    client.name = truncate(&format!("{idea} 합성 고객"), 40);
    client.occupation = truncate(&analysis.customer_type, 60);
    let ex = &analysis.extracted;
    if let Some(a) = ex.age {
        client.age = a;
    }
    if let Some(v) = ex.monthly_income {
        client.monthly_income = v;
    }
    if let Some(v) = ex.living_expenses {
        // 생활비를 기존 사례의 고정:변동 비율로 분할
        let total = (base_client.fixed_expenses + base_client.variable_expenses).max(1);
        client.fixed_expenses = v * base_client.fixed_expenses / total;
        client.variable_expenses = v - client.fixed_expenses;
    }
    if let Some(v) = ex.cash_assets {
        client.cash_assets = v;
    }
    if let Some(v) = ex.family_support {
        client.family_support = v;
    }
    if let (Some(v), Some(first)) = (ex.debt_balance, client.liabilities.first_mut()) {
        first.balance = v;
    }
    let base_target = base_client.goals.first().map(|g| g.target_amount).unwrap_or(10_000_000);
    client.goals = analysis
        .financial_goals
        .iter()
        .take(4)
        .enumerate()
        .map(|(i, g)| Goal {
            id: format!("goal_gen_{}", i + 1),
            name: truncate(g, 80),
            target_amount: amount_after(g, &[""])
                .unwrap_or(if g.contains("비상") || g.contains("긴급") {
                    // 금액 미입력 비상자금 목표: 필수지출 3개월분(명시적 가정)
                    3 * (client.essential_expenses() + client.household_debt_payment())
                } else if i == 0 {
                    base_target
                } else {
                    base_target / 2
                })
                .max(100_000),
            target_month: 12 * (i as u32 + 2),
            priority: i as u8 + 1,
            category: "generated".into(),
        })
        .collect();
    client.assumptions = vec![
        format!("아이디어 '{idea}' 입력으로 자동 생성된 합성 고객입니다. 실제 고객·통계가 아닙니다."),
        format!("명시되지 않은 수치는 기본 사례({})의 합성 값을 재사용했습니다.", base_client.name),
        "목표 금액이 입력되지 않은 목표는 기본 사례 목표액을 기준으로 가정했습니다.".into(),
    ];
    let extracted_count = [ex.age.is_some(), ex.monthly_income.is_some(), ex.living_expenses.is_some(), ex.cash_assets.is_some(), ex.debt_balance.is_some(), ex.family_support.is_some()]
        .iter()
        .filter(|b| **b)
        .count();
    let client_errors = validate_client(&client);
    if !client_errors.is_empty() {
        // 추출 수치가 모순되면 기본 사례 수치로 되돌린다(숫자 모순 방지)
        let goals = client.goals.clone();
        let (name, occ, assumptions) = (client.name.clone(), client.occupation.clone(), client.assumptions.clone());
        client = base_client.clone();
        client.id = client_id.clone();
        client.topic_id = topic_id.clone();
        client.name = name;
        client.occupation = occ;
        client.goals = goals;
        client.assumptions = assumptions;
        notes.push(GenerationNote { item: "합성 고객", mode: "reused", detail: format!("추출 수치가 검증을 통과하지 못해 기본 사례 수치 사용: {}", client_errors.iter().map(|e| e.message.clone()).collect::<Vec<_>>().join(", ")) });
    } else {
        notes.push(GenerationNote { item: "합성 고객", mode: "generated", detail: format!("아이디어에서 수치 {extracted_count}개 추출, 나머지는 기본 사례 '{}' 재사용", base_client.name) });
    }

    // ── 캔버스: 기본 유형 배치를 재사용하고 아이디어의 위험·목표 노드를 추가 ──
    let mut canvas = base.canvas.clone();
    if let Some(n) = canvas.nodes.iter_mut().find(|n| n.kind == NodeKind::Client) {
        n.label = truncate(&format!("{} · {}세", client.name, client.age), 60);
        n.detail = truncate(&analysis.customer_type, 400);
    }
    let client_node = canvas.nodes.iter().find(|n| n.kind == NodeKind::Client).map(|n| n.id.clone()).unwrap_or_default();
    let ai_node = canvas.nodes.iter().find(|n| n.kind == NodeKind::AiProposal).map(|n| n.id.clone());
    let max_x = canvas.nodes.iter().map(|n| n.x).max().unwrap_or(0);
    for (i, r) in analysis.key_risks.iter().take(3).enumerate() {
        let id = format!("n_gen_risk_{}", i + 1);
        canvas.nodes.push(CanvasNode { id: id.clone(), kind: NodeKind::Risk, label: truncate(r, 60), detail: "아이디어 입력에서 추출한 위험(자동 생성)".into(), x: 160 + i as i32 * 300, y: 680, metric: None });
        canvas.edges.push(CanvasEdge { id: format!("e_gen_r{}", i + 1), source: client_node.clone(), target: id.clone(), label: "위험".into() });
        if let Some(ai) = &ai_node {
            canvas.edges.push(CanvasEdge { id: format!("e_gen_ra{}", i + 1), source: id, target: ai.clone(), label: "".into() });
        }
    }
    if let Some(g) = client.goals.first() {
        canvas.nodes.push(CanvasNode { id: "n_gen_goal".into(), kind: NodeKind::Goal, label: truncate(&g.name, 60), detail: "아이디어의 1순위 목표(자동 생성)".into(), x: max_x + 330, y: 520, metric: Some("primary_goal_achieved_month".into()) });
        canvas.edges.push(CanvasEdge { id: "e_gen_goal".into(), source: client_node.clone(), target: "n_gen_goal".into(), label: "목표".into() });
    }
    notes.push(GenerationNote { item: "AI 캔버스", mode: "generated", detail: format!("'{}' 배치 재사용 + 위험 {}개·목표 노드 추가", base.name, analysis.key_risks.len().min(3)) });

    // ── 시나리오: 기본 프리셋 재사용 + 시간 중심이면 돌봄 충격 모듈로 위기 이벤트 생성 ──
    let mut presets: Vec<ScenarioPreset> = base
        .scenario_presets
        .iter()
        .filter(|p| p.adjustments.goals.is_none()) // 기본 고객 목표를 전제로 한 프리셋은 제외
        .cloned()
        .collect();
    if presets.is_empty() {
        presets.push(ScenarioPreset { id: "p_base".into(), name: "현재 유지".into(), description: "현재 조건 그대로".into(), color: "#3060a8".into(), adjustments: ScenarioAdjustments::default() });
    }
    let mut modules = base.modules.clone();
    if visual == SignatureVisual::CareTimeline {
        let drop = (client.monthly_income / 5).max(0);
        presets.push(ScenarioPreset {
            id: "p_gen_shock".into(),
            name: "위기 발생(3개월 차)".into(),
            description: "소득 20% 감소 + 월 지출 증가(자동 생성 가정)".into(),
            color: "#2f93c9".into(),
            adjustments: ScenarioAdjustments { horizon_months: 36, events: care_events(CareParams { start_month: 3, income_drop: drop, care_cost: drop / 2, leave_months: 0, leave_income_drop: 0 }), ..Default::default() },
        });
        if !modules.contains(&ModuleId::CareShock) {
            modules.push(ModuleId::CareShock);
        }
    }
    if visual == SignatureVisual::VerificationCourt && !modules.contains(&ModuleId::ClaimVerification) {
        modules.push(ModuleId::ClaimVerification);
    }
    if !modules.contains(&ModuleId::GoalPriority) {
        modules.push(ModuleId::GoalPriority);
    }
    presets.push(ScenarioPreset {
        id: "p_gen_trim".into(),
        name: "변동지출 10% 절감".into(),
        description: "변동지출을 10% 줄이는 경우".into(),
        color: "#20907a".into(),
        adjustments: ScenarioAdjustments { variable_expense_change: -(client.variable_expenses / 10), ..Default::default() },
    });
    notes.push(GenerationNote { item: "시나리오", mode: "generated", detail: format!("{}개 프리셋(기본 유형 재사용 + 자동 생성)", presets.len()) });

    let mut visual_cfg = base.visual.clone();
    visual_cfg.hero_motif = motif;
    visual_cfg.signature_title = sig_title.into();
    visual_cfg.signature_description = format!("'{idea}'에 맞춰 자동 선택된 시각화 유형");
    if !visual_cfg.charts.contains(&ChartId::GoalTimeline) {
        visual_cfg.charts.push(ChartId::GoalTimeline);
    }
    notes.push(GenerationNote { item: "시각화", mode: "generated", detail: format!("우세 차원 기반 '{sig_title}' 선택, 공통 차트 컴포넌트 재사용") });

    // ── 콘텐츠 ──
    let tagline = {
        let t = first_sentence(&input.description, 150);
        if t.is_empty() { format!("{idea}을(를) 위한 재무설계 워크스페이스") } else { t }
    };
    let mut content = base.content.clone();
    content.hero_title = truncate(&idea, 120);
    content.hero_subtitle = truncate(&tagline, 300);
    content.intro = truncate(&format!("{idea}은(는) {} 문제를 재무설계 6단계로 분석합니다. 이 소개문은 아이디어 입력에서 자동 구성된 초안이므로 제출 전 사람이 확인해야 합니다.", truncate(&analysis.problem_definition, 200)), 1200);
    content.problem_statement = truncate(&analysis.problem_definition, 1200);
    let mut questions: Vec<String> = analysis.key_risks.iter().take(3).map(|r| truncate(&format!("'{r}'이(가) 현실화되면 현금은 몇 개월 버틸 수 있는가?"), 200)).collect();
    questions.extend(client.goals.iter().take(2).map(|g| truncate(&format!("'{}' 목표는 언제 달성 가능한가?", g.name), 200)));
    questions.push("어떤 조정이 목표 달성 시점을 가장 크게 앞당기는가?".into());
    content.analysis_questions = questions;
    content.stage_descriptions = analysis.stage_mapping.iter().map(|s| truncate(&format!("{} — {}", s.stage_name, s.feature), 200)).collect();
    content.report_title = truncate(&format!("{idea} — 재무설계 보고서"), 120);
    content.insights_heading = truncate(&format!("{idea} 분석 인사이트"), 60);
    let mut actions = base.content.action_templates.clone();
    for (i, g) in client.goals.iter().take(2).enumerate() {
        actions.push(crate::domain::topics::ActionTemplate {
            id: format!("act_gen_goal_{}", i + 1),
            title: truncate(&format!("'{}' 목표 자동이체 설정", g.name), 80),
            priority: g.priority,
            due_month: 1,
            amount: g.target_amount / i64::from(g.target_month.max(1)),
            review_condition: "소득·지출 변동 시".into(),
        });
    }
    content.action_templates = actions;
    content.disclaimer = "이 주제는 Adaptive Idea Engine이 규칙 기반으로 자동 구성한 초안입니다. 합성 데이터이며, 확인되지 않은 제도·통계는 포함하지 않았습니다. 제출 전 사람이 콘텐츠를 검토하세요.".into();
    notes.push(GenerationNote { item: "콘텐츠", mode: "generated", detail: "히어로·소개·분석 질문·6단계 설명·보고서 제목 자동 구성".into() });

    let mut agents: Vec<AgentBinding> = base.agents.clone();
    agents.push(AgentBinding { agent: AgentId::IdeaConfigurator, focus: truncate(&format!("'{idea}' 구성의 콘텐츠·데이터 일관성 점검"), 300) });

    let mut checklist = base.verification_checklist.clone();
    checklist.push("자동 생성된 콘텐츠의 사실 관계를 사람이 확인했는가?".into());
    checklist.push("합성 고객 수치가 아이디어의 문제 상황과 모순되지 않는가?".into());

    let requires_development: Vec<String> = analysis
        .capabilities
        .iter()
        .filter(|c| c.status == "requires_development")
        .map(|c| c.capability.clone())
        .collect();
    for r in &requires_development {
        notes.push(GenerationNote { item: "미지원 기능", mode: "requires_development", detail: r.clone() });
    }

    let config = TopicConfig {
        id: topic_id,
        name: idea.clone(),
        service_name: truncate(&format!("FINOVA · {idea}"), 60),
        tagline: truncate(&tagline, 160),
        problem: truncate(&analysis.problem_definition, 600),
        target_customer: truncate(&analysis.customer_type, 200),
        primary_client_id: client_id,
        signature_visual: visual,
        accent,
        icon,
        modules,
        agents,
        requires_development,
        input_schema: base.input_schema.clone(),
        canvas,
        scenario_presets: presets,
        visual: visual_cfg,
        content,
        rules: base.rules.clone(),
        verification_checklist: checklist,
        ai_draft_claims: vec![
            DraftClaim { id: "c_gen_surplus".into(), statement: "합성 고객의 월 순현금흐름은 흑자이다(검증 연습용 주장).".into(), metric: Some("monthly_surplus".into()), claimed_value: Some(client.monthly_income - client.essential_expenses() - client.household_debt_payment()), scenario_preset: None, rationale: "소득 − 필수지출 − 부채상환으로 산출한 주장값".into() },
            DraftClaim { id: "c_gen_qual".into(), statement: truncate(&format!("'{idea}' 서비스는 고객의 재무 위험을 크게 줄일 것이다."), 300), metric: None, claimed_value: None, scenario_preset: None, rationale: "정성적 주장 — 근거 필요".into() },
        ],
    };
    Generated { config, client, notes }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_amounts_and_age() {
        assert_eq!(amount_after("월 소득 300만원, 생활비 150만 원", &["월 소득"]), Some(3_000_000));
        assert_eq!(amount_after("월 소득 300만원, 생활비 150만 원", &["생활비"]), Some(1_500_000));
        assert_eq!(amount_after("부채 2억 있음", &["부채"]), Some(200_000_000));
        assert_eq!(amount_after("현금 1,500,000원", &["현금"]), Some(1_500_000));
        assert_eq!(amount_after("현금은 많음", &["현금"]), None);
        // 문장 경계를 넘어 다른 항목의 금액을 가져오지 않는다
        assert_eq!(amount_after("대출 상환 부담이 큼. 월 소득 290만원", &["대출"]), None);
        assert_eq!(split_list(&Some("비상자금 1,000만원, 장비 300만원".into())), vec!["비상자금 1000만원", "장비 300만원"]);
        assert_eq!(age_in("32세 프리랜서"), Some(32));
        assert_eq!(age_in("3살 아이를 둔 35세 부모"), Some(35));
    }

    #[test]
    fn classifies_business_idea() {
        let input = IdeaInput { idea_name: "자영업 매출 위기 대응".into(), description: "소상공인의 사업 매출이 감소하면 가계로 위험이 전파되는 문제".into(), ..Default::default() };
        let a = analyze(&input);
        assert_eq!(a.base_archetype, "household_business");
        assert_eq!(a.recommended_visual, SignatureVisual::ContagionMap);
    }

    #[test]
    fn flags_unsupported_tax() {
        let input = IdeaInput { idea_name: "청년 절세 플래너".into(), description: "연말정산과 세금 최적화".into(), ..Default::default() };
        let a = analyze(&input);
        assert!(a.capabilities.iter().any(|c| c.status == "requires_development"));
        assert_eq!(a.confidence, "low");
    }
}
