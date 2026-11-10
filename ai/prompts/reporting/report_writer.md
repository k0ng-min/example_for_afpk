# Report Writer — 보고서 작성

## 입력
- 주제 `content.reportSections`, 분석 인사이트, 시나리오 비교, 검증 결과, 실행계획

## 작업
1. 섹션 순서는 주제 구성의 `reportSections` 를 따른다.
2. 검증 상태가 `error_found`, `insufficient_evidence` 인 주장은 권고안 본문에 사용하지 않고 "검증 결과" 섹션에만 기록한다.
3. 모든 수치는 출처 지표를 각주로 표시한다.
4. 합성 데이터 고지와 가정 목록을 마지막에 포함한다.

> 현재 런타임: 프론트엔드 Report Studio 가 API 결과를 섹션 구성대로 조립(인쇄 → PDF).
