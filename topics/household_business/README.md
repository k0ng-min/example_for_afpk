# household_business — 가계·사업 전염 방화벽

- 문제: 소규모 사업의 재무 위험이 가계로 전파
- 대표 고객: `client_b` (합성, 사업 프로필 포함)
- 전용 시각화: `contagion_map` (Financial Contagion Map)
- 계산 모듈: `core_cashflow`, `business_contagion`(Rust `finance::business` — 이 주제를 위해 추가한 도메인 모듈), `goal_priority`
- 시나리오: 매출 유지 / 매출 −20% / −20% + 방화벽 / −30% + 지출 절감
