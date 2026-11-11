# API_SPEC

Base: `/api`. 요청·응답 JSON은 camelCase. 금액은 원 단위 정수, 비율은 bp(1bp=0.01%), `monthsX10`은 0.1개월 단위.
타입 원본: Rust `backend/src/domain/*`, `finance/*` ↔ 프론트엔드 Zod `frontend/src/types/api.ts`(응답을 런타임 검증, 불일치 시 `SCHEMA_MISMATCH`).
모든 요청 본문 구조체는 `deny_unknown_fields` — 알 수 없는 필드는 400.

## 공개 엔드포인트
| Method | Path | 요청 | 응답 |
|---|---|---|---|
| GET | /health | — | status, version, activeTopic, ai{mode,llmKeyDetected,llmCallsEnabled,note}, adminEnabled |
| GET | /clients | — | Client[] |
| GET | /clients/:id | — | Client |
| PUT | /clients/:id | Client (id 일치) | Client |
| POST | /clients/reset | — | {ok, clients} 합성 데이터 초기화(주제 버전은 유지) |
| GET | /clients/:id/scenarios | — | Scenario[] (없으면 활성 주제 프리셋으로 생성) |
| GET/PUT | /clients/:id/actions | PUT: ActionItem[] | {items, saved, templates} / ActionItem[] |
| GET | /clients/:id/reviews | — | ReviewRecord[] |
| PUT | /clients/:id/reviews/:claimId | {statement, decision(pending/approved/rejected/corrected), correctedValue?, correctedStatement?, note?, reviewer?} | ReviewRecord |
| GET | /goals/templates | — | Goal[] |
| POST | /scenarios | {clientId, name, description?, color?, isBaseline?, adjustments} | Scenario |
| PUT | /scenarios/:id | Scenario (id·clientId 변경 불가) | Scenario |
| DELETE | /scenarios/:id | — | {ok} |
| POST | /scenarios/:id/duplicate | — | Scenario (새 id, 독립 사본) |
| POST | /scenarios/calculate | {clientId? \| client?, adjustments} | {projection, metrics} |
| POST | /scenarios/compare | {clientId? \| client?, scenarios[1..8]} | {baselineId, scenarios[{scenarioId,name,color,projection}], deltas[]} |
| POST | /analysis | {clientId? \| client?, adjustments?, question?(≤500)} | {aiMode, aiNote, topicId, metrics, insights, projection, answer?, agents} |
| POST | /verification | {clientId, client?, claims?(≤30)} | {topicId, checklist, results[VerifiedClaim], summary} |
| GET | /topics/active | — | {version, config, historyDepth} |
| GET | /ai/agents | — | {status, agents[+프롬프트 본문]} |

## 최종 아이디어(CPA 소득 공백) 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/cpa/defaults` | 기본 입력값(가상 고객 김유예). `jobWage`·`traineeSalary`·`cpaSalary` 는 null |
| POST | `/api/cpa/analyze` | 본문 = 입력값(생략 필드는 기본값, 모르는 필드는 400). 응답: `short`(A~D 18개월), `tolerance`, `uncertainty`, `signals`, `long`(60개월, 입력 부족 시 `available:false`+`missing`), `markers`, `balanceSheet` |
| GET | `/api/cpa/experiments` | E1~E6 실험 정의 + `ai.configured`/`ai.model` (키 값은 포함하지 않음) |
| POST | `/api/cpa/ai/run` | `{experimentId, prompt?}` → 서버가 Gemini 호출, `{model, ranAt, prompt, output, flags}`. 키 없음 503 `AI_NOT_CONFIGURED`, 호출 실패 502 `AI_CALL_FAILED`. 프롬프트 6,000자 제한 |
| POST | `/api/cpa/ask` | `{questionId? \| question?, inputs?, useAi?}` → 규칙 기반 답변(`rule`: 답변·사실 목록) + 요청 시 서버 LLM 문장(`ai`: 모델·시각·대조한 숫자 수·미확인 숫자). 합격 예측 질문은 `outOfScope`. 키가 없으면 `aiError` 로 알림 |
| POST | `/api/cpa/icl` | `{grossAnnual, incomeYear, rateBps(2000\|2500)}` → 근로소득공제·상환기준소득·연 의무상환액·월 원천공제·시작 월, `thresholdConfirmed` |
| GET | `/api/cpa/runs` | 서버 파일에 기록된 실제 AI 실험 원출력과 주장 목록 |
| POST | `/api/cpa/ai/screen` | `{experimentId, output}` → 규칙 기반 확인 힌트 `{flags}`(판정 아님). ID는 영숫자 8자 이하 |

검증: 금액 0~100억 원, 연월 `YYYY-MM`, p·q 0~100, 할인율 0~30%, 신호 2 ≤ 신호 1, 시험 월 ≤ 발표 월, 발표 월은 단기 기간 안.

