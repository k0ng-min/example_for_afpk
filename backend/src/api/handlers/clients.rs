use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api::middleware::AppJson;
use crate::domain::clients::Client;
use crate::domain::goals::Goal;
use crate::domain::scenarios::{Scenario, ScenarioAdjustments};
use crate::errors::{AppError, AppResult};
use crate::finance::validation::{is_safe_id, validate_client, FieldError};
use crate::repositories::{self as repo, DocTable};
use crate::services::state::{seed_client_data, AppState};
use crate::services::topics;

pub async fn health(State(s): State<AppState>) -> AppResult<Json<Value>> {
    let (row, cfg) = topics::active(&s).await?;
    Ok(Json(json!({
        "status": "ok",
        "service": "finova-backend",
        "version": env!("CARGO_PKG_VERSION"),
        "activeTopic": { "versionId": row.id, "topicId": cfg.id, "name": cfg.name },
        "ai": s.ai.status,
        "adminEnabled": s.cfg.admin_token.is_some(),
        "devAdminHint": matches!(s.cfg.env, crate::config::Env::Development) && std::env::var("ADMIN_TOKEN").map(|v| v.is_empty()).unwrap_or(true),
    })))
}

fn check_id(id: &str) -> AppResult<()> {
    if is_safe_id(id) {
        Ok(())
    } else {
        Err(AppError::Validation(vec![FieldError { field: "id".into(), message: "id 형식이 올바르지 않습니다".into() }]))
    }
}

pub async fn list(State(s): State<AppState>) -> AppResult<Json<Vec<Client>>> {
    Ok(Json(repo::list_clients(&s.db).await?))
}

