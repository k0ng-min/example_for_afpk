//! 주제 조회(공개) + Adaptive Idea Engine(관리자 전용).

use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::middleware::{Admin, AppJson};
use crate::domain::adaptive_ideas::{analyze, generate, IdeaInput};
use crate::domain::clients::Client;
use crate::domain::topics::TopicConfig;
use crate::errors::{AppError, AppResult};
use crate::finance::metrics::compute_metrics;
use crate::finance::projections::project;
use crate::finance::validation::{is_safe_id, FieldError};
use crate::repositories::{self as repo, TopicVersionRow};
use crate::services::state::AppState;
use crate::services::topics::{self, preset_version_id};

fn check_version_id(id: &str) -> AppResult<()> {
    let ok = match id.strip_prefix("preset:") {
        Some(rest) => is_safe_id(rest),
        None => is_safe_id(id),
    };
    if ok {
        Ok(())
    } else {
        Err(AppError::Validation(vec![FieldError { field: "id".into(), message: "버전 id 형식 오류".into() }]))
    }
}

fn version_meta(v: &TopicVersionRow, active_id: &str) -> Value {
    json!({
        "id": v.id, "topicId": v.topic_id, "label": v.label, "source": v.source, "status": v.status,
        "createdAt": v.created_at, "active": v.id == active_id,
        "validationOk": v.validation.as_ref().and_then(|x| x.get("ok")).and_then(Value::as_bool),
        "name": v.config.get("name"), "signatureVisual": v.config.get("signatureVisual"), "accent": v.config.get("accent"),
    })
}

pub async fn active_topic(State(s): State<AppState>) -> AppResult<Json<Value>> {
    let (row, cfg) = topics::active(&s).await?;
    Ok(Json(json!({
        "version": version_meta(&row, &row.id),
        "config": cfg,
        "historyDepth": topics::history_len(&s).await?,
    })))
}

pub async fn ai_agents(State(s): State<AppState>) -> Json<Value> {
    Json(json!({ "status": s.ai.status, "agents": s.ai.agents }))
}

pub async fn admin_session(_: Admin) -> Json<Value> {
    Json(json!({ "ok": true }))
}

pub async fn list_versions(_: Admin, State(s): State<AppState>) -> AppResult<Json<Value>> {
    let (active, _) = topics::active(&s).await?;
    let rows = repo::list_versions(&s.db).await?;
    Ok(Json(json!({
        "activeVersionId": active.id,
        "historyDepth": topics::history_len(&s).await?,
        "versions": rows.iter().map(|r| version_meta(r, &active.id)).collect::<Vec<_>>(),
        "log": topics::activation_log(&s).await?,
    })))
}

pub async fn backup(_: Admin, State(s): State<AppState>) -> AppResult<Json<Value>> {
    let (active, _) = topics::active(&s).await?;
    Ok(Json(json!({
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "activeVersionId": active.id,
        "versions": repo::list_versions(&s.db).await?,
        "log": topics::activation_log(&s).await?,
        "clients": repo::list_clients(&s.db).await?,
    })))
}

fn validate_input(input: &IdeaInput) -> AppResult<()> {
    let e = input.validate();
    if e.is_empty() { Ok(()) } else { Err(AppError::Validation(e)) }
}

