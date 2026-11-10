//! 현실 패턴(선택): 실제 가계처럼 달마다 다른 현금흐름을 결정론적으로 만든다.
//!
//! - 달력 월별 변동지출 계절성(bp): 명절·연말·휴가철 지출 증가 등
//! - 연간 정기 유입(상여금·명절상여·연말정산 환급)과 연간 정기 유출(자동차보험·재산세·경조사 등)
//! - 연 소득 인상률·연 생활비 상승률(bp): 시뮬레이션 13개월 차부터 12개월마다 복리 적용
//! - 사업 매출 계절성(bp)
//!
//! 확률적 변동(난수)은 쓰지 않는다. 같은 입력이면 항상 같은 결과가 나와 검증할 수 있다.
//! 모든 금액은 원 단위 정수, 비율 적용은 rounding::apply_rate(0.5원 이상 올림).

use serde::{Deserialize, Serialize};

use crate::finance::rounding::apply_rate;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnnualItem {
    pub name: String,
    /// 발생 달력 월(1~12)
    pub calendar_month: u32,
    /// 금액(원, 양수)
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CashflowPattern {
    /// 시뮬레이션 1개월 차의 달력 월(1~12)
    #[serde(default = "default_start")]
    pub start_calendar_month: u32,
    /// 달력 1~12월 변동지출 증감률(bp). 비어 있으면 계절성 없음, 있으면 정확히 12개.
    #[serde(default)]
    pub variable_expense_season_bps: Vec<i64>,
    /// 달력 1~12월 사업 매출 증감률(bp). 비어 있으면 계절성 없음.
    #[serde(default)]
    pub business_revenue_season_bps: Vec<i64>,
    #[serde(default)]
    pub annual_inflows: Vec<AnnualItem>,
    #[serde(default)]
    pub annual_outflows: Vec<AnnualItem>,
    /// 연 소득 인상률(bp)
    #[serde(default)]
    pub annual_income_growth_bps: i64,
    /// 연 생활비(고정+변동) 상승률(bp)
    #[serde(default)]
    pub annual_expense_growth_bps: i64,
}

fn default_start() -> u32 {
    1
}

/// 시뮬레이션 월(1부터) → 달력 월(1~12)
pub fn calendar_month(start: u32, month: u32) -> u32 {
    let s = start.clamp(1, 12);
    (s - 1 + month.saturating_sub(1)) % 12 + 1
}

/// 시뮬레이션 월이 속한 경과 연수(1~12개월 차 = 0)
pub fn year_index(month: u32) -> u32 {
    month.saturating_sub(1) / 12
}

/// `amount` 에 연 `bps` 를 `years` 번 복리 적용(매년 원 단위 반올림)
pub fn compound(amount: i64, bps: i64, years: u32) -> i64 {
    let mut v = amount;
    for _ in 0..years {
        v += apply_rate(v, bps, 1);
    }
    v
}

/// 달력 월 `cal` 의 계절 bp (테이블이 12개가 아니면 0)
pub fn season_bps(table: &[i64], cal: u32) -> i64 {
    if table.len() == 12 {
        table[(cal.clamp(1, 12) - 1) as usize]
    } else {
        0
    }
}

pub fn annual_sum(items: &[AnnualItem], cal: u32) -> i64 {
    items.iter().filter(|i| i.calendar_month == cal).map(|i| i.amount).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendar_wraps() {
        assert_eq!(calendar_month(11, 1), 11);
        assert_eq!(calendar_month(11, 2), 12);
        assert_eq!(calendar_month(11, 3), 1);
        assert_eq!(calendar_month(1, 13), 1);
    }

    #[test]
    fn compound_growth() {
        // 3,000,000원 연 3% 2년: 3,090,000 → 3,182,700
        assert_eq!(compound(3_000_000, 300, 0), 3_000_000);
        assert_eq!(compound(3_000_000, 300, 2), 3_182_700);
        assert_eq!(year_index(12), 0);
        assert_eq!(year_index(13), 1);
    }

    #[test]
    fn season_and_annual() {
        let t: Vec<i64> = (1..=12).map(|m| m * 100).collect();
        assert_eq!(season_bps(&t, 3), 300);
        assert_eq!(season_bps(&[100], 3), 0);
        let items = vec![
            AnnualItem { name: "상여".into(), calendar_month: 1, amount: 1_000 },
            AnnualItem { name: "환급".into(), calendar_month: 1, amount: 500 },
        ];
        assert_eq!(annual_sum(&items, 1), 1_500);
        assert_eq!(annual_sum(&items, 2), 0);
    }
}
