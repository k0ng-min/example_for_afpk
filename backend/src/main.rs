use finova::config::Config;
use finova::services::state::build_state;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();
    // 프로젝트 .env 의 GEMINI_* 값은 OS 환경변수보다 우선한다.
    // (다른 도구용으로 Windows 사용자 환경변수에 등록된 GEMINI_API_KEY 가 이 프로젝트 키를 가리는 문제 방지.
    //  .env 파일이 없는 배포 환경에서는 OS 환경변수가 그대로 쓰인다)
    let mut overridden = vec![];
    if let Ok(iter) = dotenvy::from_filename_iter("../.env") {
        for (k, v) in iter.flatten() {
            if k.starts_with("GEMINI_") && !v.trim().is_empty() && std::env::var(&k).ok().as_deref() != Some(v.as_str()) {
                // 서버 작업을 띄우기 전, 다른 스레드가 환경변수를 읽지 않는 시점에만 호출한다
                std::env::set_var(&k, &v);
                overridden.push(k);
            }
        }
    }
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,tower_http=info,sqlx=warn")))
        .init();

    if !overridden.is_empty() {
        tracing::info!(?overridden, "프로젝트 .env 값이 OS 환경변수를 덮어씀");
    }
    let cfg = Config::from_env();
    tracing::info!(?cfg, "starting FINOVA backend");
    if cfg.admin_token.as_deref() == Some(finova::config::DEV_ADMIN_TOKEN) {
        tracing::warn!("ADMIN_TOKEN 미설정 — 개발용 기본 관리자 토큰을 사용합니다. 배포 시 반드시 설정하세요.");
    }
    let port = cfg.port;
    let state = match build_state(cfg).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "failed to initialize");
            std::process::exit(1);
        }
    };
    let app = finova::api::routes::app(state);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("bind port");
    tracing::info!("listening on http://localhost:{port}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("server error");
}
