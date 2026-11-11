//! 최종 아이디어(CPA 유예생 소득 공백) API.
//! - 계산: Rust 엔진(`finance::cpa_gap`)만 사용. 프론트엔드는 결과를 표시만 한다.
//! - AI 실험(E1~E6): 서버에서만 Gemini 를 호출하고, 원출력·모델·시각을 그대로 돌려준다.
//!   키가 없으면 503 으로 "실행하지 않음"을 알린다(가짜 출력 생성 금지).

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::api::middleware::AppJson;
use crate::errors::{AppError, AppResult};
use crate::finance::cpa_gap::analysis::{analyze as run_analysis, Analysis};
use crate::finance::cpa_gap::advisor::{self, RuleAnswer};
use crate::finance::cpa_gap::icl::{obligation, IclRequest, IclResult};
use crate::finance::cpa_gap::explore::{checkin as run_checkin, explore as run_explore, validate_checkin, Checkin, CheckinRequest, Explore};
use crate::finance::cpa_gap::{validate, CpaInputs};
use crate::integrations::ai::gemini::check_numbers;
use crate::finance::validation::FieldError;
use crate::services::state::AppState;

pub async fn defaults() -> Json<CpaInputs> {
    Json(CpaInputs::default())
}

pub async fn analyze(AppJson(i): AppJson<CpaInputs>) -> AppResult<Json<Analysis>> {
    let e = validate(&i);
    if !e.is_empty() {
        return Err(AppError::Validation(e));
    }
    Ok(Json(run_analysis(&i)))
}

/// 민감도(무엇이 결과를 가장 크게 바꾸는가)와 공적 지원·대출 비교. 입력은 analyze 와 같다
pub async fn explore(AppJson(i): AppJson<CpaInputs>) -> AppResult<Json<Explore>> {
    let e = validate(&i);
    if !e.is_empty() {
        return Err(AppError::Validation(e));
    }
    Ok(Json(run_explore(&i)))
}

/// 월별 점검: 실제 월말 잔액을 계획과 비교하고 그 잔액에서 다시 계산
pub async fn checkin(AppJson(r): AppJson<CheckinRequest>) -> AppResult<Json<Checkin>> {
    let e = validate_checkin(&r);
    if !e.is_empty() {
        return Err(AppError::Validation(e));
    }
    Ok(Json(run_checkin(&r)))
}

#[derive(Deserialize)]
struct Flag {
    #[serde(rename = "allOf", default)]
    all_of: Vec<String>,
    #[serde(rename = "anyOf", default)]
    any_of: Vec<String>,
    message: String,
}

fn load_experiments(s: &AppState) -> AppResult<Value> {
    let path = s.cfg.ai_dir.join("prompts").join("verification").join("cpa_experiments.json");
    let text = std::fs::read_to_string(&path).map_err(|e| AppError::Internal(format!("{}: {e}", path.display())))?;
    Ok(serde_json::from_str(&text)?)
}

pub async fn experiments(State(s): State<AppState>) -> AppResult<Json<Value>> {
    let mut v = load_experiments(&s)?;
    // 실제 호출 가능 여부를 함께 알린다(키 값은 절대 포함하지 않음)
    v["ai"] = serde_json::json!({
        "configured": s.ai.gemini.is_some(),
        "model": s.ai.gemini.as_ref().map(|g| g.model.clone()),
    });
    Ok(Json(v))
}

fn find_experiment(all: &Value, id: &str) -> AppResult<Value> {
    all["experiments"]
        .as_array()
        .and_then(|a| a.iter().find(|e| e["id"] == id))
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("실험 {id}")))
}

/// 규칙 기반 힌트: 판정이 아니라 사람이 먼저 읽어 볼 문장 후보
fn screen_text(exp: &Value, output: &str) -> Vec<String> {
    let flags: Vec<Flag> = serde_json::from_value(exp["flags"].clone()).unwrap_or_default();
    flags
        .into_iter()
        .filter(|f| f.all_of.iter().all(|t| output.contains(t.as_str())) && (f.any_of.is_empty() || f.any_of.iter().any(|t| output.contains(t.as_str()))))
        .map(|f| f.message)
        .collect()
}