## 관리자 엔드포인트 (`x-admin-token` 헤더 필수)
| Method | Path | 설명 |
|---|---|---|
| GET | /admin/session | 토큰 확인 |
| GET | /admin/backup | 전체 버전·활성·로그·고객 JSON |
| GET | /topics/versions | 버전 목록, 활성 id, 롤백 깊이, 적용 로그 |
| POST | /ideas/analyze | IdeaInput → IdeaAnalysis |
| POST | /ideas/generate | {input} → 생성·저장·자동 검증 / {presetId} → 프리셋 버전 검증 → {versionId, mode, validation, notes} |
| POST | /ideas/import | {config, client?} — 엄격 스키마 + 검증 통과 시에만 저장 |
| GET | /ideas/:id/preview | {version, config, client, meta, validation, scenarioPreview[]} — 활성 주제 불변 |
| POST | /ideas/:id/validate | 재검증 → status validated/invalid |
| POST | /ideas/:id/activate | 재검증 통과 시 적용, 이전 활성 버전 백업 |
| POST | /ideas/rollback | 직전 활성 버전 복원 |

## 오류 형식
`{ "error": { "code", "message", "details" } }`

| HTTP | code | 상황 |
|---|---|---|
| 400 | VALIDATION_ERROR | 필드 검증 실패(details: [{field,message}]) |
| 400 | INVALID_JSON | 본문 파싱 실패·알 수 없는 필드·허용 목록 밖 enum |
| 401 | ADMIN_REQUIRED | 관리자 토큰 없음/불일치 |
| 403 | ADMIN_DISABLED | 운영 환경에서 ADMIN_TOKEN 미설정 |
| 404 | NOT_FOUND | 리소스 없음 |
| 409 | CONFLICT | 이미 활성, 롤백할 이력 없음 |
| 422 | TOPIC_INVALID | 주제 구성 검증 실패(details: ValidationReport) |
| 500 | INTERNAL_ERROR | 내부 오류(상세는 서버 로그만) |

## 입력 검증 규칙(요약)
- id: `[A-Za-z0-9_-]{1,64}` (경로 탈출 차단). 버전 id는 `preset:` 접두 허용
- 금액 0~1조 원, 조정값 ±1조, 이율 0~3000bp, 투자수익 −5000~3000bp, 매출 변화 ±10000bp
- 기간 1~360개월, 이벤트 ≤50, 목표 ≤20, 부채 ≤20, 확장 필드 ≤30
- 텍스트 길이 제한 + 제어 문자 금지, 주제 텍스트는 `<script`, `javascript:`, `{{`, `${` 등 거부
- 요청 본문 최대 512KB, CORS 허용 출처는 `FINOVA_CORS_ORIGINS`


### POST /api/cpa/explore

입력: `/api/cpa/analyze` 와 같은 CpaInputs(빈 객체 = 기본값). 검증 실패 시 400 `VALIDATION_ERROR`.

응답:
- `sensitivity` — `runwayBase`(전업 유지 시 안전자금을 지키는 개월 수, 48개월 이상이면 null), `endBase`(전업 18개월 말 잔액), `horizon`(48), `rows[]`: `key, label, lowLabel, highLabel, runwayLow, runwayHigh, endLow, endHigh`. 요인: 필수 생활비·보유 현금·가족 지원 금액·수험비·안전자금(각 ±20%), 가족 지원 종료(±3개월).
- `supports` — `baseRunway`, `base[]`(A·D: `strategy, tau, minCash, endCash`), `options[]`: 서울시 청년수당(월 50만×6), 국민취업지원제도 구직촉진수당(월 60만×6, 발표 다음 달부터), 햇살론 유스(600만 원 대출 + 월 이자 2만 원). 각 `kind`(grant/loan), `flows`, `totalIn`, `totalOut`, `conditions`, `caution`, `source`, `sourceUrl`, `verified`(항상 false), `runway`, `effects`.

CpaInputs 추가 필드 `extraFlows[]`: `{ from: "YYYY-MM", months: 1~60, amount: ±5,000만 이내(양수 유입·음수 유출, 월초), label: 40자 이내 }`, 최대 6개.

`/api/cpa/explore` 응답에는 다음도 포함된다.
- `stress` — `base`와 `cases[]`(가족 지원 3개월 조기 종료, 생활비 +15%, 아르바이트 2개월 지연, 아르바이트 소득 −25%, 300만 원 긴급 지출, 모두 한꺼번에). 각 `effects[]`: `strategy, tau, insolvent, minCash, endCash, missing`.
- `fans[]` — 전략별 `delays`(0~9), `months`, `series[지연][월]`(합격·수습 확보 후 첫 급여 지연별 월말 잔액), `taus`, `missing`. 확률이 아니라 범위다.

### POST /api/cpa/checkin

요청: `{ inputs?: CpaInputs, strategy: "A"|"B"|"C"|"D", entries: [{ month: "YYYY-MM", cash: 원 }] }` (최대 36건, 분석 시작부터 36개월 안).
응답: `plan[]`(선택 전략 계획 잔액), `rows[]`(`month, actual, plan, diff, level: safe|signal1|signal2|belowSafety, action`), `reprojection`(마지막 기록 다음 달부터 그 잔액으로 다시 계산: `from, cash, runway, strategyTau, strategyEnd, endMonth`). 검증 실패 시 400.
