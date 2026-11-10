use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::Config;
use crate::domain::clients::Client;
use crate::domain::goals::Goal;
use crate::domain::scenarios::Scenario;
use crate::domain::topics::{loader, Rule, TopicConfig};
use crate::errors::{AppError, AppResult};
use crate::integrations::ai::AiRegistry;
use crate::repositories as repo;

pub struct Seeds {
    pub clients: Vec<Client>,
    pub scenarios: Vec<Scenario>,
    pub goal_templates: Vec<Goal>,
}

pub struct Inner {
    pub cfg: Config,
    pub db: SqlitePool,
    pub presets: Vec<TopicConfig>,
    pub base_rules: Vec<Rule>,
    pub seeds: Seeds,
    pub ai: AiRegistry,
}

pub type AppState = Arc<Inner>;

fn read_seed<T: serde::de::DeserializeOwned>(cfg: &Config, file: &str) -> AppResult<T> {
    let path = cfg.data_dir.join(file);
    let text = std::fs::read_to_string(&path).map_err(|e| AppError::Internal(format!("{}: {e}", path.display())))?;
    Ok(serde_json::from_str(&text)?)
}

pub async fn build_state(cfg: Config) -> AppResult<AppState> {
    let db = repo::connect(&cfg.database_url).await?;
    let presets = loader::load_presets(&cfg.topics_dir).map_err(AppError::Internal)?;
    let base_rules = loader::load_base_rules(&cfg.topics_dir).map_err(AppError::Internal)?;
    let seeds = Seeds {
        clients: read_seed(&cfg, "sample_clients.json")?,
        scenarios: read_seed(&cfg, "sample_scenarios.json")?,
        goal_templates: read_seed(&cfg, "sample_goals.json")?,
    };
    let gemini = match &cfg.gemini_api_key {
        Some(k) => Some(crate::integrations::ai::gemini::GeminiClient::new(k.clone(), cfg.gemini_model.clone(), cfg.gemini_fallback_model.clone()).map_err(AppError::Internal)?),
        None => None,
    };
    if let Some(g) = &gemini {
        tracing::info!(model = %g.model, "Gemini 연결 활성화(AI 상담)");
    }
    let ai = AiRegistry::load(&cfg.ai_dir, cfg.llm_api_key_present, gemini).map_err(AppError::Internal)?;
    let state = Arc::new(Inner { cfg, db, presets, base_rules, seeds, ai });
    crate::services::topics::sync_presets(&state).await?;
    if repo::count_clients(&state.db).await? == 0 {
        seed_client_data(&state).await?;
    }
    Ok(state)
}

/// 합성 고객·시나리오 시드 + 생성 주제의 합성 고객 복원(주제 전환·초기화로 고객이 사라지지 않도록)
pub async fn seed_client_data(state: &AppState) -> AppResult<()> {
    for c in &state.seeds.clients {
        repo::upsert_client(&state.db, c).await?;
    }
    for s in &state.seeds.scenarios {
        repo::upsert_scenario(&state.db, s).await?;
    }
    for v in repo::list_versions(&state.db).await? {
        if let Some(c) = v.client {
            if let Ok(c) = serde_json::from_value::<Client>(c) {
                repo::insert_client_if_absent(&state.db, &c).await?;
            }
        }
    }
    Ok(())
}