const MAX_PROMPT: usize = 6000;
const MAX_OUTPUT: usize = 60_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunRequest {
    pub experiment_id: String,
    /// 비우면 실험 정의의 기본 프롬프트
    #[serde(default)]
    pub prompt: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResponse {
    pub experiment_id: String,
    pub provider: &'static str,
    pub model: String,
    pub ran_at: String,
    pub system_prompt: String,
    pub prompt: String,
    pub output: String,
    pub flags: Vec<String>,
}

fn id_ok(id: &str) -> bool {
    id.len() <= 8 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

pub async fn run_ai(State(s): State<AppState>, AppJson(b): AppJson<RunRequest>) -> AppResult<Json<RunResponse>> {
    if !id_ok(&b.experiment_id) {
        return Err(AppError::Validation(vec![FieldError { field: "experimentId".into(), message: "형식이 올바르지 않습니다".into() }]));
    }
    let all = load_experiments(&s)?;
    let exp = find_experiment(&all, &b.experiment_id)?;
    let brief = all["clientBrief"].as_str().unwrap_or_default();
    let system = all["systemPrompt"].as_str().unwrap_or_default().to_string();
    let prompt = match b.prompt.map(|p| p.trim().to_string()).filter(|p| !p.is_empty()) {
        Some(p) => p,
        None => exp["prompt"].as_str().unwrap_or_default().to_string(),
    }
    .replace("{{clientBrief}}", brief);
    if prompt.chars().count() > MAX_PROMPT {
        return Err(AppError::Validation(vec![FieldError { field: "prompt".into(), message: format!("{MAX_PROMPT}자 이하여야 합니다") }]));
    }
    let Some(g) = s.ai.gemini.as_ref() else {
        return Err(AppError::Unavailable("서버에 AI API 키(GEMINI_API_KEY)가 설정되지 않아 실행하지 않았습니다. 다른 AI 도구의 원출력을 붙여 넣어 기록할 수 있습니다.".into()));
    };
    let (output, model) = g.generate(&system, &prompt).await.map_err(AppError::Upstream)?;
    let flags = screen_text(&exp, &output);
    tracing::info!(experiment = %b.experiment_id, model = %model, "AI 실험 실행");
    Ok(Json(RunResponse { experiment_id: b.experiment_id, provider: "gemini", model, ran_at: chrono::Utc::now().to_rfc3339(), system_prompt: system, prompt, output, flags }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScreenRequest {
    pub experiment_id: String,
    pub output: String,
}

pub async fn screen(State(s): State<AppState>, AppJson(b): AppJson<ScreenRequest>) -> AppResult<Json<Value>> {
    if !id_ok(&b.experiment_id) || b.output.len() > MAX_OUTPUT {
        return Err(AppError::Validation(vec![FieldError { field: "output".into(), message: "실험 ID 또는 출력 길이가 올바르지 않습니다".into() }]));
    }
    let all = load_experiments(&s)?;
    let exp = find_experiment(&all, &b.experiment_id)?;
    Ok(Json(serde_json::json!({ "flags": screen_text(&exp, &b.output) })))
}

// ───────────── AI 상담 ─────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AskRequest {
    #[serde(default)]
    pub question_id: Option<String>,
    #[serde(default)]
    pub question: Option<String>,
    #[serde(default)]
    pub inputs: Option<CpaInputs>,
    /// true 면 서버 LLM 이 규칙 답변을 바탕으로 문장을 다시 쓴다(숫자는 엔진 값과 대조)
    #[serde(default)]
    pub use_ai: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiText {
    pub model: String,
    pub ran_at: String,
    pub text: String,
    pub checked_numbers: usize,
    pub unverified_numbers: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AskResponse {
    /// rule | ai | unsupported
    pub mode: &'static str,
    pub rule: Option<RuleAnswer>,
    pub ai: Option<AiText>,
    pub ai_error: Option<String>,
    pub ai_configured: bool,
    pub suggestions: Vec<(String, String)>,
}

const ASK_SYSTEM: &str = "당신은 한국 재무설계사를 돕는 AI 보조자입니다. 가상 고객(합성 데이터) 김유예의 소득 공백 재무설계에 대해 답합니다. 제공된 '계산 사실'에 있는 숫자만 사용하고 새 숫자를 만들지 마세요. 합격 가능성을 예측하거나 학습 방법을 조언하지 마세요. 확정적 표현 대신 조건부로 쓰고, 한국어로 4~6문장 이내의 최종 답변만 쓰세요.";

fn fact_sheet(r: &[RuleAnswer]) -> String {
    r.iter()
        .map(|a| format!("[{}]
{}
{}", a.question, a.answer, a.facts.iter().map(|f| format!("- {}: {}", f.label, f.value)).collect::<Vec<_>>().join("
")))
        .collect::<Vec<_>>()
        .join("

")
}

pub async fn ask(State(s): State<AppState>, AppJson(b): AppJson<AskRequest>) -> AppResult<Json<AskResponse>> {
    let inputs = b.inputs.unwrap_or_default();
    let e = validate(&inputs);
    if !e.is_empty() {
        return Err(AppError::Validation(e));
    }
    let q_text = b.question.as_deref().map(str::trim).unwrap_or("");
    if q_text.chars().count() > 500 {
        return Err(AppError::Validation(vec![FieldError { field: "question".into(), message: "500자 이하".into() }]));
    }
    let a = run_analysis(&inputs);
    let cut = CpaInputs { support_stop_from: inputs.support_reduce_from, ..inputs.clone() };
    let what_if = run_analysis(&cut);
    let suggestions: Vec<(String, String)> = advisor::QUESTIONS.iter().map(|(k, q)| (k.to_string(), q.to_string())).collect();
    let configured = s.ai.gemini.is_some();

    let rule = match b.question_id.as_deref() {
        Some(id) => Some(advisor::answer(id, &a, Some(&what_if)).ok_or_else(|| AppError::NotFound(format!("질문 {id}")))?),
        None if q_text.is_empty() => return Err(AppError::Validation(vec![FieldError { field: "question".into(), message: "질문을 입력하세요".into() }])),
        None if advisor::out_of_scope(q_text) => Some(advisor::scope_answer(q_text)),
        None => None,
    };
    if rule.as_ref().is_some_and(|r| r.out_of_scope) {
        return Ok(Json(AskResponse { mode: "rule", rule, ai: None, ai_error: None, ai_configured: configured, suggestions }));
    }
    let want_ai = b.use_ai || rule.is_none();
    if !want_ai {
        return Ok(Json(AskResponse { mode: "rule", rule, ai: None, ai_error: None, ai_configured: configured, suggestions }));
    }
    let Some(g) = s.ai.gemini.as_ref() else {
        let mode = if rule.is_some() { "rule" } else { "unsupported" };
        return Ok(Json(AskResponse { mode, rule, ai: None, ai_error: Some("서버에 AI 키가 없어 생성형 AI를 호출하지 않았습니다.".into()), ai_configured: false, suggestions }));
    };
    let facts: Vec<RuleAnswer> = match &rule {
        Some(r) => vec![r.clone()],
        None => advisor::QUESTIONS.iter().filter_map(|(k, _)| advisor::answer(k, &a, Some(&what_if))).collect(),
    };
    let question = rule.as_ref().map(|r| r.question.clone()).unwrap_or_else(|| q_text.to_string());
    let user = format!("질문: {question}

계산 사실(Rust 엔진):
{}", fact_sheet(&facts));
    match g.generate(ASK_SYSTEM, &user).await {
        Ok((text, model)) => {
            let won = advisor::allowed_won(&a);
            let bps = vec![inputs.p_pct as i64 * 100, inputs.q_pct as i64 * 100, 6100];
            let (n, bad) = check_numbers(&text, &won, &bps);
            Ok(Json(AskResponse { mode: "ai", rule, ai: Some(AiText { model, ran_at: chrono::Utc::now().to_rfc3339(), text, checked_numbers: n, unverified_numbers: bad }), ai_error: None, ai_configured: true, suggestions }))
        }
        Err(e) => {
            let mode = if rule.is_some() { "rule" } else { "unsupported" };
            Ok(Json(AskResponse { mode, rule, ai: None, ai_error: Some(e), ai_configured: true, suggestions }))
        }
    }
}

pub async fn icl(AppJson(r): AppJson<IclRequest>) -> AppResult<Json<IclResult>> {
    if !(0..=10_000_000_000).contains(&r.gross_annual) || !(2000..=2100).contains(&r.income_year) || !(r.rate_bps == 2000 || r.rate_bps == 2500) {
        return Err(AppError::Validation(vec![FieldError { field: "grossAnnual".into(), message: "총급여 0~100억, 귀속연도 2000~2100, 상환율 20% 또는 25%".into() }]));
    }
    Ok(Json(obligation(&r)))
}

/// 개발 중 실제로 실행한 AI 실험 기록(서버 파일, 편집 없는 원출력). 없으면 빈 목록
pub async fn runs(State(s): State<AppState>) -> AppResult<Json<Value>> {
    let path = s.cfg.ai_dir.join("evaluations").join("cpa_experiment_runs.json");
    match std::fs::read_to_string(&path) {
        Ok(t) => Ok(Json(serde_json::from_str(&t)?)),
        Err(_) => Ok(Json(serde_json::json!({ "runs": [] }))),
    }
}
