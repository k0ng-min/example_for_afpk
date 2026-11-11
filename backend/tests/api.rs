//! API 통합 테스트 (인메모리 SQLite). CLAUDE.md §20 테스트 항목을 API 수준에서 검증한다.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use finova::config::Config;
use finova::services::state::build_state;

const ADMIN: &str = "test-admin";

async fn app() -> Router {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let state = build_state(Config::for_tests(root)).await.expect("state");
    finova::api::routes::app(state)
}

async fn call(app: &Router, method: &str, uri: &str, body: Option<Value>, admin: bool) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri).header("content-type", "application/json");
    if admin {
        req = req.header("x-admin-token", ADMIN);
    }
    let req = req.body(body.map(|b| Body::from(b.to_string())).unwrap_or_else(Body::empty)).unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let v = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, v)
}

fn metric(v: &Value, key: &str) -> Value {
    v["metrics"].as_array().unwrap().iter().find(|m| m["key"] == key).unwrap()["value"].clone()
}

async fn calc(app: &Router, client: &str, adj: Value) -> Value {
    let (s, v) = call(app, "POST", "/api/scenarios/calculate", Some(json!({ "clientId": client, "adjustments": adj })), false).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    v
}

#[tokio::test]
async fn health_and_seed_data() {
    let app = app().await;
    let (s, v) = call(&app, "GET", "/api/health", None, false).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["activeTopic"]["topicId"], "shared_workspace");
    assert_eq!(v["ai"]["mode"], "rule_based");
    let (_, clients) = call(&app, "GET", "/api/clients", None, false).await;
    assert_eq!(clients.as_array().unwrap().len(), 5);
}

#[tokio::test]
async fn income_expense_and_debt_changes_update_results() {
    let app = app().await;
    let base = calc(&app, "client_a", json!({})).await;
    assert_eq!(metric(&base, "monthly_surplus"), 1_100_000);

    let more_income = calc(&app, "client_a", json!({ "incomeChange": 100000 })).await;
    assert_eq!(metric(&more_income, "monthly_surplus"), 1_200_000);

    let more_spend = calc(&app, "client_a", json!({ "variableExpenseChange": 200000 })).await;
    assert_eq!(metric(&more_spend, "monthly_surplus"), 900_000);
    assert!(more_spend["projection"]["rows"][12]["cash"].as_i64() < base["projection"]["rows"][12]["cash"].as_i64());

    let prepay = calc(&app, "client_a", json!({ "extraDebtPayment": 100000 })).await;
    let b12 = base["projection"]["rows"][12]["householdDebt"].as_i64().unwrap();
    let p12 = prepay["projection"]["rows"][12]["householdDebt"].as_i64().unwrap();
    assert!(p12 < b12, "추가상환 시 12개월 차 잔액이 더 작아야 함");
    assert!(prepay["projection"]["summary"]["totalInterestPaid"].as_i64() < base["projection"]["summary"]["totalInterestPaid"].as_i64());
}

#[tokio::test]
async fn negative_cashflow_is_warned_not_hidden() {
    let app = app().await;
    let v = calc(&app, "client_a", json!({ "incomeChange": -2500000 })).await;
    assert!(metric(&v, "monthly_surplus").as_i64().unwrap() < 0);
    let warnings = v["projection"]["warnings"].as_array().unwrap();
    assert!(warnings.iter().any(|w| w["code"] == "NEGATIVE_CASHFLOW"));
    assert!(warnings.iter().any(|w| w["code"] == "CASH_DEPLETED"));
    assert!(v["projection"]["rows"][36]["cash"].as_i64().unwrap() < 0, "음수 현금을 0으로 숨기지 않음");

    let (_, a) = call(&app, "POST", "/api/analysis", Some(json!({ "clientId": "client_a", "adjustments": { "incomeChange": -2500000 } })), false).await;
    assert!(a["insights"].as_array().unwrap().iter().any(|i| i["id"] == "base_negative_cashflow"));
}

