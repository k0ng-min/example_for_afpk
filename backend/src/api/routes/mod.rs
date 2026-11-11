use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderName, HeaderValue, Method};
use axum::routing::{get, post, put};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::api::handlers::{clients, cpa, finance, ideas};
use crate::services::state::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(clients::health))
        // 최종 아이디어: CPA 유예생 소득 공백 재무설계
        .route("/cpa/defaults", get(cpa::defaults))
        .route("/cpa/analyze", post(cpa::analyze))
        .route("/cpa/explore", post(cpa::explore))
        .route("/cpa/checkin", post(cpa::checkin))
        .route("/cpa/experiments", get(cpa::experiments))
        .route("/cpa/ai/run", post(cpa::run_ai))
        .route("/cpa/ai/screen", post(cpa::screen))
        .route("/cpa/ask", post(cpa::ask))
        .route("/cpa/icl", post(cpa::icl))
        .route("/cpa/runs", get(cpa::runs))
        .route("/clients", get(clients::list))
        .route("/clients/reset", post(clients::reset))
        .route("/clients/{id}", get(clients::get).put(clients::put))
        .route("/clients/{id}/scenarios", get(clients::list_scenarios))
        .route("/clients/{id}/actions", get(clients::get_actions).put(clients::put_actions))
        .route("/clients/{id}/reviews", get(finance::get_reviews))
        .route("/clients/{id}/reviews/{claim_id}", put(finance::put_review))
        .route("/goals/templates", get(clients::goal_templates))
        .route("/scenarios", post(clients::create_scenario))
        .route("/scenarios/calculate", post(finance::calculate))
        .route("/scenarios/compare", post(finance::compare_handler))
        .route("/scenarios/{id}", put(clients::update_scenario).delete(clients::delete_scenario))
        .route("/scenarios/{id}/duplicate", post(clients::duplicate_scenario))
        .route("/analysis", post(finance::analysis))
        .route("/verification", post(finance::verification))
        .route("/topics/active", get(ideas::active_topic))
        .route("/topics/versions", get(ideas::list_versions))
        .route("/ai/agents", get(ideas::ai_agents))
        .route("/admin/session", get(ideas::admin_session))
        .route("/admin/backup", get(ideas::backup))
        .route("/ideas/analyze", post(ideas::analyze_idea))
        .route("/ideas/generate", post(ideas::generate_idea))
        .route("/ideas/import", post(ideas::import_topic))
        .route("/ideas/rollback", post(ideas::rollback))
        .route("/ideas/{id}/preview", get(ideas::preview))
        .route("/ideas/{id}/validate", post(ideas::validate))
        .route("/ideas/{id}/activate", post(ideas::activate))
}

pub fn app(state: AppState) -> Router {
    let origins: Vec<HeaderValue> = state.cfg.cors_origins.iter().filter_map(|o| o.parse().ok()).collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, HeaderName::from_static("x-admin-token")]);

    let mut router = Router::new().nest("/api", api_router());
    if let Some(dist) = state.cfg.frontend_dist.clone() {
        // 배포 모드: 빌드된 프론트엔드를 같은 서버에서 제공(SPA 라우팅은 index.html 로 폴백)
        let index = dist.join("index.html");
        router = router.fallback_service(ServeDir::new(dist).fallback(ServeFile::new(index)));
    }
    router
        .layer(DefaultBodyLimit::max(512 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
