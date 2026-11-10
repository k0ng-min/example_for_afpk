//! 환경변수 기반 설정. 비밀값(ADMIN_TOKEN, GEMINI_API_KEY, ANTHROPIC_API_KEY)은 서버 환경변수로만 관리하며 로그에 출력하지 않는다.

use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Env {
    Development,
    Production,
}

#[derive(Clone)]
pub struct Config {
    pub env: Env,
    pub port: u16,
    pub database_url: String,
    pub topics_dir: PathBuf,
    pub data_dir: PathBuf,
    pub ai_dir: PathBuf,
    pub frontend_dist: Option<PathBuf>,
    pub cors_origins: Vec<String>,
    /// None 이면 관리자 기능 비활성화(운영 환경에서 토큰 미설정 시)
    pub admin_token: Option<String>,
    pub llm_api_key_present: bool,
    /// Gemini API 키(서버 전용, 로그 출력 금지). 있으면 AI 상담이 Gemini 를 호출한다
    pub gemini_api_key: Option<String>,
    /// Gemini 모델 id (기본 gemini-3.5-flash)
    pub gemini_model: String,
    /// 주 모델이 혼잡할 때 쓰는 예비 모델(빈 값 "none" 이면 사용 안 함)
    pub gemini_fallback_model: Option<String>,
}

pub const DEV_ADMIN_TOKEN: &str = "finova-dev-admin";
pub const DEFAULT_GEMINI_MODEL: &str = "gemini-3.5-flash";
pub const DEFAULT_GEMINI_FALLBACK_MODEL: &str = "gemini-flash-lite-latest";

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("env", &self.env)
            .field("port", &self.port)
            .field("database_url", &self.database_url)
            .field("topics_dir", &self.topics_dir)
            .field("admin_token", &self.admin_token.as_ref().map(|_| "***"))
            .field("llm_api_key_present", &self.llm_api_key_present)
            .field("gemini_api_key", &self.gemini_api_key.as_ref().map(|_| "***"))
            .field("gemini_model", &self.gemini_model)
            .finish()
    }
}

fn var(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

impl Config {
    pub fn from_env() -> Self {
        let env = match var("FINOVA_ENV").as_deref() {
            Some("production") => Env::Production,
            _ => Env::Development,
        };
        let admin_token = var("ADMIN_TOKEN").or_else(|| {
            (env == Env::Development).then(|| DEV_ADMIN_TOKEN.to_string())
        });
        Self {
            port: var("PORT").and_then(|p| p.parse().ok()).unwrap_or(8080),
            database_url: var("DATABASE_URL").unwrap_or_else(|| "sqlite://finova.db?mode=rwc".into()),
            topics_dir: var("FINOVA_TOPICS_DIR").map(PathBuf::from).unwrap_or_else(|| "../topics".into()),
            data_dir: var("FINOVA_DATA_DIR").map(PathBuf::from).unwrap_or_else(|| "../data".into()),
            ai_dir: var("FINOVA_AI_DIR").map(PathBuf::from).unwrap_or_else(|| "../ai".into()),
            frontend_dist: var("FINOVA_FRONTEND_DIST").map(PathBuf::from).or_else(|| {
                let p = PathBuf::from("../frontend/dist");
                p.join("index.html").exists().then_some(p)
            }),
            cors_origins: var("FINOVA_CORS_ORIGINS")
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_else(|| vec!["http://localhost:5173".into(), "http://127.0.0.1:5173".into()]),
            admin_token,
            llm_api_key_present: var("ANTHROPIC_API_KEY").is_some() || var("GEMINI_API_KEY").is_some(),
            gemini_api_key: var("GEMINI_API_KEY"),
            gemini_model: var("GEMINI_MODEL").unwrap_or_else(|| DEFAULT_GEMINI_MODEL.into()),
            gemini_fallback_model: match var("GEMINI_FALLBACK_MODEL").as_deref() {
                Some("none") => None,
                Some(m) => Some(m.to_string()),
                None => Some(DEFAULT_GEMINI_FALLBACK_MODEL.into()),
            },
            env,
        }
    }

    /// 테스트용 설정(인메모리 DB)
    pub fn for_tests(root: PathBuf) -> Self {
        Self {
            env: Env::Development,
            port: 0,
            database_url: "sqlite::memory:".into(),
            topics_dir: root.join("topics"),
            data_dir: root.join("data"),
            ai_dir: root.join("ai"),
            frontend_dist: None,
            cors_origins: vec![],
            admin_token: Some("test-admin".into()),
            llm_api_key_present: false,
            gemini_api_key: None,
            gemini_model: DEFAULT_GEMINI_MODEL.into(),
            gemini_fallback_model: None,
        }
    }
}
