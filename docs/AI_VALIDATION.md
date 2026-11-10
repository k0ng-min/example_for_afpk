# AI_VALIDATION — AI 분석 구조와 비판적 검증

## AI 분석 구조 (현재: 규칙 기반)
| 역할 | 프롬프트 | 현재 런타임 |
|---|---|---|
| Financial Analyst | ai/prompts/analysis/financial_analyst.md | 지표 계산 + 규칙 평가 |
| Risk Detector | ai/prompts/analysis/risk_detector.md | 주제 규칙 + 엔진 경고 |
| Scenario Planner | ai/prompts/scenarios/scenario_planner.md | 시나리오 비교 |
| Critic | ai/prompts/verification/critic.md | `verify_claim` 독립 계산 비교 |
| Report Writer | ai/prompts/reporting/report_writer.md | Report Studio 조립 |
| Idea Configurator | ai/prompts/idea_generation/idea_configurator.md | `adaptive_ideas::{analyze, generate}` |

`GEMINI_API_KEY`가 없으면 LLM을 호출하지 않고 `llmCallsEnabled=false`, UI는 "규칙 기반 모드"를 표시한다. 인사이트에는 `source: "rule_engine"`이 붙어 AI 생성물과 계산 결과를 구분한다.

### Gemini(AI 상담 전용) — `backend/src/services/copilot.rs`, `integrations/ai/gemini.rs`
- 키가 있으면 AI 상담 질문마다: ① 규칙 엔진 답변 생성 → ② Rust 계산 결과(지표·예측 요약·목표·경고)와 규칙 답변만 `<client_data>`로 Gemini 에 전달(프롬프트: `ai/prompts/system/base.md` + `ai/prompts/analysis/copilot.md`) → ③ 답변 속 금액(원·만·억)·비율(%)을 추출해 계산값·입력값과 대조(금액 ±1% 또는 5,000원, 비율 ±1% 또는 0.05%p).
- 응답: `source: "gemini"`, `model`, `numbersChecked`, `unverifiedNumbers`(맞지 않는 숫자), `ruleText`(비교용 규칙 답변). UI는 "Gemini 생성" 배지와 검증 안 된 수치를 빨간색으로 표시한다.
- 호출 실패(키 오류·한도 초과·시간 초과 40초)는 규칙 엔진 답변을 그대로 반환하고 `llmError`에 사유를 담는다. LLM 답변인 척하지 않는다.
- 한계: 개월 수·나이 같은 작은 정수와 문장의 논리는 자동 대조하지 않는다 → 사람이 검토. 분석·검증·보고서 에이전트는 여전히 규칙 엔진이다.
- 인증은 `?key=` 쿼리(신형 `AQ.` 키는 `x-goog-api-key` 헤더를 거부함). 요청 URL은 로그·오류 메시지에 남기지 않는다. 주 모델이 503·429·404·시간 초과면 `GEMINI_FALLBACK_MODEL`로 1회 재시도하고, 응답의 `model`에 실제 사용 모델을 표시한다.
- 키는 서버 환경변수로만 읽고 로그·응답·오류 메시지에 노출하지 않는다(오류 본문에 키가 있으면 `***`로 치환).

## 출력 검증·독립 계산
- AI(초안) 주장은 `{statement, metric, claimedValue, scenarioPreset}` 구조. 수치는 반드시 지표 레지스트리 key에 연결되어야 자동 검증된다.
- 서버가 해당 시나리오로 Rust 엔진을 다시 실행해 계산값을 얻고 허용 오차와 비교한다.

| 단위 | 허용 오차 |
|---|---|
| 원 | max(1,000원, 계산값의 1%) |
| bp | 50bp (0.5%p) |
| 0.1개월 | 1 (0.1개월) |
| 개월·개수 | 0 |

| 상태 | 조건 |
|---|---|
| 검증 완료 | 차이 ≤ 허용 오차 |
| 오류 발견 | 차이 > 허용 오차, 또는 계산상 사건이 발생하지 않음 |
| 검토 필요 | 지표는 있으나 주장에 수치 없음 |
| 근거 부족 | 연결된 지표 없음(자동 검증 불가) |
| 수정 완료 | 사람이 'corrected'로 판결하고 **수정값이 재검증을 통과**(지표 없는 주장은 근거 메모 필수) |

검증하지 않은 주장은 어떤 경로로도 '검증 완료'가 되지 않는다(`services/verification.rs`, 테스트 `verification_statuses_match_evaluation_cases`).

## 시연용 AI 초안 주장(의도적 오류 포함)
`ai/evaluations/claim_verification_cases.json` — 예: 고객 E "월 저축 여력 120만원"(실제 100만원 → 오류 발견), "카드론 상환비율 7.4%"(7.41% → 검증 완료), "연 7% 수익 보장"(근거 부족), 고객 C 돌봄 시 긴급자금 4개월 차 달성(실제 6개월 → 오류 발견).

## 오류 기록·인간 검토
- 판결 기록: `PUT /clients/:id/reviews/:claimId` → SQLite `review_records` (판단, 수정값, 근거 메모, 검토자, 시각)
- Verification Lab에서 주장별로 입력값·계산식·출처(시나리오·엔진)·방법·차이·수정 결과·인간 판단을 함께 표시
- Report Studio의 "AI 결과 검증" 섹션에 상태별 결과 수록

## 프롬프트 인젝션·안전
`ai/policies/safety_policy.md` 참고. 아이디어 입력·질문은 데이터로만 취급하고, 생성 구성은 스키마·허용 목록·텍스트 패턴 검사로 재검증한다. Copilot은 세금·보험·종목·시장 전망 등 미지원 질문을 거절한다.
