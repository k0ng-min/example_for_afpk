# pipeline: verification

주장[] → (scenarioPreset 시 해당 조정으로) project → compute_metrics → verify_claim(허용 오차) → 인간 판결(review_records) 결합 → displayStatus

구현은 Rust 백엔드에 있으며, LLM 연동(P2) 시에도 동일한 검증 단계를 통과해야 한다.
