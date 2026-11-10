# pipeline: adaptive_idea

IdeaInput 검증 → analyze(STEP1-2) → generate(STEP3-9, 허용 모듈만) → validate_topic(STEP10) → preview(STEP11) → activate/rollback(STEP12)

구현은 Rust 백엔드에 있으며, LLM 연동(P2) 시에도 동일한 검증 단계를 통과해야 한다.