pub async fn analyze_idea(_: Admin, AppJson(input): AppJson<IdeaInput>) -> AppResult<Json<Value>> {
    validate_input(&input)?;
    Ok(Json(serde_json::to_value(analyze(&input))?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateRequest {
    #[serde(default)]
    pub input: Option<IdeaInput>,
    /// 기존 후보 프리셋 선택 시 (새 생성 없이 해당 프리셋 버전을 미리보기 대상으로 반환)
    #[serde(default)]
    pub preset_id: Option<String>,
}

pub async fn generate_idea(_: Admin, State(s): State<AppState>, AppJson(b): AppJson<GenerateRequest>) -> AppResult<Json<Value>> {
    if let Some(pid) = b.preset_id {
        let id = preset_version_id(&pid);
        check_version_id(&id)?;
        let (row, report) = topics::validate_version(&s, &id).await?;
        return Ok(Json(json!({ "versionId": row.id, "mode": "preset", "validation": report, "notes": [] })));
    }
    let input = b.input.ok_or_else(|| AppError::Validation(vec![FieldError { field: "input".into(), message: "아이디어 입력 또는 presetId 가 필요합니다".into() }]))?;
    validate_input(&input)?;
    let analysis = analyze(&input);
    let base = s
        .presets
        .iter()
        .find(|p| p.id == analysis.base_archetype)
        .or_else(|| s.presets.first())
        .ok_or_else(|| AppError::Internal("no presets".into()))?;
    let base_client = s
        .seeds
        .clients
        .iter()
        .find(|c| c.id == base.primary_client_id)
        .ok_or_else(|| AppError::Internal("preset client missing".into()))?;
    let suffix: String = uuid::Uuid::new_v4().simple().to_string().chars().take(8).collect();
    let g = generate(&input, &analysis, base, base_client, &suffix);
    let row = TopicVersionRow {
        id: format!("ver_{suffix}"),
        topic_id: g.config.id.clone(),
        label: g.config.name.clone(),
        source: "generated".into(),
        status: "draft".into(),
        config: serde_json::to_value(&g.config)?,
        client: Some(serde_json::to_value(&g.client)?),
        meta: json!({ "input": input, "analysis": analysis, "notes": g.notes, "basePreset": base.id }),
        validation: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    repo::insert_version(&s.db, &row).await?;
    let (_, report) = topics::validate_version(&s, &row.id).await?;
    Ok(Json(json!({ "versionId": row.id, "mode": "generated", "validation": report, "notes": g.notes })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRequest {
    pub config: Value,
    #[serde(default)]
    pub client: Option<Value>,
}

/// 외부(또는 수정한) 구성 JSON 가져오기. 엄격한 스키마 + 검증을 통과해야만 초안으로 저장된다.
pub async fn import_topic(_: Admin, State(s): State<AppState>, AppJson(b): AppJson<ImportRequest>) -> AppResult<Json<Value>> {
    let config: TopicConfig = serde_json::from_value(b.config).map_err(|e| AppError::Validation(vec![FieldError { field: "config".into(), message: format!("스키마 오류: {}", e.to_string().chars().take(200).collect::<String>()) }]))?;
    let client: Option<Client> = b
        .client
        .map(serde_json::from_value)
        .transpose()
        .map_err(|e| AppError::Validation(vec![FieldError { field: "client".into(), message: format!("스키마 오류: {}", e.to_string().chars().take(200).collect::<String>()) }]))?;
    if s.presets.iter().any(|p| p.id == config.id) {
        return Err(AppError::Validation(vec![FieldError { field: "config.id".into(), message: "프리셋 id 는 가져오기로 덮어쓸 수 없습니다".into() }]));
    }
    let lookup = match &client {
        Some(c) => Some(c.clone()),
        None => repo::get_client(&s.db, &config.primary_client_id).await?,
    };
    let report = crate::domain::topics::validate::validate_topic(&config, lookup.as_ref());
    if !report.ok {
        return Err(AppError::TopicInvalid(Box::new(report)));
    }
    let suffix: String = uuid::Uuid::new_v4().simple().to_string().chars().take(8).collect();
    let row = TopicVersionRow {
        id: format!("ver_{suffix}"),
        topic_id: config.id.clone(),
        label: config.name.clone(),
        source: "imported".into(),
        status: "validated".into(),
        config: serde_json::to_value(&config)?,
        client: client.map(|c| serde_json::to_value(c)).transpose()?,
        meta: json!({}),
        validation: Some(serde_json::to_value(&report)?),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    repo::insert_version(&s.db, &row).await?;
    Ok(Json(json!({ "versionId": row.id, "validation": report })))
}

pub async fn preview(_: Admin, State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Value>> {
    check_version_id(&id)?;
    let row = repo::get_version(&s.db, &id).await?.ok_or_else(|| AppError::NotFound("주제 버전".into()))?;
    let cfg = topics::parse_config(&row)?;
    let client = topics::version_client(&s, &row, &cfg).await?;
    // 미리보기는 활성 주제를 변경하지 않고, 대표 고객으로 프리셋 시나리오를 계산만 한다
    let scenario_preview: Vec<Value> = match &client {
        Some(c) => cfg
            .scenario_presets
            .iter()
            .map(|p| {
                let proj = project(c, &p.adjustments);
                let m = compute_metrics(c, &proj);
                json!({
                    "presetId": p.id, "name": p.name, "color": p.color,
                    "summary": proj.summary,
                    "netWorth": proj.rows.iter().map(|r| r.net_worth).collect::<Vec<_>>(),
                    "cash": proj.rows.iter().map(|r| r.cash).collect::<Vec<_>>(),
                    "kpis": m.into_iter().filter(|x| cfg.visual.kpis.iter().any(|k| k == x.key)).collect::<Vec<_>>(),
                })
            })
            .collect(),
        None => vec![],
    };
    let (active, _) = topics::active(&s).await?;
    Ok(Json(json!({
        "version": version_meta(&row, &active.id),
        "config": cfg,
        "client": client,
        "meta": row.meta,
        "validation": row.validation,
        "scenarioPreview": scenario_preview,
    })))
}

pub async fn validate(_: Admin, State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Value>> {
    check_version_id(&id)?;
    let (row, report) = topics::validate_version(&s, &id).await?;
    Ok(Json(json!({ "versionId": row.id, "status": row.status, "validation": report })))
}

pub async fn activate(_: Admin, State(s): State<AppState>, Path(id): Path<String>) -> AppResult<Json<Value>> {
    check_version_id(&id)?;
    let report = topics::activate(&s, &id).await?;
    Ok(Json(json!({ "ok": true, "activeVersionId": id, "validation": report })))
}

pub async fn rollback(_: Admin, State(s): State<AppState>) -> AppResult<Json<Value>> {
    let prev = topics::rollback(&s).await?;
    Ok(Json(json!({ "ok": true, "activeVersionId": prev })))
}
