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
