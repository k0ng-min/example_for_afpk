//! SQLite 저장소. 모든 쿼리는 바인딩 파라미터를 사용한다(SQL 인젝션 방지). 테이블명은 상수로만 지정.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;

use crate::domain::clients::Client;
use crate::domain::scenarios::Scenario;
use crate::errors::AppResult;

pub async fn connect(url: &str) -> AppResult<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(url)?.create_if_missing(true).foreign_keys(true);
    // 인메모리 DB는 연결마다 별도 DB가 되므로 연결 1개로 고정
    let max = if url.contains(":memory:") { 1 } else { 5 };
    let pool = SqlitePoolOptions::new().max_connections(max).connect_with(opts).await?;
    sqlx::migrate!("./migrations").run(&pool).await.map_err(|e| crate::errors::AppError::Internal(e.to_string()))?;
    Ok(pool)
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn parse<T: DeserializeOwned>(s: &str) -> AppResult<T> {
    Ok(serde_json::from_str(s)?)
}

// ── clients ──
pub async fn list_clients(db: &SqlitePool) -> AppResult<Vec<Client>> {
    let rows = sqlx::query("SELECT data FROM clients ORDER BY id").fetch_all(db).await?;
    rows.iter().map(|r| parse(r.get::<&str, _>("data"))).collect()
}

pub async fn get_client(db: &SqlitePool, id: &str) -> AppResult<Option<Client>> {
    let row = sqlx::query("SELECT data FROM clients WHERE id = ?").bind(id).fetch_optional(db).await?;
    row.map(|r| parse(r.get::<&str, _>("data"))).transpose()
}

pub async fn upsert_client(db: &SqlitePool, c: &Client) -> AppResult<()> {
    sqlx::query("INSERT INTO clients (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
        .bind(&c.id)
        .bind(serde_json::to_string(c)?)
        .bind(now())
        .execute(db)
        .await?;
    Ok(())
}

pub async fn insert_client_if_absent(db: &SqlitePool, c: &Client) -> AppResult<bool> {
    let r = sqlx::query("INSERT OR IGNORE INTO clients (id, data, updated_at) VALUES (?, ?, ?)")
        .bind(&c.id)
        .bind(serde_json::to_string(c)?)
        .bind(now())
        .execute(db)
        .await?;
    Ok(r.rows_affected() > 0)
}

pub async fn count_clients(db: &SqlitePool) -> AppResult<i64> {
    Ok(sqlx::query("SELECT COUNT(*) AS n FROM clients").fetch_one(db).await?.get("n"))
}

// ── scenarios ──
pub async fn list_scenarios(db: &SqlitePool, client_id: &str) -> AppResult<Vec<Scenario>> {
    let rows = sqlx::query("SELECT data FROM scenarios WHERE client_id = ? ORDER BY rowid").bind(client_id).fetch_all(db).await?;
    rows.iter().map(|r| parse(r.get::<&str, _>("data"))).collect()
}

pub async fn get_scenario(db: &SqlitePool, id: &str) -> AppResult<Option<Scenario>> {
    let row = sqlx::query("SELECT data FROM scenarios WHERE id = ?").bind(id).fetch_optional(db).await?;
    row.map(|r| parse(r.get::<&str, _>("data"))).transpose()
}

pub async fn upsert_scenario(db: &SqlitePool, s: &Scenario) -> AppResult<()> {
    sqlx::query("INSERT INTO scenarios (id, client_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, client_id = excluded.client_id, updated_at = excluded.updated_at")
        .bind(&s.id)
        .bind(&s.client_id)
        .bind(serde_json::to_string(s)?)
        .bind(now())
        .execute(db)
        .await?;
    Ok(())
}

pub async fn delete_scenario(db: &SqlitePool, id: &str) -> AppResult<bool> {
    Ok(sqlx::query("DELETE FROM scenarios WHERE id = ?").bind(id).execute(db).await?.rows_affected() > 0)
}

// ── 고객별 JSON 문서(실행계획·검토기록) ──
#[derive(Clone, Copy)]
pub enum DocTable {
    ActionPlans,
    ReviewRecords,
}

impl DocTable {
    fn select(self) -> &'static str {
        match self {
            DocTable::ActionPlans => "SELECT data FROM action_plans WHERE client_id = ?",
            DocTable::ReviewRecords => "SELECT data FROM review_records WHERE client_id = ?",
        }
    }
    fn upsert(self) -> &'static str {
        match self {
            DocTable::ActionPlans => "INSERT INTO action_plans (client_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            DocTable::ReviewRecords => "INSERT INTO review_records (client_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        }
    }
}

pub async fn get_doc<T: DeserializeOwned>(db: &SqlitePool, table: DocTable, client_id: &str) -> AppResult<Option<T>> {
    let row = sqlx::query(table.select()).bind(client_id).fetch_optional(db).await?;
    row.map(|r| parse(r.get::<&str, _>("data"))).transpose()
}

