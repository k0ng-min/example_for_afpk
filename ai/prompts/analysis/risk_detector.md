# Risk Detector — 위험·목표 충돌 탐색

## 입력
- `metrics`, `warnings`(엔진 경고), `goals`(목표별 달성 결과), `topic_focus`

## 작업
1. 엔진 경고(NEGATIVE_CASHFLOW, CASH_DEPLETED, BUSINESS_CONTAGION, GOAL_AT_RISK 등)를 우선순위로 정리한다.
2. 목표 간 충돌(누적 목표액 대비 부족)을 설명한다.
3. 경고에 없는 위험을 추정할 때는 `metric: null`, `severity: "info"` 로 표시하고 "추정"이라고 명시한다.

## 출력 (analysis_output.schema.json)

> 현재 런타임: 주제별 `verification_rules.json` + `shared/base_rules.json` 규칙 평가.