#[tokio::test]
async fn scenario_duplicate_is_independent() {
    let app = app().await;
    let (_, list) = call(&app, "GET", "/api/clients/client_a/scenarios", None, false).await;
    let original = list[0].clone();
    let (s, mut copy) = call(&app, "POST", &format!("/api/scenarios/{}/duplicate", original["id"].as_str().unwrap()), None, false).await;
    assert_eq!(s, StatusCode::OK);
    assert_ne!(copy["id"], original["id"]);
    copy["incomeChange"] = json!(500000);
    let (s, _) = call(&app, "PUT", &format!("/api/scenarios/{}", copy["id"].as_str().unwrap()), Some(copy.clone()), false).await;
    assert_eq!(s, StatusCode::OK);
    let (_, list2) = call(&app, "GET", "/api/clients/client_a/scenarios", None, false).await;
    let orig2 = list2.as_array().unwrap().iter().find(|x| x["id"] == original["id"]).unwrap();
    assert_eq!(orig2["incomeChange"], original["incomeChange"], "원본은 변경되지 않아야 함");
    let (s, _) = call(&app, "DELETE", &format!("/api/scenarios/{}", copy["id"].as_str().unwrap()), None, false).await;
    assert_eq!(s, StatusCode::OK);
}

#[tokio::test]
async fn goal_change_updates_analysis_and_persists() {
    let app = app().await;
    let (_, mut client) = call(&app, "GET", "/api/clients/client_a", None, false).await;
    let before = calc(&app, "client_a", json!({})).await;
    client["goals"][0]["targetAmount"] = json!(60000000);
    let (s, _) = call(&app, "PUT", "/api/clients/client_a", Some(client.clone()), false).await;
    assert_eq!(s, StatusCode::OK);
    let after = calc(&app, "client_a", json!({})).await;
    assert!(metric(&after, "primary_goal_achieved_month").as_i64() > metric(&before, "primary_goal_achieved_month").as_i64());
    // 저장 후 재조회(재접속 시뮬레이션)
    let (_, reloaded) = call(&app, "GET", "/api/clients/client_a", None, false).await;
    assert_eq!(reloaded["goals"][0]["targetAmount"], 60000000);
    // 초기 데이터 복구
    let (s, _) = call(&app, "POST", "/api/clients/reset", None, false).await;
    assert_eq!(s, StatusCode::OK);
    let (_, restored) = call(&app, "GET", "/api/clients/client_a", None, false).await;
    assert_eq!(restored["goals"][0]["targetAmount"], 30000000);
}

