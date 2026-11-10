//! AI 주장 검증: 주장 값을 Rust 엔진 독립 계산값과 비교한다.
//! 실제 비교를 수행하지 않은 주장은 절대 '검증 완료'가 되지 않는다.

use serde::{Deserialize, Serialize};

use crate::finance::metrics::{Metric, MetricInput, Unit};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    /// 검증 완료
    Verified,
    /// 검토 필요
    NeedsReview,
    /// 근거 부족
    InsufficientEvidence,
    /// 오류 발견
    ErrorFound,
    /// 수정 완료 (사람의 수정 기록이 있을 때만)
    Corrected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClaimInput {
    pub id: String,
    pub statement: String,
    #[serde(default)]
    pub metric: Option<String>,
    #[serde(default)]
    pub claimed_value: Option<i64>,
    #[serde(default)]
    pub scenario_preset: Option<String>,
    /// "ai_draft" | "user" | "rule_engine"
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "user".into()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimResult {
    pub claim_id: String,
    pub statement: String,
    pub source: String,
    pub status: VerificationStatus,
    pub metric: Option<String>,
    pub metric_label: Option<String>,
    pub unit: Option<Unit>,
    pub claimed_value: Option<i64>,
    pub computed_value: Option<i64>,
    pub difference: Option<i64>,
    pub tolerance: Option<i64>,
    pub formula: Option<String>,
    pub inputs: Vec<MetricInput>,
    pub scenario_name: String,
    pub method: String,
}

/// 허용 오차: 원 = max(1,000원, 계산값의 1%), bp = 50bp(0.5%p), 0.1개월 = 1, 개월·개수 = 0
pub fn tolerance(unit: Unit, computed: i64) -> i64 {
    match unit {
        Unit::Won => (computed.abs() / 100).max(1_000),
        Unit::Bps => 50,
        Unit::MonthsX10 => 1,
        Unit::Months | Unit::Count => 0,
    }
}

pub fn verify_claim(claim: &ClaimInput, metrics: &[Metric], scenario_name: &str) -> ClaimResult {
    let mut r = ClaimResult {
        claim_id: claim.id.clone(),
        statement: claim.statement.clone(),
        source: claim.source.clone(),
        status: VerificationStatus::InsufficientEvidence,
        metric: claim.metric.clone(),
        metric_label: None,
        unit: None,
        claimed_value: claim.claimed_value,
        computed_value: None,
        difference: None,
        tolerance: None,
        formula: None,
        inputs: vec![],
        scenario_name: scenario_name.to_string(),
        method: String::new(),
    };
    let Some(key) = claim.metric.as_deref() else {
        r.method = "연결된 계산 지표가 없어 자동 검증 불가 — 사람이 근거 자료를 확인해야 합니다".into();
        return r;
    };
    let Some(m) = metrics.iter().find(|m| m.key == key) else {
        r.method = format!("알 수 없는 지표 '{key}' — 계산 엔진에 없는 지표는 검증할 수 없습니다");
        return r;
    };
    r.metric_label = Some(m.label.to_string());
    r.unit = Some(m.unit);
    r.formula = Some(m.formula.to_string());
    r.inputs = m.inputs.clone();
    r.computed_value = m.value;
    match (claim.claimed_value, m.value) {
        (None, _) => {
            r.status = VerificationStatus::NeedsReview;
            r.method = "주장에 비교 가능한 수치가 없습니다. 독립 계산값을 참고해 사람이 판단하세요".into();
        }
        (Some(_), None) => {
            r.status = VerificationStatus::ErrorFound;
            r.method = "독립 계산 결과 해당 사건이 시뮬레이션 기간 내 발생하지 않아 주장과 불일치".into();
        }
        (Some(claimed), Some(computed)) => {
            let tol = tolerance(m.unit, computed);
            let diff = claimed - computed;
            r.difference = Some(diff);
            r.tolerance = Some(tol);
            r.status = if diff.abs() <= tol {
                VerificationStatus::Verified
            } else {
                VerificationStatus::ErrorFound
            };
            r.method = format!("Rust 엔진 독립 재계산값과 비교(허용 오차 ±{tol})");
        }
    }
    r
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewRecord {
    pub claim_id: String,
    pub statement: String,
    /// "pending" | "approved" | "rejected" | "corrected"
    pub decision: String,
    #[serde(default)]
    pub corrected_value: Option<i64>,
    #[serde(default)]
    pub corrected_statement: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub reviewer: String,
    #[serde(default)]
    pub updated_at: String,
}

pub const DECISIONS: &[&str] = &["pending", "approved", "rejected", "corrected"];
