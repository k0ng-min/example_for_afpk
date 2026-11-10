# REQUIREMENTS — 화면·기능·사용자 흐름·완료 조건

표기: ✅ 구현·검증됨, ◐ 부분 구현, ✗ 미구현

## 사용자 흐름
고객 선택 → (2) Client Profile에서 정보·목표 확인/수정 → (3) AI Canvas·Copilot으로 상태 분석·위험 발견 → (4) Scenario Lab에서 대안 생성·비교 → Verification Lab에서 AI 주장 검증·판결 → (5) Action Planner 실행 관리 → (6) Report Studio 보고서·점검 계획.
모든 화면은 같은 고객 데이터(Zustand `clientId` + 서버 저장)를 사용하고, 저장 시 `revision` 증가로 의존 화면이 재계산된다.

## 화면별 요구사항

| 화면 | 요구사항 | 상태 | 구현 위치 |
|---|---|---|---|
| Intelligence Home | 현재 고객, 핵심 지표(주제 KPI), 목표 진행, 주요 위험, AI 인사이트, 최근 분석, 6단계 진행 | ✅ | `pages/Dashboard` |
| Client Profile | 나이·직업·소득·고정/변동지출·가족지원·자산·부채(이자율)·가족 상황·목표 편집, 저장 전 즉시 계산, 초기 데이터 복구 | ✅ | `pages/ClientProfile` |
| AI Reasoning Canvas | 8개 노드 유형, 선택·이동·확대/축소, 상세 패널(계산식·입력), 연결 강조, 주제별 기본 배치, 실시간 탐지 위험 노드 | ✅ | `pages/ReasoningCanvas` |
| Scenario Lab | 생성·복제·삭제, 소득·지출·부채 상환·가족지원·투자·매출 변경, 미래 이벤트, 목표 변경(프리셋), 결과 비교 + 6종 차트 | ✅ | `pages/ScenarioLab` |
| AI Copilot | 고객 데이터 연결 질의응답, 지원하지 않는 질문 거절, 인용 지표 표시, 역할·프롬프트 공개 | ✅(규칙 기반) | `pages/AICopilot` |
| Verification Lab | 주장·입력·계산식·출처·방법·오류·수정 결과·인간 검토, 5개 상태 | ✅ | `pages/VerificationLab` |
| Action Planner | 항목·우선순위·목표 날짜·금액·상태·재점검 조건, 저장 | ✅ | `pages/ActionPlanner` |
| Report Studio | 9개 섹션(주제별 제목), 섹션 선택, 브라우저 인쇄 PDF | ✅ | `pages/ReportStudio` |
| Idea Configuration Studio | 관리자 인증, 후보 선택, 아이디어 입력, 분석 결과, 자동 구성 상태, 미리보기, 그래픽 설정, 데이터 생성 결과, 검증, 적용·되돌리기, 백업·JSON 내보내기/가져오기 | ✅ | `pages/IdeaConfigurationStudio` |

## 기능 요구사항(§15 실제 인터랙션)

| 기능 | 상태 | 검증 |
|---|---|---|
| 고객 선택 / 수정 / 목표 추가·삭제 | ✅ | API 테스트 `goal_change_updates_analysis_and_persists`, 브라우저 수동 |
| 시나리오 생성·복제 / 슬라이더 / 차트 갱신 | ✅ | `scenario_duplicate_is_independent`, E2E(슬라이더 → 110만→140만) |
| 캔버스 이동·확대 / 노드 선택 | ✅ | E2E(노드 클릭 → 상세 패널) |
| AI 분석 실행 / 검증 결과 확인 | ✅ | `copilot_refuses_unsupported_questions`, `verification_statuses_match_evaluation_cases` |
| 실행 계획 상태 변경 / 저장 | ✅ | `action_plan_status_persists` |
| 보고서 미리보기 | ✅ | E2E(9개 섹션 렌더) |
| 데이터 저장 / 초기 데이터 복구 | ✅ | SQLite + `/clients/reset` 테스트 |
| 아이디어 선택 / 미리보기 / 주제 활성화 / 이전 주제 복원 | ✅ | `idea_generation_preview_activate_and_rollback`, E2E |

## 완료 조건
입력값과 무관한 하드코딩 그래프가 없어야 한다 — 모든 차트는 `/api/scenarios/compare|calculate` 결과 `rows`만 사용한다(`components/charts`).
