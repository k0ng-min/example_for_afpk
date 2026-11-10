//! 주제 버전 관리: 프리셋 동기화, 활성 주제 조회, 검증, 활성화(백업), 롤백.

use serde::Serialize;

use crate::domain::clients::Client;
use crate::domain::topics::validate::{validate_topic, ValidationReport};
use crate::domain::topics::{loader::DEFAULT_TOPIC_ID, Rule, TopicConfig};
use crate::errors::{AppError, AppResult};
use crate::repositories::{self as repo, TopicVersionRow};
use crate::services::state::AppState;

const ACTIVE_KEY: &str = "active_version_id";
const HISTORY_KEY: &str = "activation_history";
const LOG_KEY: &str = "activation_log";

pub fn preset_version_id(topic_id: &str) -> String {
    format!("preset:{topic_id}")
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub async fn sync_presets(state: &AppState) -> AppResult<()> {
    for p in &state.presets {
        let client = state.seeds.clients.iter().find(|c| c.id == p.primary_client_id);
        let report = validate_topic(p, client);
        if !report.ok {
            tracing::warn!(topic = %p.id, "preset topic failed validation");
        }
        repo::sync_preset_version(
            &state.db,
            &TopicVersionRow {
                id: preset_version_id(&p.id),
                topic_id: p.id.clone(),
                label: p.name.clone(),
                source: "preset".into(),
                status: "preset".into(),
                config: serde_json::to_value(p)?,
                client: None,
                meta: serde_json::json!({}),
                validation: Some(serde_json::to_value(&report)?),
                created_at: now(),
            },
        )
        .await?;
    }
    if repo::get_state(&state.db, ACTIVE_KEY).await?.is_none() {
        repo::set_state(&state.db, ACTIVE_KEY, &preset_version_id(DEFAULT_TOPIC_ID)).await?;
    }
    Ok(())
}

pub fn parse_config(v: &TopicVersionRow) -> AppResult<TopicConfig> {
    Ok(serde_json::from_value(v.config.clone())?)
}

pub fn parse_client(v: &TopicVersionRow) -> AppResult<Option<Client>> {
    v.client.clone().map(serde_json::from_value).transpose().map_err(Into::into)
}

pub async fn active(state: &AppState) -> AppResult<(TopicVersionRow, TopicConfig)> {
    let id = repo::get_state(&state.db, ACTIVE_KEY).await?.unwrap_or_else(|| preset_version_id(DEFAULT_TOPIC_ID));
    let row = match repo::get_version(&state.db, &id).await? {
        Some(r) => r,
        None => repo::get_version(&state.db, &preset_version_id(DEFAULT_TOPIC_ID))
            .await?
            .ok_or_else(|| AppError::Internal("default topic missing".into()))?,
    };
    let cfg = parse_config(&row)?;
    Ok((row, cfg))
}

/// 공통 기본 규칙 + 주제별 규칙
pub fn effective_rules(state: &AppState, topic: &TopicConfig) -> Vec<Rule> {
    let mut rules = state.base_rules.clone();
    rules.extend(topic.rules.iter().cloned());
    rules
}

/// 버전의 대표 고객: 버전에 포함된 생성 고객 → DB 고객 → 시드 고객 순으로 찾는다.
pub async fn version_client(state: &AppState, row: &TopicVersionRow, cfg: &TopicConfig) -> AppResult<Option<Client>> {
    if let Some(c) = parse_client(row)? {
        return Ok(Some(c));
    }
    if let Some(c) = repo::get_client(&state.db, &cfg.primary_client_id).await? {
        return Ok(Some(c));
    }
    Ok(state.seeds.clients.iter().find(|c| c.id == cfg.primary_client_id).cloned())
}

pub async fn validate_version(state: &AppState, id: &str) -> AppResult<(TopicVersionRow, ValidationReport)> {
    let row = repo::get_version(&state.db, id).await?.ok_or_else(|| AppError::NotFound("주제 버전".into()))?;
    let report = match parse_config(&row) {
        Ok(cfg) => {
            let client = version_client(state, &row, &cfg).await?;
            validate_topic(&cfg, client.as_ref())
        }
        Err(e) => ValidationReport {
            ok: false,
            checks: vec![crate::domain::topics::validate::Check { id: "schema", label: "데이터 스키마", passed: false, details: vec![e.to_string()] }],
        },
    };
    let status = if report.ok { "validated" } else { "invalid" };
    repo::set_version_validation(&state.db, id, status, &serde_json::to_value(&report)?).await?;
    let row = repo::get_version(&state.db, id).await?.ok_or_else(|| AppError::NotFound("주제 버전".into()))?;
    Ok((row, report))
}

#[derive(Debug, Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivationLogEntry {
    pub action: String,
    pub from_version: String,
    pub to_version: String,
    pub at: String,
}

async fn history(state: &AppState) -> AppResult<Vec<String>> {
    Ok(repo::get_state(&state.db, HISTORY_KEY).await?.map(|s| serde_json::from_str(&s)).transpose()?.unwrap_or_default())
}

pub async fn activation_log(state: &AppState) -> AppResult<Vec<ActivationLogEntry>> {
    Ok(repo::get_state(&state.db, LOG_KEY).await?.map(|s| serde_json::from_str(&s)).transpose()?.unwrap_or_default())
}

async fn append_log(state: &AppState, action: &str, from: &str, to: &str) -> AppResult<()> {
    let mut log = activation_log(state).await?;
    log.push(ActivationLogEntry { action: action.into(), from_version: from.into(), to_version: to.into(), at: now() });
    if log.len() > 100 {
        log.drain(0..log.len() - 100);
    }
    repo::set_state(&state.db, LOG_KEY, &serde_json::to_string(&log)?).await
}

pub async fn history_len(state: &AppState) -> AppResult<usize> {
    Ok(history(state).await?.len())
}

/// 검증을 다시 수행한 뒤 통과한 경우에만 활성화. 이전 활성 버전은 롤백 스택에 백업한다.
pub async fn activate(state: &AppState, id: &str) -> AppResult<ValidationReport> {
    let (row, report) = validate_version(state, id).await?;
    if !report.ok {
        return Err(AppError::TopicInvalid(Box::new(report)));
    }
    let (current, _) = active(state).await?;
    if current.id == row.id {
        return Err(AppError::Conflict("이미 활성화된 주제입니다".into()));
    }
    if let Some(c) = parse_client(&row)? {
        // 생성 고객은 추가만 하고 기존 고객 데이터는 절대 덮어쓰지 않는다
        repo::insert_client_if_absent(&state.db, &c).await?;
    }
    let mut h = history(state).await?;
    h.push(current.id.clone());
    if h.len() > 50 {
        h.remove(0);
    }
    repo::set_state(&state.db, HISTORY_KEY, &serde_json::to_string(&h)?).await?;
    repo::set_state(&state.db, ACTIVE_KEY, &row.id).await?;
    append_log(state, "activate", &current.id, &row.id).await?;
    Ok(report)
}

pub async fn rollback(state: &AppState) -> AppResult<String> {
    let mut h = history(state).await?;
    let prev = h.pop().ok_or_else(|| AppError::Conflict("되돌릴 이전 주제가 없습니다".into()))?;
    let (current, _) = active(state).await?;
    repo::set_state(&state.db, HISTORY_KEY, &serde_json::to_string(&h)?).await?;
    repo::set_state(&state.db, ACTIVE_KEY, &prev).await?;
    append_log(state, "rollback", &current.id, &prev).await?;
    Ok(prev)
}
