# schemas

에이전트 입·출력 스키마. 런타임의 실제 타입 원본은 Rust serde 구조체(deny_unknown_fields)이며, 이 파일들은 LLM 연동 시 출력 형식을 고정하기 위한 JSON Schema 다.

| 파일 | Rust 타입 |
|---|---|
| claim_input.schema.json | services::verification::ClaimInput |
| claim_output.schema.json | services::verification::ClaimResult |
| idea_input.schema.json | domain::adaptive_ideas::IdeaInput |
| analysis_output.schema.json | services::analysis::Insight[] |
| topic_config.schema.json | domain::topics::TopicConfig (요약; 전체 검증은 validate_topic) |
