# ADAPTIVE_IDEA_ENGINE

## 아이디어 입력 방식
Idea Configuration Studio(관리자 전용). 필수: 아이디어명(≤80자). 권장: 자유형 설명(≤4000자). 선택 10개: 핵심 문제, 대상 고객, 재무문제, AI 역할, 필요 데이터, 예상 목표(쉼표 구분, "1,000만원" 표기 가능), 주요 위험, 원하는 기능, 참고 자료, 추가 설명. 기존 5개 후보는 카드로 선택(프리셋 버전 미리보기).

## 자동 분석 파이프라인 (`backend/src/domain/adaptive_ideas`)
| STEP | 구현 | 비고 |
|---|---|---|
| 1 Idea Understanding | 5개 유형 키워드 점수 + 5개 차원(관계·시간·변화·선택·검증) 점수, 문제·고객·목표·위험 추출, 나이·소득·생활비·현금·부채·가족지원 수치 추출(문장 경계 인식) | 규칙 기반, 신뢰도 low/medium/high 표시 |
| 2 Requirements Mapping | 6단계 → 화면 매핑, 기능 지원 범위(supported / requires_development) | 세금·연금·보험·확률·포트폴리오·주택금융 규정·외부 데이터·이미지 생성은 개발 필요로 분류 |
| 3 Data Schema | 기본 유형의 `inputSchema` 재사용 | 새 필드는 확장 스키마로만 |
| 4 Synthetic Case | 기본 유형 대표 고객 복제 + 추출 수치 적용 → `validate_client` 실패 시 기본 수치로 복귀 | 통계·실제 사례 아님을 assumptions에 기록 |
| 5 Financial Logic | 기존 모듈만 연결(core_cashflow, goal_priority, business_contagion, care_shock, claim_verification). 시간 중심이면 `finance::care::care_events`로 위기 시나리오 생성 | LLM 생성 수식 실행 없음 |
| 6 AI Configuration | 기본 유형 에이전트 바인딩 + idea_configurator 추가 | critic 필수 |
| 7 Visual Configuration | 우세 차원 → 시각화(관계=그래프, 시간=타임라인, 변화=시뮬레이션, 선택=의사결정 비교, 검증=워크플로) | 사업 프로필 없으면 전염 지도 불가 |
| 8 Content | 히어로·소개(초안 고지)·문제·질문(위험/목표 기반)·6단계·보고서 제목·실행 템플릿 | 확인되지 않은 제도·통계 미생성 |
| 9 Visual Asset | 시각화별 액센트·아이콘·SVG 모티프(허용 목록) | 이미지 생성 도구 미연결 → SVG 대체 |
| 10 Validation | `validate_topic`: 스키마·텍스트 안전성, 캔버스 연결, 지표 참조, 차트·모듈 정합, 콘텐츠·보고서, AI 역할, 고객·시나리오 계산 가능 | 7개 체크 |
| 11 Preview | `/ideas/:id/preview` — 대표 고객으로 모든 프리셋 계산, KPI·추이·구성 표시 | 활성 주제 불변 |
| 12 Apply | `/ideas/:id/activate` — 재검증 후 적용, 이전 활성 버전을 롤백 스택에 백업, 생성 고객은 추가만 | `/ideas/rollback` |

## 미리보기·적용·롤백
버전은 `topic_versions`에 불변으로 저장(덮어쓰기 없음). 적용 로그(`activation_log`)와 롤백 스택(`activation_history`, 최대 50)을 `app_state`에 보관. "설정 백업"은 전체 버전·로그·고객을 JSON으로 내려받는다. 주제 전환·롤백·초기 데이터 복구 모두 고객 데이터를 삭제하지 않는다(생성 고객은 초기화 후 재삽입).

## 두 가지 실행 방식
- **B 런타임(구현됨)**: 위 파이프라인. 허용 목록과 검증된 스키마만 사용.
- **A 개발(Claude Code)**: 미리보기의 "JSON 내보내기" → `topics/<id>/`로 분리 → `loader.rs` PRESETS 등록 → 필요한 Rust 모듈·지표 추가 → `cargo test`.

## 지원 범위와 제한사항
- 분석은 키워드·패턴 기반이라 표현이 다르면 유형을 놓칠 수 있다(신뢰도·일치 키워드를 공개). LLM 기반 이해는 P2.
- 새로운 계산식·차트 유형·노드 유형은 런타임에서 만들 수 없다.
- 생성 콘텐츠는 초안이며 제출 전 사람이 검토해야 한다(면책 문구 자동 포함).
- 가져오기(`/ideas/import`)도 동일 검증을 거치며, 프리셋 id 덮어쓰기는 거부한다.