#[tokio::test]
async fn api_errors_are_structured() {
    let app = app().await;
    let (s, v) = call(&app, "GET", "/api/clients/nope", None, false).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert_eq!(v["error"]["code"], "NOT_FOUND");
    let (s, v) = call(&app, "GET", "/api/clients/..%2Fetc", None, false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST, "{v}");
    let (_, mut c) = call(&app, "GET", "/api/clients/client_a", None, false).await;
    c["monthlyIncome"] = json!(-5);
    let (s, v) = call(&app, "PUT", "/api/clients/client_a", Some(c), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"]["code"], "VALIDATION_ERROR");
    let (s, v) = call(&app, "POST", "/api/scenarios/calculate", Some(json!({ "clientId": "client_a", "adjustments": { "hack": 1 } })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"]["code"], "INVALID_JSON");
    let (s, _) = call(&app, "POST", "/api/scenarios/calculate", Some(json!({ "clientId": "client_a", "adjustments": { "horizonMonths": 9999 } })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn verification_statuses_match_evaluation_cases() {
    let app = app().await;
    let (s, _) = call(&app, "POST", "/api/ideas/preset:ai_verification/activate", None, true).await;
    assert_eq!(s, StatusCode::OK);
    let (_, v) = call(&app, "POST", "/api/verification", Some(json!({ "clientId": "client_e" })), false).await;
    let status = |id: &str| v["results"].as_array().unwrap().iter().find(|r| r["claimId"] == id).unwrap()["displayStatus"].clone();
    assert_eq!(status("c_av_surplus"), "error_found");
    assert_eq!(status("c_av_dsr"), "verified");
    assert_eq!(status("c_av_emergency"), "error_found");
    assert_eq!(status("c_av_return"), "insufficient_evidence");
    assert_eq!(status("c_av_interest"), "needs_review");

    // 잘못된 수정값은 '수정 완료'가 되지 않는다
    let (s, _) = call(&app, "PUT", "/api/clients/client_e/reviews/c_av_surplus", Some(json!({ "statement": "x", "decision": "corrected", "correctedValue": 1100000 })), false).await;
    assert_eq!(s, StatusCode::OK);
    let (_, v) = call(&app, "POST", "/api/verification", Some(json!({ "clientId": "client_e" })), false).await;
    let r = v["results"].as_array().unwrap().iter().find(|r| r["claimId"] == "c_av_surplus").unwrap().clone();
    assert_eq!(r["displayStatus"], "error_found");
    // 올바른 수정값은 재검증 후 '수정 완료'
    call(&app, "PUT", "/api/clients/client_e/reviews/c_av_surplus", Some(json!({ "statement": "x", "decision": "corrected", "correctedValue": 1000000 })), false).await;
    let (_, v) = call(&app, "POST", "/api/verification", Some(json!({ "clientId": "client_e" })), false).await;
    let r = v["results"].as_array().unwrap().iter().find(|r| r["claimId"] == "c_av_surplus").unwrap().clone();
    assert_eq!(r["displayStatus"], "corrected");
}

#[tokio::test]
async fn other_topic_claims_match_evaluation_cases() {
    let app = app().await;
    let cases = [
        ("family_commitment", "client_a", "c_fc_surplus", "verified"),
        ("family_commitment", "client_a", "c_fc_ratio", "error_found"),
        ("household_business", "client_b", "c_hb_depleted", "verified"),
        ("care_crisis", "client_c", "c_cc_goal", "error_found"),
        ("care_crisis", "client_c", "c_cc_min", "verified"),
        ("goal_discovery", "client_d", "c_gd_track", "verified"),
    ];
    for (topic, client, claim, expected) in cases {
        call(&app, "POST", &format!("/api/ideas/preset:{topic}/activate"), None, true).await;
        let (_, v) = call(&app, "POST", "/api/verification", Some(json!({ "clientId": client })), false).await;
        let r = v["results"].as_array().unwrap().iter().find(|r| r["claimId"] == claim).unwrap_or_else(|| panic!("{topic}/{claim} missing: {v}")).clone();
        assert_eq!(r["displayStatus"], expected, "{topic}/{claim}: {r}");
    }
}

#[tokio::test]
async fn all_presets_are_valid() {
    let app = app().await;
    let (s, v) = call(&app, "GET", "/api/topics/versions", None, true).await;
    assert_eq!(s, StatusCode::OK);
    let versions = v["versions"].as_array().unwrap();
    assert_eq!(versions.len(), 6);
    for ver in versions {
        let (_, r) = call(&app, "POST", &format!("/api/ideas/{}/validate", ver["id"].as_str().unwrap()), None, true).await;
        assert_eq!(r["validation"]["ok"], true, "{}: {}", ver["id"], r);
    }
}

#[tokio::test]
async fn topic_switch_requires_admin_and_rolls_back() {
    let app = app().await;
    let (s, v) = call(&app, "POST", "/api/ideas/preset:care_crisis/activate", None, false).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    assert_eq!(v["error"]["code"], "ADMIN_REQUIRED");

    let (s, _) = call(&app, "POST", "/api/ideas/preset:care_crisis/activate", None, true).await;
    assert_eq!(s, StatusCode::OK);
    let (_, t) = call(&app, "GET", "/api/topics/active", None, false).await;
    assert_eq!(t["config"]["id"], "care_crisis");
    assert_eq!(t["config"]["signatureVisual"], "care_timeline");
    let (_, clients) = call(&app, "GET", "/api/clients", None, false).await;
    assert_eq!(clients.as_array().unwrap().len(), 5, "주제 전환 후에도 고객 데이터 유지");

    let (s, _) = call(&app, "POST", "/api/ideas/rollback", None, true).await;
    assert_eq!(s, StatusCode::OK);
    let (_, t) = call(&app, "GET", "/api/topics/active", None, false).await;
    assert_eq!(t["config"]["id"], "shared_workspace");
    let (s, _) = call(&app, "POST", "/api/ideas/rollback", None, true).await;
    assert_eq!(s, StatusCode::CONFLICT);
}

#[tokio::test]
async fn idea_generation_preview_activate_and_rollback() {
    let app = app().await;
    let input = json!({ "ideaName": "프리랜서 소득 절벽 대응", "description": "32세 프리랜서 디자이너의 월 소득 280만원이 갑자기 끊기는 위기 상황에서 생활비 160만원과 현금 900만원으로 버티는 기간을 분석한다.", "keyRisks": "수입 공백, 건강 악화", "expectedGoals": "비상자금 1000만원, 장비 교체 300만원" });
    let (s, a) = call(&app, "POST", "/api/ideas/analyze", Some(input.clone()), true).await;
    assert_eq!(s, StatusCode::OK, "{a}");
    assert_eq!(a["analysisMode"], "rule_based");
    assert_eq!(a["extracted"]["age"], 32);
    assert_eq!(a["extracted"]["monthlyIncome"], 2800000);

    let (s, g) = call(&app, "POST", "/api/ideas/generate", Some(json!({ "input": input })), true).await;
    assert_eq!(s, StatusCode::OK, "{g}");
    assert_eq!(g["validation"]["ok"], true, "{g}");
    let vid = g["versionId"].as_str().unwrap().to_string();

    let (s, p) = call(&app, "GET", &format!("/api/ideas/{vid}/preview"), None, true).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(p["config"]["name"], "프리랜서 소득 절벽 대응");
    assert_eq!(p["client"]["monthlyIncome"], 2800000);
    assert!(!p["scenarioPreview"].as_array().unwrap().is_empty());
    // 미리보기는 활성 주제를 바꾸지 않음
    let (_, t) = call(&app, "GET", "/api/topics/active", None, false).await;
    assert_eq!(t["config"]["id"], "shared_workspace");

    let (s, _) = call(&app, "POST", &format!("/api/ideas/{vid}/activate"), None, true).await;
    assert_eq!(s, StatusCode::OK);
    let (_, t) = call(&app, "GET", "/api/topics/active", None, false).await;
    assert_eq!(t["config"]["name"], "프리랜서 소득 절벽 대응");
    let client_id = t["config"]["primaryClientId"].as_str().unwrap().to_string();
    let (s, sc) = call(&app, "GET", &format!("/api/clients/{client_id}/scenarios"), None, false).await;
    assert_eq!(s, StatusCode::OK);
    assert!(!sc.as_array().unwrap().is_empty(), "생성 주제 고객에도 시나리오가 구성되어야 함");
    let v = calc(&app, &client_id, json!({})).await;
    assert!(v["projection"]["rows"].as_array().unwrap().len() > 1);

    let (s, _) = call(&app, "POST", "/api/ideas/rollback", None, true).await;
    assert_eq!(s, StatusCode::OK);
    let (_, t) = call(&app, "GET", "/api/topics/active", None, false).await;
    assert_eq!(t["config"]["id"], "shared_workspace");
    let (_, clients) = call(&app, "GET", "/api/clients", None, false).await;
    assert_eq!(clients.as_array().unwrap().len(), 6, "롤백 후에도 생성 고객 데이터는 보존");
}

#[tokio::test]
async fn invalid_idea_configs_are_rejected() {
    let app = app().await;
    let (s, _) = call(&app, "POST", "/api/ideas/analyze", Some(json!({ "ideaName": "" })), true).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    let (_, p) = call(&app, "GET", "/api/ideas/preset:family_commitment/preview", None, true).await;
    let mut cfg = p["config"].clone();
    cfg["id"] = json!("custom_topic");
    // 1) 계산 엔진에 없는 지표 참조 → 422
    let mut bad = cfg.clone();
    bad["visual"]["kpis"] = json!(["made_up_metric"]);
    let (s, v) = call(&app, "POST", "/api/ideas/import", Some(json!({ "config": bad })), true).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY, "{v}");
    // 2) 스크립트 삽입 → 422
    let mut bad = cfg.clone();
    bad["content"]["heroTitle"] = json!("<script>alert(1)</script>");
    let (s, _) = call(&app, "POST", "/api/ideas/import", Some(json!({ "config": bad })), true).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    // 3) 허용 목록 밖 시각화 → 400
    let mut bad = cfg.clone();
    bad["signatureVisual"] = json!("custom_js_widget");
    let (s, _) = call(&app, "POST", "/api/ideas/import", Some(json!({ "config": bad })), true).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    // 4) 알 수 없는 필드(코드 삽입 시도) → 400
    let mut bad = cfg.clone();
    bad["onLoad"] = json!("fetch('/x')");
    let (s, _) = call(&app, "POST", "/api/ideas/import", Some(json!({ "config": bad })), true).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    // 5) 끊어진 캔버스 연결 → 422
    let mut bad = cfg.clone();
    bad["canvas"]["edges"][0]["target"] = json!("ghost");
    let (s, _) = call(&app, "POST", "/api/ideas/import", Some(json!({ "config": bad })), true).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    // 6) 정상 구성은 가져오기 성공
    let (s, v) = call(&app, "POST", "/api/ideas/import", Some(json!({ "config": cfg })), true).await;
    assert_eq!(s, StatusCode::OK, "{v}");
}

#[tokio::test]
async fn copilot_refuses_unsupported_questions() {
    let app = app().await;
    let (_, v) = call(&app, "POST", "/api/analysis", Some(json!({ "clientId": "client_a", "question": "연말정산 세금 환급은 얼마인가요?" })), false).await;
    assert_eq!(v["answer"]["supported"], false);
    let (_, v) = call(&app, "POST", "/api/analysis", Some(json!({ "clientId": "client_a", "question": "매월 얼마나 남나요?" })), false).await;
    assert_eq!(v["answer"]["supported"], true);
    assert!(v["answer"]["text"].as_str().unwrap().contains("1,100,000원"));
}

#[tokio::test]
async fn action_plan_status_persists() {
    let app = app().await;
    let (_, v) = call(&app, "GET", "/api/clients/client_a/actions", None, false).await;
    assert_eq!(v["saved"], false);
    let mut items = v["items"].clone();
    items[0]["status"] = json!("done");
    let (s, _) = call(&app, "PUT", "/api/clients/client_a/actions", Some(items), false).await;
    assert_eq!(s, StatusCode::OK);
    let (_, v) = call(&app, "GET", "/api/clients/client_a/actions", None, false).await;
    assert_eq!(v["saved"], true);
    assert_eq!(v["items"][0]["status"], "done");
    let mut bad = v["items"].clone();
    bad[0]["status"] = json!("hacked");
    let (s, _) = call(&app, "PUT", "/api/clients/client_a/actions", Some(bad), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

// ── 최종 아이디어: CPA 유예생 소득 공백 ──

#[tokio::test]
async fn cpa_analyze_reproduces_proposal_baseline() {
    let app = app().await;
    let (s, d) = call(&app, "GET", "/api/cpa/defaults", None, false).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(d["cash0"], 14_000_000);
    assert_eq!(d["jobWage"], 2_700_000, "기본값은 조사 자료 기반 임금");
    assert_eq!(d["traineeSalary"], 3_200_000);
    // 기획서 기준선은 임금 미입력 가정
    let pdf = json!({ "jobWage": null, "traineeSalary": null, "cpaSalary": null });
    let (s, v) = call(&app, "POST", "/api/cpa/analyze", Some(pdf), false).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let path = |k: &str| v["short"].as_array().unwrap().iter().find(|p| p["strategy"] == k).unwrap().clone();
    assert_eq!(path("A")["tau"], "2027-10");
    assert_eq!(path("A")["tauCash"], 2_800_000);
    assert_eq!(path("B")["endCash"], 8_450_000);
    assert_eq!(path("D")["tau"], "2028-04");
    assert_eq!(v["long"]["available"], false);
    assert_eq!(v["balanceSheet"]["liquid"], 14_000_000);
}

#[tokio::test]
async fn cpa_inputs_change_results() {
    let app = app().await;
    let (_, base) = call(&app, "POST", "/api/cpa/analyze", Some(json!({})), false).await;
    let (_, more) = call(&app, "POST", "/api/cpa/analyze", Some(json!({ "living": 1_500_000 })), false).await;
    let end = |v: &Value| v["short"][0]["endCash"].as_i64().unwrap();
    assert_eq!(end(&base) - end(&more), 300_000 * 18);
}

#[tokio::test]
async fn cpa_rejects_invalid_or_unknown_inputs() {
    let app = app().await;
    let (s, v) = call(&app, "POST", "/api/cpa/analyze", Some(json!({ "cash0": -5, "pPct": 300 })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"]["code"], "VALIDATION_ERROR");
    let (s, _) = call(&app, "POST", "/api/cpa/analyze", Some(json!({ "hack": 1 })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call(&app, "POST", "/api/cpa/analyze", Some(json!({ "examMonth": "2027-13" })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn cpa_experiments_and_screening() {
    let app = app().await;
    let (s, v) = call(&app, "GET", "/api/cpa/experiments", None, false).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["experiments"].as_array().unwrap().len(), 8);
    assert!(v["ai"]["configured"].is_boolean());
    let (s, f) = call(&app, "POST", "/api/cpa/ai/screen", Some(json!({ "experimentId": "E1", "output": "유예생 합격률이 61%이므로 이 고객의 합격 확률은 61%입니다." })), false).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(f["flags"].as_array().unwrap().len(), 1);
    let (s, _) = call(&app, "POST", "/api/cpa/ai/screen", Some(json!({ "experimentId": "../x", "output": "a" })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = call(&app, "POST", "/api/cpa/ai/screen", Some(json!({ "experimentId": "E9", "output": "a" })), false).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn cpa_ask_rule_answers_and_scope_guard() {
    let app = app().await;
    let (s, v) = call(&app, "POST", "/api/cpa/ask", Some(json!({ "questionId": "floor" })), false).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["mode"], "rule");
    assert!(v["rule"]["answer"].as_str().unwrap().contains("2027.10"));
    let (_, v) = call(&app, "POST", "/api/cpa/ask", Some(json!({ "questionId": "supportCut" })), false).await;
    assert!(v["rule"]["facts"].as_array().unwrap().len() >= 4);
    let (_, v) = call(&app, "POST", "/api/cpa/ask", Some(json!({ "question": "제가 합격할 수 있을까요? 합격 확률 알려주세요" })), false).await;
    assert_eq!(v["rule"]["outOfScope"], true);
    let (s, _) = call(&app, "POST", "/api/cpa/ask", Some(json!({ "questionId": "nope" })), false).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn cpa_icl_uses_official_threshold() {
    let app = app().await;
    let (s, v) = call(&app, "POST", "/api/cpa/icl", Some(json!({ "grossAnnual": 45_000_000, "incomeYear": 2025 })), false).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["annualObligation"], 2_804_000);
    assert_eq!(v["thresholdConfirmed"], true);
    let (s, _) = call(&app, "POST", "/api/cpa/icl", Some(json!({ "grossAnnual": 1, "incomeYear": 2025, "rateBps": 3000 })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn cpa_explore_returns_sensitivity_and_supports() {
    let app = app().await;
    let (s, v) = call(&app, "POST", "/api/cpa/explore", Some(json!({})), false).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["sensitivity"]["runwayBase"], 10);
    assert_eq!(v["sensitivity"]["rows"].as_array().unwrap().len(), 6);
    assert_eq!(v["supports"]["options"].as_array().unwrap().len(), 3);
    assert!(v["supports"]["options"].as_array().unwrap().iter().all(|o| o["verified"] == false));
    let flows = json!({ "extraFlows": [{ "from": "2027-05", "months": 6, "amount": 500000, "label": "test" }] });
    let (s, a) = call(&app, "POST", "/api/cpa/analyze", Some(flows), false).await;
    assert_eq!(s, StatusCode::OK, "{a}");
    let (s, _) = call(&app, "POST", "/api/cpa/analyze", Some(json!({ "extraFlows": [{ "from": "2027-05", "months": 0, "amount": 1 }] })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn cpa_checkin_and_explore_extras() {
    let app = app().await;
    let (s, v) = call(&app, "POST", "/api/cpa/explore", Some(json!({})), false).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["fans"].as_array().unwrap().len(), 4);
    assert_eq!(v["stress"]["cases"].as_array().unwrap().len(), 6);
    let body = json!({ "strategy": "D", "entries": [{ "month": "2027-01", "cash": 13000000 }, { "month": "2027-02", "cash": 7000000 }] });
    let (s, c) = call(&app, "POST", "/api/cpa/checkin", Some(body), false).await;
    assert_eq!(s, StatusCode::OK, "{c}");
    assert_eq!(c["rows"][1]["level"], "signal1");
    assert_eq!(c["reprojection"]["from"], "2027-03");
    let (s, _) = call(&app, "POST", "/api/cpa/checkin", Some(json!({ "strategy": "D", "entries": [{ "month": "2020-01", "cash": 1 }] })), false).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}
