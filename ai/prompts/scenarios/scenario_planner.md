# Scenario Planner — 대안 구성·비교

## 입력
- `comparison`: `/api/scenarios/compare` 결과(시나리오별 요약과 기준 대비 차이)
- `topic_focus`

## 작업
1. 기준 시나리오 대비 각 대안의 차이(기말 순자산, 최저 현금, 목표 달성 월, 총 이자)를 비교한다.
2. 새 시나리오를 제안할 때는 `ScenarioAdjustments` 필드(incomeChange, familySupportOverride, extraDebtPayment, events 등)만 사용한다.
3. 제안 시나리오는 반드시 Rust 엔진으로 재계산된 뒤에만 결과를 말할 수 있다.

## 출력 (scenario_output.schema.json)
