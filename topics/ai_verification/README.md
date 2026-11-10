# ai_verification — AI 재무설계 심사법정

- 문제: AI 재무설계안의 계산 오류·근거 부족·위험 가정
- 대표 고객: `client_e` (합성)
- 전용 시각화: `verification_court` (AI Verification Court)
- 계산 모듈: `core_cashflow`, `claim_verification`(Rust `services::verification`), `goal_priority`
- AI 초안 주장(`aiDraftClaims`)에는 검증 시연을 위한 의도적 오류가 포함됨
