//! 취업 후 상환 학자금대출(ICL) 의무상환액 계산 — 국세청 기준(공식 확인값만 사용).
//!
//! 의무상환액(연) = max(0, 근로소득금액 − 상환기준소득) × 상환율
//! 근로소득금액 = 총급여 − 근로소득공제(소득세법 제47조)
//! 원천공제: 귀속연도 다음 해 7월 ~ 그다음 해 6월, 12개월 균등(원 단위 반올림)
//!
//! 확인값: 2025년 귀속 상환기준소득 1,898만 원(총급여 2,851만 원 상당), 2024년 귀속 1,752만 원.
//! 출처: 국세청 보도자료(2026.04.20.) [S4]. 그 밖의 귀속연도는 기준이 공표되지 않아 최신 확인값을 대용하고 `thresholdConfirmed=false` 로 알린다.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::finance::rounding::round_won;

/// (귀속연도, 상환기준소득) — 공식 확인된 값만
pub const THRESHOLDS: [(i32, i64); 2] = [(2024, 17_520_000), (2025, 18_980_000)];

/// 근로소득공제(연, 원). 한도 2,000만 원
pub fn earned_income_deduction(gross: i64) -> i64 {
    let g = Decimal::from(gross.max(0));
    let d = |v: i64| Decimal::from(v);
    let pct = |n: i64| Decimal::from(n) / Decimal::from(100);
    let v = if gross <= 5_000_000 {
        g * pct(70)
    } else if gross <= 15_000_000 {
        d(3_500_000) + (g - d(5_000_000)) * pct(40)
    } else if gross <= 45_000_000 {
        d(7_500_000) + (g - d(15_000_000)) * pct(15)
    } else if gross <= 100_000_000 {
        d(12_000_000) + (g - d(45_000_000)) * pct(5)
    } else {
        d(14_750_000) + (g - d(100_000_000)) * pct(2)
    };
    round_won(v).min(20_000_000)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IclRequest {
    /// 귀속연도 총급여(세전, 연)
    pub gross_annual: i64,
    pub income_year: i32,
    /// 상환율(bp): 대학생 대출 2000, 대학원생 대출 2500
    #[serde(default = "default_rate")]
    pub rate_bps: i64,
}
fn default_rate() -> i64 {
    2000
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IclResult {
    pub gross_annual: i64,
    pub deduction: i64,
    pub earned_income: i64,
    pub threshold: i64,
    pub threshold_year: i32,
    pub threshold_confirmed: bool,
    pub rate_bps: i64,
    pub annual_obligation: i64,
    pub monthly_withholding: i64,
    /// 원천공제 시작(귀속연도+1년 7월), "YYYY-MM"
    pub withholding_from: String,
}

pub fn obligation(r: &IclRequest) -> IclResult {
    let (ty, th) = THRESHOLDS.iter().copied().find(|(y, _)| *y == r.income_year).unwrap_or(THRESHOLDS[THRESHOLDS.len() - 1]);
    let deduction = earned_income_deduction(r.gross_annual);
    let earned = (r.gross_annual - deduction).max(0);
    let annual = round_won(Decimal::from((earned - th).max(0)) * Decimal::from(r.rate_bps) / Decimal::from(10_000));
    IclResult {
        gross_annual: r.gross_annual,
        deduction,
        earned_income: earned,
        threshold: th,
        threshold_year: ty,
        threshold_confirmed: ty == r.income_year,
        rate_bps: r.rate_bps,
        annual_obligation: annual,
        monthly_withholding: round_won(Decimal::from(annual) / Decimal::from(12)),
        withholding_from: format!("{:04}-07", r.income_year + 1),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threshold_gross_maps_to_threshold_income() {
        // 국세청: 2025 귀속 총급여 2,851만 원 ≈ 상환기준소득 1,898만 원
        let r = obligation(&IclRequest { gross_annual: 28_510_000, income_year: 2025, rate_bps: 2000 });
        assert_eq!(r.deduction, 9_526_500);
        assert_eq!(r.earned_income, 18_983_500);
        assert_eq!(r.annual_obligation, 700); // 기준을 3,500원 넘은 만큼의 20%
        assert!(r.threshold_confirmed);
        assert_eq!(r.withholding_from, "2026-07");
    }

    #[test]
    fn below_threshold_pays_nothing_and_unknown_year_is_flagged() {
        let r = obligation(&IclRequest { gross_annual: 20_000_000, income_year: 2027, rate_bps: 2000 });
        assert_eq!(r.annual_obligation, 0);
        assert!(!r.threshold_confirmed);
        assert_eq!(r.threshold_year, 2025);
        let r = obligation(&IclRequest { gross_annual: 45_000_000, income_year: 2025, rate_bps: 2000 });
        // 공제 750만 + 3,000만×15% = 1,200만 → 소득금액 3,300만 − 1,898만 = 1,402만 × 20%
        assert_eq!(r.annual_obligation, 2_804_000);
        assert_eq!(r.monthly_withholding, 233_667);
    }

    #[test]
    fn deduction_is_capped() {
        assert_eq!(earned_income_deduction(1_000_000_000), 20_000_000);
        assert_eq!(earned_income_deduction(4_000_000), 2_800_000);
    }
}