pub async fn get(State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Client>> {
    check_id(&id)?;
    repo::get_client(&s.db, &id).await?.map(Json).ok_or_else(|| AppError::NotFound("고객".into()))
}

pub async fn load_client(s: &AppState, id: &str) -> AppResult<Client> {
    check_id(id)?;
    repo::get_client(&s.db, id).await?.ok_or_else(|| AppError::NotFound("고객".into()))
}

pub async fn put(State(s): State<AppState>, Path(id): Path<String>, AppJson(c): AppJson<Client>) -> AppResult<Json<Client>> {
    check_id(&id)?;
    if c.id != id {
        return Err(AppError::Validation(vec![FieldError { field: "id".into(), message: "경로와 본문의 고객 id가 다릅니다".into() }]));
    }
    repo::get_client(&s.db, &id).await?.ok_or_else(|| AppError::NotFound("고객".into()))?;
    let errors = validate_client(&c);
    if !errors.is_empty() {
        return Err(AppError::Validation(errors));
    }
    repo::upsert_client(&s.db, &c).await?;
    Ok(Json(c))
}

pub async fn reset(State(s): State<AppState>) -> AppResult<Json<Value>> {
    repo::reset_client_data(&s.db).await?;
    seed_client_data(&s).await?;
    Ok(Json(json!({ "ok": true, "clients": repo::count_clients(&s.db).await? })))
}

pub async fn goal_templates(State(s): State<AppState>) -> Json<Vec<Goal>> {
    Json(s.seeds.goal_templates.clone())
}

// ── 시나리오 CRUD ──

pub async fn list_scenarios(State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Vec<Scenario>>> {
    load_client(&s, &id).await?;
    let mut list = repo::list_scenarios(&s.db, &id).await?;
    if list.is_empty() {
        // 시나리오가 없는 고객(생성 주제 고객 등)은 활성 주제 프리셋으로 초기 시나리오 구성
        let (_, cfg) = topics::active(&s).await?;
        for (i, p) in cfg.scenario_presets.iter().enumerate() {
            let sc = Scenario {
                id: format!("scn_{}", uuid::Uuid::new_v4().simple()),
                client_id: id.clone(),
                name: p.name.clone(),
                description: p.description.clone(),
                is_baseline: i == 0,
                color: p.color.clone(),
                adjustments: p.adjustments.clone(),
            };
            repo::upsert_scenario(&s.db, &sc).await?;
            list.push(sc);
        }
    }
    Ok(Json(list))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioCreate {
    pub client_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub is_baseline: bool,
    #[serde(default)]
    pub adjustments: ScenarioAdjustments,
}

fn validate_scenario(sc: &Scenario) -> AppResult<()> {
    let mut errors = crate::finance::validation::validate_adjustments(&sc.adjustments);
    if sc.name.trim().is_empty() || sc.name.chars().count() > 60 {
        errors.push(FieldError { field: "name".into(), message: "시나리오 이름은 1~60자입니다".into() });
    }
    if sc.description.chars().count() > 300 {
        errors.push(FieldError { field: "description".into(), message: "설명은 300자 이하입니다".into() });
    }
    if !sc.color.is_empty() && !(sc.color.len() == 7 && sc.color.starts_with('#') && sc.color[1..].chars().all(|c| c.is_ascii_hexdigit())) {
        errors.push(FieldError { field: "color".into(), message: "색상은 #RRGGBB 형식입니다".into() });
    }
    if errors.is_empty() { Ok(()) } else { Err(AppError::Validation(errors)) }
}

pub async fn create_scenario(State(s): State<AppState>, AppJson(b): AppJson<ScenarioCreate>) -> AppResult<Json<Scenario>> {
    load_client(&s, &b.client_id).await?;
    let sc = Scenario {
        id: format!("scn_{}", uuid::Uuid::new_v4().simple()),
        client_id: b.client_id,
        name: b.name,
        description: b.description,
        is_baseline: b.is_baseline,
        color: b.color,
        adjustments: b.adjustments,
    };
    validate_scenario(&sc)?;
    repo::upsert_scenario(&s.db, &sc).await?;
    Ok(Json(sc))
}

pub async fn update_scenario(State(s): State<AppState>, Path(id): Path<String>, AppJson(sc): AppJson<Scenario>) -> AppResult<Json<Scenario>> {
    check_id(&id)?;
    let existing = repo::get_scenario(&s.db, &id).await?.ok_or_else(|| AppError::NotFound("시나리오".into()))?;
    if sc.id != id || sc.client_id != existing.client_id {
        return Err(AppError::Validation(vec![FieldError { field: "id".into(), message: "시나리오 id 또는 고객 id를 변경할 수 없습니다".into() }]));
    }
    validate_scenario(&sc)?;
    repo::upsert_scenario(&s.db, &sc).await?;
    Ok(Json(sc))
}

pub async fn delete_scenario(State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Value>> {
    check_id(&id)?;
    if !repo::delete_scenario(&s.db, &id).await? {
        return Err(AppError::NotFound("시나리오".into()));
    }
    Ok(Json(json!({ "ok": true })))
}

/// 복제: 깊은 복사 후 새 id. 원본과 독립적으로 수정된다.
pub async fn duplicate_scenario(State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Scenario>> {
    check_id(&id)?;
    let mut sc = repo::get_scenario(&s.db, &id).await?.ok_or_else(|| AppError::NotFound("시나리오".into()))?;
    sc.id = format!("scn_{}", uuid::Uuid::new_v4().simple());
    sc.name = format!("{} (복제)", sc.name).chars().take(60).collect();
    sc.is_baseline = false;
    repo::upsert_scenario(&s.db, &sc).await?;
    Ok(Json(sc))
}

// ── 실행계획 ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionItem {
    pub id: String,
    pub title: String,
    pub priority: u8,
    pub target_date: String,
    pub amount: i64,
    /// todo | in_progress | done | blocked
    pub status: String,
    #[serde(default)]
    pub review_condition: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub template_id: Option<String>,
}

const ACTION_STATUSES: &[&str] = &["todo", "in_progress", "done", "blocked"];

fn validate_actions(items: &[ActionItem]) -> Vec<FieldError> {
    let mut e = vec![];
    if items.len() > 50 {
        e.push(FieldError { field: "actions".into(), message: "실행 항목은 최대 50개입니다".into() });
    }
    for (i, a) in items.iter().enumerate() {
        let f = |k: &str| format!("actions[{i}].{k}");
        if !is_safe_id(&a.id) {
            e.push(FieldError { field: f("id"), message: "id 형식 오류".into() });
        }
        if a.title.trim().is_empty() || a.title.chars().count() > 120 {
            e.push(FieldError { field: f("title"), message: "제목은 1~120자입니다".into() });
        }
        if !ACTION_STATUSES.contains(&a.status.as_str()) {
            e.push(FieldError { field: f("status"), message: "상태 값이 올바르지 않습니다".into() });
        }
        if chrono::NaiveDate::parse_from_str(&a.target_date, "%Y-%m-%d").is_err() {
            e.push(FieldError { field: f("targetDate"), message: "날짜는 YYYY-MM-DD 형식입니다".into() });
        }
        if !(0..=crate::finance::validation::MAX_AMOUNT).contains(&a.amount) {
            e.push(FieldError { field: f("amount"), message: "금액 범위 오류".into() });
        }
        if a.review_condition.chars().count() > 300 || a.notes.chars().count() > 1000 {
            e.push(FieldError { field: f("notes"), message: "텍스트가 너무 깁니다".into() });
        }
    }
    e
}

fn add_months(months: u32) -> String {
    let today = chrono::Utc::now().date_naive();
    today.checked_add_months(chrono::Months::new(months)).unwrap_or(today).format("%Y-%m-%d").to_string()
}

pub async fn get_actions(State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Value>> {
    load_client(&s, &id).await?;
    let (_, cfg) = topics::active(&s).await?;
    let stored: Option<Vec<ActionItem>> = repo::get_doc(&s.db, DocTable::ActionPlans, &id).await?;
    let items = match stored {
        Some(v) => v,
        None => cfg
            .content
            .action_templates
            .iter()
            .map(|t| ActionItem {
                id: format!("act_{}", uuid::Uuid::new_v4().simple()),
                title: t.title.clone(),
                priority: t.priority,
                target_date: add_months(t.due_month),
                amount: t.amount,
                status: "todo".into(),
                review_condition: t.review_condition.clone(),
                notes: String::new(),
                template_id: Some(t.id.clone()),
            })
            .collect(),
    };
    Ok(Json(json!({ "items": items, "saved": repo::get_doc::<Vec<ActionItem>>(&s.db, DocTable::ActionPlans, &id).await?.is_some(), "templates": cfg.content.action_templates })))
}

pub async fn put_actions(State(s): State<AppState>, Path(id): Path<String>, AppJson(items): AppJson<Vec<ActionItem>>) -> AppResult<Json<Vec<ActionItem>>> {
    load_client(&s, &id).await?;
    let errors = validate_actions(&items);
    if !errors.is_empty() {
        return Err(AppError::Validation(errors));
    }
    repo::put_doc(&s.db, DocTable::ActionPlans, &id, &items).await?;
    Ok(Json(items))
}
