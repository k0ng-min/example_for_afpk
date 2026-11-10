# pipeline: client_analysis

고객 데이터 → compute_metrics → evaluate_rules(base_rules + 주제 rules) → Insight(source=rule_engine) → (질문 시) copilot_answer

구현은 Rust 백엔드에 있으며, LLM 연동(P2) 시에도 동일한 검증 단계를 통과해야 한다.
