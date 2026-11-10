//! 시나리오 = 고객 기본값 위에 얹는 조정값 + 미래 이벤트.

use serde::{Deserialize, Serialize};

use crate::domain::goals::Goal;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    /// 기간 동안 월 소득 증감(원/월)
    IncomeChange,
    /// 기간 동안 월 지출 증감(원/월)
    ExpenseChange,
    /// 일회성 유입(원)
    OneTimeInflow,
    /// 일회성 유출(원)
    OneTimeOutflow,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FutureEvent {
    pub id: String,
    pub name: String,
    pub kind: EventKind,
    /// 시작 월(1부터)
    pub start_month: u32,
    /// 종료 월(포함). None 이면 시뮬레이션 끝까지. 일회성 이벤트는 무시.
    #[serde(default)]
    pub end_month: Option<u32>,
    pub amount: i64,
}

impl FutureEvent {
    pub fn active_in(&self, month: u32) -> bool {
        match self.kind {
            EventKind::OneTimeInflow | EventKind::OneTimeOutflow => month == self.start_month,
            _ => month >= self.start_month && self.end_month.map_or(true, |e| month <= e),
        }
    }
}

/// 시나리오 조정값. 주제 프리셋(scenario_presets.json)도 이 구조를 그대로 사용한다.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioAdjustments {
    #[serde(default = "default_horizon")]
    pub horizon_months: u32,
    /// 월 소득 증감(원)
    #[serde(default)]
    pub income_change: i64,
    #[serde(default)]
    pub fixed_expense_change: i64,
    #[serde(default)]
    pub variable_expense_change: i64,
    /// 가족 지원액 재설정(원/월). None 이면 고객 기본값.
    #[serde(default)]
    pub family_support_override: Option<i64>,
    /// 추가 부채 상환(원/월). 금리가 가장 높은 가계부채부터 적용.
    #[serde(default)]
    pub extra_debt_payment: i64,
    /// 매월 현금 → 투자자산 이체(원)
    #[serde(default)]
    pub monthly_investment: i64,
    /// 투자자산 연 기대수익률 가정(bp). 확정 수익이 아님.
    #[serde(default = "default_investment_return")]
    pub investment_return_bps: i64,
    /// 현금성 자산 연 이자율 가정(bp)
    #[serde(default)]
    pub cash_return_bps: i64,
    /// 사업 매출 변화율(bp). -2000 = -20%
    #[serde(default)]
    pub business_revenue_change_bps: i64,
    /// 사업 현금 부족 시 가계가 메워주는지 여부(전염 경로)
    #[serde(default = "default_true")]
    pub household_backstop: bool,
    #[serde(default)]
    pub events: Vec<FutureEvent>,
    /// 설정 시 고객 목표를 대체(목표 변경 시나리오)
    #[serde(default)]
    pub goals: Option<Vec<Goal>>,
}

impl Default for ScenarioAdjustments {
    fn default() -> Self {
        Self {
            horizon_months: default_horizon(),
            income_change: 0,
            fixed_expense_change: 0,
            variable_expense_change: 0,
            family_support_override: None,
            extra_debt_payment: 0,
            monthly_investment: 0,
            investment_return_bps: default_investment_return(),
            cash_return_bps: 0,
            business_revenue_change_bps: 0,
            household_backstop: true,
            events: vec![],
            goals: None,
        }
    }
}

fn default_horizon() -> u32 {
    60
}
fn default_investment_return() -> i64 {
    300
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scenario {
    pub id: String,
    pub client_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub is_baseline: bool,
    #[serde(default)]
    pub color: String,
    #[serde(flatten)]
    pub adjustments: ScenarioAdjustments,
}
