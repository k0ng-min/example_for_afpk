//! 관리자 접근 제어. 관리자 API 는 `x-admin-token` 헤더를 상수 시간 비교로 확인한다.

use axum::extract::{FromRequest, FromRequestParts, Request};
use axum::http::request::Parts;

use crate::errors::AppError;
use crate::services::state::AppState;

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// 핸들러 인자로 선언하면 관리자 인증을 강제하는 추출기
pub struct Admin;

impl FromRequestParts<AppState> for Admin {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let Some(expected) = state.cfg.admin_token.as_deref() else {
            return Err(AppError::AdminDisabled);
        };
        let given = parts.headers.get("x-admin-token").and_then(|v| v.to_str().ok()).unwrap_or("");
        if constant_time_eq(given.as_bytes(), expected.as_bytes()) {
            Ok(Admin)
        } else {
            Err(AppError::Unauthorized)
        }
    }
}

/// JSON 파싱 오류를 표준 오류 형식으로 변환하는 추출기
pub struct AppJson<T>(pub T);

impl<T, S> FromRequest<S> for AppJson<T>
where
    axum::Json<T>: FromRequest<S, Rejection = axum::extract::rejection::JsonRejection>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let axum::Json(v) = axum::Json::<T>::from_request(req, state).await?;
        Ok(AppJson(v))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn ct_eq() {
        assert!(super::constant_time_eq(b"abc", b"abc"));
        assert!(!super::constant_time_eq(b"abc", b"abd"));
        assert!(!super::constant_time_eq(b"abc", b"ab"));
    }
}
