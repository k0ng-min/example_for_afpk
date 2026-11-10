# TOPIC_MODULES — 5개 후보와 공통 연결

**최종 주제는 선택하지 않았다.** 기본 활성은 `shared_workspace`(공통 워크스페이스, 주제 미확정).

## 파일 구조 (각 주제 공통)
`topic.json`(정체성·모듈·에이전트·개발 필요 항목) · `input_schema.json`(확장 입력) · `canvas_config.json` · `scenario_presets.json` · `visual_config.json` · `content.json`(히어로·질문·6단계·보고서·실행 템플릿) · `verification_rules.json`(분석 규칙·체크리스트·AI 초안 주장) · `README.md`. 공통 규칙은 `topics/shared/base_rules.json`.

## 후보 요약

| | 약속의 방화벽 | 가계·사업 전염 방화벽 | 돌봄 시작 72시간 | 목표 반증 인터뷰 | AI 재무설계 심사법정 |
|---|---|---|---|---|---|
| id | family_commitment | household_business | care_crisis | goal_discovery | ai_verification |
| 문제 | 가족 부양 vs 주거 독립·경력 | 사업 위험의 가계 전파 | 돌봄으로 소득↓·비용↑ | 처음 목표 ≠ 실제 우선순위 | AI 설계안의 오류·근거 부족 |
| 대표 고객 | A 27세 (세후 320만, 지원 50만) | B 34세 카페 (가계 400만, 운영자금 1,500만, 사업부채 2,000만) | C 29세 (300만 → 230만, 돌봄비 45만) | D 31세 (380만, 목표 3개) | E 26세 (270만, 카드론 400만) |
| 입력 확장 | 지원 상한, 지원 가족 수 | 운영자금 목표 개월 | 주당 돌봄 시간, 시작 월 | 인터뷰 회차 | 심리 주장 수 |
| 분석 규칙 | 지원 비율 >15%, 기한 내 목표 <2 | 전염액 >0, 사업 현금 소진 | 저축률 <5%, 최저 현금 <300만 | 기한 내 목표 <3 | 기간 이자 >50만 |
| 전용 시각화 | Commitment Graph(소득 배분 흐름 + 시나리오별 목표 시점) | Contagion Map(사업→가계 경로, 선 두께=전염액) | Care Crisis Timeline(현금 추이 + 위기 대응 구간) | Goal Discovery(목표×우선순위 시나리오 행렬) | Verification Court(주장→계산→오류→근거→판결) |
| 계산 모듈 | core_cashflow, goal_priority | + **business_contagion** (`finance::business`) | + **care_shock** (`finance::care`) | core, goal_priority(시나리오 goals 재정의) | + **claim_verification** (`services::verification`) |
| 시나리오 프리셋 | 유지 / 상한 40만 / 경력 우선 / 6개월 후 이직 | 유지 / −20% / −20%+방화벽 / −30%+절감 | 미발생 / 3개월 차 발생 / 휴직 후 단축 / 분담+절감 | 처음 순서 / 자동차 우선 / 결혼 우선 / 자동차 포기 | 유지 / AI 초안 / 수정안 / 균형안 |

## 공통 기능 연결
모든 주제가 같은 화면·엔진·저장소를 쓴다. 주제가 바꾸는 것: 제품명, 히어로·소개, 대표 고객, 분석 질문, 6단계 설명, KPI, 캔버스 노드·관계, 시나리오 프리셋, 전용 시각화, 액센트·아이콘·모티프, 규칙, 체크리스트, AI 초안 주장, 실행 템플릿, 보고서 제목·섹션. 바뀌지 않는 것: 레이아웃, 공통 컴포넌트, 디자인 토큰, 계산 엔진.

## 최종 주제 전환 방법
1. 앱 → Idea Studio → 관리자 토큰 입력
2. **기존 후보**: 카드 선택 → 미리보기·검증 결과 확인 → "승인하고 적용"
3. **새 아이디어**: 아이디어명 + 설명 입력 → "구성 생성 · 미리보기" → 개발 필요 항목 확인 → 적용
4. 되돌리기: "이전 주제로 되돌리기"(스택), 전체 백업: "설정 백업"
5. 제출용으로 고정하려면 확정 주제의 JSON을 다듬고, 필요하면 `loader.rs`의 `DEFAULT_TOPIC_ID`를 해당 id로 바꾼다(방식 A).
