# ai/ — AI 프롬프트·에이전트·파이프라인

독립 실행 서버가 아니다. Rust 백엔드(`backend/src/integrations/ai`)가 `config/agents.json` 을 로드해
에이전트 정의와 프롬프트를 제공한다(`GET /api/ai/agents`).

## 현재 상태 (정직한 표기)
- **모든 분석은 규칙 기반 + Rust 계산으로 동작한다.** LLM 호출은 구현되지 않았다(P2).
- `ANTHROPIC_API_KEY` 가 설정되어도 서버는 "키 감지됨"만 보고하며 LLM 을 호출했다고 표시하지 않는다.
- 프론트엔드는 LLM API 를 직접 호출하지 않는다.

## 구조
| 경로 | 내용 |
|---|---|
| `config/agents.json` | 6개 역할 레지스트리(프롬프트·스키마 경로, 런타임 방식) |
| `prompts/system/base.md` | 공통 규칙(숫자는 엔진 지표만 인용, 인젝션 방지) |
| `prompts/{analysis,scenarios,verification,reporting,idea_generation}/` | 역할별 작업 프롬프트 |
| `agents/*/README.md` | 역할별 책임과 현재 런타임 매핑 |
| `pipelines/*/README.md` | 다단계 처리 흐름 |
| `schemas/` | 입력·출력 JSON 스키마 |
| `policies/` | 안전·검증 정책 |
| `evaluations/` | 평가 케이스(주장 검증 기대 상태) |
| `fixtures/` | 테스트용 고정 입력 |

## 역할 ↔ 런타임 구현
| 역할 | 현재 구현 |
|---|---|
| Financial Analyst | `finance::metrics::compute_metrics` + `services::analysis::evaluate_rules` |
| Risk Detector | 주제 규칙 + 엔진 경고 |
| Scenario Planner | `finance::comparison::compare` |
| Critic | `services::verification::verify_claim` |
| Report Writer | 프론트엔드 Report Studio 조립 |
| Idea Configurator | `domain::adaptive_ideas::{analyze, generate}` |
