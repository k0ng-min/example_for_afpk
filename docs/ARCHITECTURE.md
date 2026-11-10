# ARCHITECTURE

## 전체 구조

```
브라우저 ── React UI (Vite 5173, 배포 시 Axum이 dist 제공)
   │  fetch /api/*  (Zod 런타임 검증, x-admin-token 은 관리자 화면만)
   ▼
Axum API (8080) ── api/routes ─ handlers ─ middleware(Admin, AppJson)
   ├─ finance/      재무 계산 엔진(정수 원 + rust_decimal)
   ├─ services/     analysis(규칙·Copilot) · verification · topics(버전/활성/롤백) · state
   ├─ domain/       clients · goals · scenarios · topics(스키마·로더·검증) · adaptive_ideas
   ├─ integrations/ai  ai/ 레지스트리·프롬프트 로드, Gemini REST 클라이언트(AI 상담 전용, 키 있을 때만)
   └─ repositories/ SQLite (SQLx, 바인딩 파라미터)
        ▲ 시작 시 로드: topics/*(프리셋 JSON) · data/*(합성 시드) · ai/config/agents.json
```

## 책임 분리

| 영역 | 책임 | 하지 않는 것 |
|---|---|---|
| frontend | 렌더링, 입력, 차트·캔버스, 화면 상태, 주제 토큰 적용, 표시용 서식 | 재무 계산(모든 수치는 API 결과), LLM 직접 호출 |
| backend | API, 재무 계산, 입력 검증, 저장, 주제 구성 검증·버전·롤백, 관리자 접근 제어 | 임의 코드 실행, 비밀값 로그 |
| ai/ | 역할 정의, 프롬프트, 입·출력 스키마, 정책, 평가 케이스 | 독립 서버 실행 |
| topics/ | 주제별 데이터(JSON만) | 실행 코드 포함(스키마가 거부) |

## 데이터 흐름

**기본**: UI → `POST /api/scenarios/compare {clientId, scenarios}` → `finance::comparison::compare` → `projections::project`(월 루프) → rows·summary·warnings → 차트.
고객 편집 중에는 `client`를 인라인으로 보내 저장 전 결과를 계산한다.

**분석**: `POST /api/analysis` → `compute_metrics`(지표 레지스트리) → `evaluate_rules`(공통 base_rules + 주제 rules) → 인사이트(source=`rule_engine`) → 질문이 있으면 `copilot_answer`.

**검증**: `POST /api/verification` → 주장별로 (필요 시 주제 프리셋 시나리오로) 재계산 → `verify_claim`(허용 오차 비교) → 인간 검토 기록과 결합 → `displayStatus`.

**아이디어**: Studio → `/ideas/analyze` → `/ideas/generate`(topic_versions에 draft 저장 + 자동 검증) → `/ideas/:id/preview`(활성 주제 불변) → `/ideas/:id/activate`(재검증 → 이전 활성 버전을 롤백 스택에 push) → `/ideas/rollback`.

## 저장 모델 (SQLite)
`clients`, `scenarios`, `action_plans`, `review_records`(JSON 문서), `topic_versions`(불변 버전), `app_state`(`active_version_id`, `activation_history`, `activation_log`). 프리셋은 시작 시 파일에서 동기화되며 생성 버전은 덮어쓰지 않는다.

## 주제별 확장 방식
1. **데이터만으로 가능한 변경**: `topics/<id>/*.json` 수정(콘텐츠, 캔버스, 프리셋, KPI, 규칙, AI 초안 주장) — 서버 재시작 시 반영·검증.
2. **런타임(방식 B)**: Idea Studio에서 생성 — 허용 목록(시각화 6종, 모듈 5종, 차트 6종, 노드 8종, 아이콘·모티프, 지표 레지스트리) 내에서만 조합.
3. **개발(방식 A)**: 새 계산이 필요하면 `backend/src/finance/<module>.rs` 추가 + 지표를 `METRIC_DEFS`에 등록 + 테스트 → `ModuleId`에 추가 → 프리셋에서 참조. 예: `finance::business`(전염), `finance::care`(돌봄 충격).

## 프론트엔드 구조
`app/`(App, router, BootProvider) · `components/{layout,ui,charts,canvas,financial}` · `pages/*` 9개 · `features/{clients,topics,verification}` · `services/{api,adapters}` · `stores/app.ts`(Zustand) · `types/api.ts`(Zod) · `styles/globals.css`(토큰). shadcn/ui는 CLI 대신 동일 패턴(cva + 합성 컴포넌트)으로 `components/ui`에 직접 구현했다.