pub async fn put_doc<T: Serialize>(db: &SqlitePool, table: DocTable, client_id: &str, value: &T) -> AppResult<()> {
    sqlx::query(table.upsert()).bind(client_id).bind(serde_json::to_string(value)?).bind(now()).execute(db).await?;
    Ok(())
}

// ── topic versions ──
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicVersionRow {
    pub id: String,
    pub topic_id: String,
    pub label: String,
    pub source: String,
    pub status: String,
    pub config: serde_json::Value,
    pub client: Option<serde_json::Value>,
    pub meta: serde_json::Value,
    pub validation: Option<serde_json::Value>,
    pub created_at: String,
}

fn row_to_version(r: &sqlx::sqlite::SqliteRow) -> AppResult<TopicVersionRow> {
    let opt = |k: &str| -> AppResult<Option<serde_json::Value>> {
        r.get::<Option<&str>, _>(k).map(parse).transpose()
    };
    Ok(TopicVersionRow {
        id: r.get("id"),
        topic_id: r.get("topic_id"),
        label: r.get("label"),
        source: r.get("source"),
        status: r.get("status"),
        config: parse(r.get::<&str, _>("config"))?,
        client: opt("client")?,
        meta: parse(r.get::<&str, _>("meta"))?,
        validation: opt("validation")?,
        created_at: r.get("created_at"),
    })
}

pub async fn insert_version(db: &SqlitePool, v: &TopicVersionRow) -> AppResult<()> {
    sqlx::query("INSERT INTO topic_versions (id, topic_id, label, source, status, config, client, meta, validation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&v.id)
        .bind(&v.topic_id)
        .bind(&v.label)
        .bind(&v.source)
        .bind(&v.status)
        .bind(v.config.to_string())
        .bind(v.client.as_ref().map(|c| c.to_string()))
        .bind(v.meta.to_string())
        .bind(v.validation.as_ref().map(|c| c.to_string()))
        .bind(&v.created_at)
        .execute(db)
        .await?;
    Ok(())
}

/// 프리셋은 파일이 원본이므로 시작 시 파일 내용으로 동기화한다(생성 버전은 절대 덮어쓰지 않음).
pub async fn sync_preset_version(db: &SqlitePool, v: &TopicVersionRow) -> AppResult<()> {
    sqlx::query("INSERT INTO topic_versions (id, topic_id, label, source, status, config, client, meta, validation, created_at) VALUES (?, ?, ?, 'preset', 'preset', ?, NULL, '{}', ?, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config, label = excluded.label, validation = excluded.validation WHERE topic_versions.source = 'preset'")
        .bind(&v.id)
        .bind(&v.topic_id)
        .bind(&v.label)
        .bind(v.config.to_string())
        .bind(v.validation.as_ref().map(|c| c.to_string()))
        .bind(&v.created_at)
        .execute(db)
        .await?;
    Ok(())
}

pub async fn get_version(db: &SqlitePool, id: &str) -> AppResult<Option<TopicVersionRow>> {
    let row = sqlx::query("SELECT * FROM topic_versions WHERE id = ?").bind(id).fetch_optional(db).await?;
    row.as_ref().map(row_to_version).transpose()
}

pub async fn list_versions(db: &SqlitePool) -> AppResult<Vec<TopicVersionRow>> {
    let rows = sqlx::query("SELECT * FROM topic_versions ORDER BY source = 'preset' DESC, created_at DESC").fetch_all(db).await?;
    rows.iter().map(row_to_version).collect()
}

pub async fn set_version_validation(db: &SqlitePool, id: &str, status: &str, validation: &serde_json::Value) -> AppResult<()> {
    sqlx::query("UPDATE topic_versions SET status = CASE WHEN source = 'preset' THEN 'preset' ELSE ? END, validation = ? WHERE id = ?")
        .bind(status)
        .bind(validation.to_string())
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

// ── app state ──
pub async fn get_state(db: &SqlitePool, key: &str) -> AppResult<Option<String>> {
    Ok(sqlx::query("SELECT value FROM app_state WHERE key = ?").bind(key).fetch_optional(db).await?.map(|r| r.get("value")))
}

pub async fn set_state(db: &SqlitePool, key: &str, value: &str) -> AppResult<()> {
    sqlx::query("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key)
        .bind(value)
        .execute(db)
        .await?;
    Ok(())
}

/// 초기 데이터 복구: 고객·시나리오·실행계획·검토기록만 초기화(주제 버전·활성 주제는 유지)
pub async fn reset_client_data(db: &SqlitePool) -> AppResult<()> {
    let mut tx = db.begin().await?;
    for q in ["DELETE FROM clients", "DELETE FROM scenarios", "DELETE FROM action_plans", "DELETE FROM review_records"] {
        sqlx::query(q).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}
