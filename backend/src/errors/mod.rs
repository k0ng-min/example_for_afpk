//! API 오류. 내부 오류의 상세 내용은 서버 로그에만 남기고 응답에는 일반 메시지만 반환한다.

use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::domain::topics::validate::ValidationReport;
use crate::finance::validation::FieldError;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("validation failed")]
    Validation(Vec<FieldError>),
    #[error("invalid json: {0}")]
    InvalidJson(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("admin token required")]
    Unauthorized,
    #[error("admin disabled")]
    AdminDisabled,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("topic invalid")]
    TopicInvalid(Box<ValidationReport>),
    #[error("unavailable: {0}")]
    Unavailable(String),
    #[error("upstream: {0}")]
    Upstream(String),
    #[error("internal: {0}")]
    Internal(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Internal(format!("db: {e}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Internal(format!("json: {e}"))
    }
}

impl From<JsonRejection> for AppError {
    fn from(r: JsonRejection) -> Self {
        AppError::InvalidJson(r.body_text())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message, details) = match self {
            AppError::Validation(errors) => (StatusCode::BAD_REQUEST, "VALIDATION_ERROR", "입력값 검증에 실패했습니다".to_string(), json!(errors)),
            AppError::InvalidJson(m) => (StatusCode::BAD_REQUEST, "INVALID_JSON", "요청 본문 형식이 올바르지 않습니다".to_string(), json!(m.chars().take(300).collect::<String>())),
            AppError::NotFound(what) => (StatusCode::NOT_FOUND, "NOT_FOUND", format!("{what}을(를) 찾을 수 없습니다"), json!(null)),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "ADMIN_REQUIRED", "관리자 토큰이 필요합니다".to_string(), json!(null)),
            AppError::AdminDisabled => (StatusCode::FORBIDDEN, "ADMIN_DISABLED", "이 배포 환경에서는 관리자 기능이 비활성화되어 있습니다".to_string(), json!(null)),
            AppError::Conflict(m) => (StatusCode::CONFLICT, "CONFLICT", m, json!(null)),
            AppError::TopicInvalid(report) => (StatusCode::UNPROCESSABLE_ENTITY, "TOPIC_INVALID", "주제 구성이 검증을 통과하지 못했습니다".to_string(), json!(report)),
            AppError::Unavailable(m) => (StatusCode::SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED", m, json!(null)),
            AppError::Upstream(m) => (StatusCode::BAD_GATEWAY, "AI_CALL_FAILED", m, json!(null)),
            AppError::Internal(detail) => {
                tracing::error!(error = %detail, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다".to_string(), json!(null))
            }
        };
        (status, Json(json!({ "error": { "code": code, "message": message, "details": details } }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
