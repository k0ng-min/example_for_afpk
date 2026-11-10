# family_commitment — 약속의 방화벽

- 문제: 가족 부양과 개인 재무목표(주거 독립·경력 개발)의 충돌
- 대표 고객: `client_a` (합성)
- 전용 시각화: `commitment_graph` (Financial Commitment Graph)
- 계산 모듈: `core_cashflow`, `goal_priority` — 기존 Rust 엔진으로 모두 지원, 신규 모듈 불필요
- 시나리오: 약속 유지 / 지원 상한 40만원 / 경력 개발 우선 / 6개월 후 이직
