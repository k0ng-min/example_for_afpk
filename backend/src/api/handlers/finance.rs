//! 계산·분석·검증 API. 프론트엔드는 저장 전 편집값(client 인라인)으로도 즉시 계산할 수 있다.

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api::handlers::clients::load_client;
use crate::api::middleware::AppJson;
use crate::domain::clients::Client;
use crate::domain::scenarios::{Scenario, ScenarioAdjustments};
use crate::domain::topics::TopicConfig;
use crate::errors::{AppError, AppResult};
use crate::finance::comparison::{compare, Comparison};
use crate::finance::metrics::{compute_metrics, Metric};
use crate::finance::projections::{project, Projection};
use crate::finance::validation::{validate_adjustments, validate_client, FieldError};
use crate::repositories::{self as repo, DocTable};
use crate::services::analysis::{copilot_answer, evaluate_rules, CopilotAnswer, Insight};
use crate::services::state::AppState;
use crate::services::topics;
use crate::services::verification::{verify_claim, ClaimInput, ClaimResult, ReviewRecord, VerificationStatus, DECISIONS};

async fn resolve_client(s: &AppState, client_id: Option<&str>, inline: Option<Client>) -> AppResult<Client> {
    match (inline, client_id) {
        (Some(c), _) => {
            let errors = validate_client(&c);
            if !errors.is_empty() {
                return Err(AppError::Validation(errors));
            }
            Ok(c)
        }
        (None, Some(id)) => load_client(s, id).await,
        (None, None) => Err(AppError::Validation(vec![FieldError { field: "clientId".into(), message: "clientId 또는 client 가 필요합니다".into() }])),
    }
}

fn check_adj(a: &ScenarioAdjustments) -> AppResult<()> {
    let e = validate_adjustments(a);
    if e.is_empty() { Ok(()) } else { Err(AppError::Validation(e)) }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalcRequest {
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub client: Option<Client>,
    #[serde(default)]
    pub adjustments: ScenarioAdjustments,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcResponse {
    pub projection: Projection,
    pub metrics: Vec<Metric>,
}

pub async fn calculate(State(s): State<AppState>, AppJson(b): AppJson<CalcRequest>) -> AppResult<Json<CalcResponse>> {
    let client = resolve_client(&s, b.client_id.as_deref(), b.client).await?;
    check_adj(&b.adjustments)?;
    let projection = project(&client, &b.adjustments);
    let metrics = compute_metrics(&client, &projection);
    Ok(Json(CalcResponse { projection, metrics }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompareRequest {
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub client: Option<Client>,
    pub scenarios: Vec<Scenario>,
}

pub async fn compare_handler(State(s): State<AppState>, AppJson(b): AppJson<CompareRequest>) -> AppResult<Json<Comparison>> {
    let client = resolve_client(&s, b.client_id.as_deref(), b.client).await?;
    if b.scenarios.is_empty() || b.scenarios.len() > 8 {
        return Err(AppError::Validation(vec![FieldError { field: "scenarios".into(), message: "비교 시나리오는 1~8개입니다".into() }]));
    }
    for sc in &b.scenarios {
        check_adj(&sc.adjustments)?;
    }
    Ok(Json(compare(&client, &b.scenarios)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRequest {
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub client: Option<Client>,
    #[serde(default)]
    pub adjustments: Option<ScenarioAdjustments>,
    #[serde(default)]
    pub question: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResponse {
    pub ai_mode: &'static str,
    pub ai_note: &'static str,
    pub topic_id: String,
    pub metrics: Vec<Metric>,
    pub insights: Vec<Insight>,
    pub projection: Projection,
    pub answer: Option<CopilotAnswer>,
    pub agents: Vec<Value>,
}

pub async fn analysis(State(s): State<AppState>, AppJson(b): AppJson<AnalysisRequest>) -> AppResult<Json<AnalysisResponse>> {
    let client = resolve_client(&s, b.client_id.as_deref(), b.client).await?;
    let adj = b.adjustments.unwrap_or_default();
    check_adj(&adj)?;
    if let Some(q) = &b.question {
        if q.trim().is_empty() || q.chars().count() > 500 {
            return Err(AppError::Validation(vec![FieldError { field: "question".into(), message: "질문은 1~500자입니다".into() }]));
        }
    }
    let (_, topic) = topics::active(&s).await?;
    let projection = project(&client, &adj);
    let metrics = compute_metrics(&client, &projection);
    let insights = evaluate_rules(&topics::effective_rules(&s, &topic), &metrics);
    let answer = match b.question.as_deref() {
        Some(q) => {
            let rule = copilot_answer(q, &metrics, &projection, &insights);
            Some(crate::services::copilot::answer(&s, q, &client, &metrics, &projection, &insights, rule).await)
        }
        None => None,
    };
    let agents = topic.agents.iter().map(|a| json!({ "agent": a.agent, "focus": a.focus, "runtime": "rule_engine" })).collect();
    Ok(Json(AnalysisResponse {
        ai_mode: s.ai.status.mode,
        ai_note: s.ai.status.note,
        topic_id: topic.id,
        metrics,
        insights,
        projection,
        answer,
        agents,
    }))
}

// ── 검증 ──

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerificationRequest {
    pub client_id: String,
    #[serde(default)]
    pub client: Option<Client>,
    /// 생략 시 활성 주제의 AI 초안 주장을 검증
    #[serde(default)]
    pub claims: Option<Vec<ClaimInput>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedClaim {
    #[serde(flatten)]
    pub result: ClaimResult,
    /// 계산 결과 + 인간 검토 기록을 반영한 최종 표시 상태
    pub display_status: VerificationStatus,
    pub review: Option<ReviewRecord>,
    pub corrected_check: Option<ClaimResult>,
}

fn metrics_for(client: &Client, topic: &TopicConfig, preset: Option<&str>) -> (Vec<Metric>, String) {
    let p = preset.and_then(|id| topic.scenario_presets.iter().find(|p| p.id == id));
    let adj = p.map(|p| p.adjustments.clone()).unwrap_or_default();
    let name = p.map(|p| p.name.clone()).unwrap_or_else(|| "현재 상태(조정 없음)".into());
    let projection = project(client, &adj);
    (compute_metrics(client, &projection), name)
}

fn validate_claims(claims: &[ClaimInput]) -> AppResult<()> {
    let mut e = vec![];
    if claims.len() > 30 {
        e.push(FieldError { field: "claims".into(), message: "주장은 최대 30개입니다".into() });
    }
    for (i, c) in claims.iter().enumerate() {
        if !crate::finance::validation::is_safe_id(&c.id) {
            e.push(FieldError { field: format!("claims[{i}].id"), message: "id 형식 오류".into() });
        }
        if c.statement.trim().is_empty() || c.statement.chars().count() > 300 {
            e.push(FieldError { field: format!("claims[{i}].statement"), message: "주장은 1~300자입니다".into() });
        }
        if !["ai_draft", "user", "rule_engine"].contains(&c.source.as_str()) {
            e.push(FieldError { field: format!("claims[{i}].source"), message: "source 값 오류".into() });
        }
    }
    if e.is_empty() { Ok(()) } else { Err(AppError::Validation(e)) }
}

pub async fn verification(State(s): State<AppState>, AppJson(b): AppJson<VerificationRequest>) -> AppResult<Json<Value>> {
    let client = resolve_client(&s, Some(&b.client_id), b.client).await?;
    let (_, topic) = topics::active(&s).await?;
    let claims: Vec<ClaimInput> = match b.claims {
        Some(c) => c,
        None => topic
            .ai_draft_claims
            .iter()
            .map(|c| ClaimInput { id: c.id.clone(), statement: c.statement.clone(), metric: c.metric.clone(), claimed_value: c.claimed_value, scenario_preset: c.scenario_preset.clone(), source: "ai_draft".into() })
            .collect(),
    };
    validate_claims(&claims)?;
    let reviews: Vec<ReviewRecord> = repo::get_doc(&s.db, DocTable::ReviewRecords, &b.client_id).await?.unwrap_or_default();
    let results: Vec<VerifiedClaim> = claims
        .iter()
        .map(|c| {
            let (metrics, scenario_name) = metrics_for(&client, &topic, c.scenario_preset.as_deref());
            let result = verify_claim(c, &metrics, &scenario_name);
            let review = reviews.iter().find(|r| r.claim_id == c.id).cloned();
            let mut display_status = result.status;
            let mut corrected_check = None;
            if let Some(r) = review.as_ref().filter(|r| r.decision == "corrected") {
                // 수정값을 다시 검증해 통과할 때만 '수정 완료'
                let corrected = ClaimInput { claimed_value: r.corrected_value, statement: if r.corrected_statement.is_empty() { c.statement.clone() } else { r.corrected_statement.clone() }, ..c.clone() };
                let check = verify_claim(&corrected, &metrics, &scenario_name);
                if check.status == VerificationStatus::Verified || (c.metric.is_none() && !r.note.trim().is_empty()) {
                    display_status = VerificationStatus::Corrected;
                }
                corrected_check = Some(check);
            }
            VerifiedClaim { result, display_status, review, corrected_check }
        })
        .collect();
    let summary = |st: VerificationStatus| results.iter().filter(|r| r.display_status == st).count();
    Ok(Json(json!({
        "topicId": topic.id,
        "checklist": topic.verification_checklist,
        "results": results,
        "summary": {
            "verified": summary(VerificationStatus::Verified),
            "needsReview": summary(VerificationStatus::NeedsReview),
            "insufficientEvidence": summary(VerificationStatus::InsufficientEvidence),
            "errorFound": summary(VerificationStatus::ErrorFound),
            "corrected": summary(VerificationStatus::Corrected),
        }
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewUpdate {
    pub statement: String,
    pub decision: String,
    #[serde(default)]
    pub corrected_value: Option<i64>,
    #[serde(default)]
    pub corrected_statement: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub reviewer: String,
}

pub async fn get_reviews(State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Vec<ReviewRecord>>> {
    load_client(&s, &id).await?;
    Ok(Json(repo::get_doc(&s.db, DocTable::ReviewRecords, &id).await?.unwrap_or_default()))
}

pub async fn put_review(State(s): State<AppState>, Path((id, claim_id)): Path<(String, String)>, AppJson(b): AppJson<ReviewUpdate>) -> AppResult<Json<ReviewRecord>> {
    load_client(&s, &id).await?;
    let mut e = vec![];
    if !crate::finance::validation::is_safe_id(&claim_id) {
        e.push(FieldError { field: "claimId".into(), message: "id 형식 오류".into() });
    }
    if !DECISIONS.contains(&b.decision.as_str()) {
        e.push(FieldError { field: "decision".into(), message: "decision 값 오류".into() });
    }
    if b.decision == "corrected" && b.corrected_value.is_none() && b.note.trim().is_empty() {
        e.push(FieldError { field: "correctedValue".into(), message: "수정 완료는 수정값 또는 수정 근거 메모가 필요합니다".into() });
    }
    for (f, v, max) in [("statement", &b.statement, 300), ("correctedStatement", &b.corrected_statement, 300), ("note", &b.note, 1000), ("reviewer", &b.reviewer, 40)] {
        if v.chars().count() > max {
            e.push(FieldError { field: f.into(), message: format!("{max}자 이하입니다") });
        }
    }
    if !e.is_empty() {
        return Err(AppError::Validation(e));
    }
    let mut reviews: Vec<ReviewRecord> = repo::get_doc(&s.db, DocTable::ReviewRecords, &id).await?.unwrap_or_default();
    let record = ReviewRecord {
        claim_id: claim_id.clone(),
        statement: b.statement,
        decision: b.decision,
        corrected_value: b.corrected_value,
        corrected_statement: b.corrected_statement,
        note: b.note,
        reviewer: b.reviewer,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    reviews.retain(|r| r.claim_id != claim_id);
    reviews.push(record.clone());
    repo::put_doc(&s.db, DocTable::ReviewRecords, &id, &reviews).await?;
    Ok(Json(record))
}
