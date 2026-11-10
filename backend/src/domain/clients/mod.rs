//! 고객(합성) 데이터 모델. 모든 금액은 원 단위 정수(i64), 이율은 bp(1bp = 0.01%) 정수.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::domain::goals::Goal;
use crate::finance::pattern::CashflowPattern;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum LiabilityKind {
    #[default]
    Household,
    Business,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Liability {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: LiabilityKind,
    /// 잔액(원)
    pub balance: i64,
    /// 연이율(bp). 550 = 연 5.50%
    pub annual_rate_bps: i64,
    /// 월 상환액(원, 이자 포함 원리금)
    pub monthly_payment: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BusinessProfile {
    /// 사업 월 매출(원)
    pub monthly_revenue: i64,
    /// 사업 월 운영비용(원, 대표자 인출·사업부채 상환 제외)
    pub monthly_cost: i64,
    /// 사업 운영자금(원)
    pub operating_cash: i64,
    /// 대표자 월 인출액(원). 가계 소득(monthlyIncome)에 이미 포함된 금액
    pub owner_draw: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub age: u32,
    pub occupation: String,
    pub family_situation: String,
    /// 이 고객이 대표하는 주제 id (주제 전환과 무관하게 고객은 보존됨)
    pub topic_id: String,
    /// 합성 데이터 여부. 실제 고객 데이터는 수집하지 않으므로 항상 true여야 한다.
    pub synthetic: bool,
    /// 월 세후 소득(원)
    pub monthly_income: i64,
    /// 월 고정지출(원)
    pub fixed_expenses: i64,
    /// 월 변동지출(원)
    pub variable_expenses: i64,
    /// 월 가족 지원액(원)
    #[serde(default)]
    pub family_support: i64,
    /// 현금성 자산(원)
    pub cash_assets: i64,
    /// 투자 자산(원)
    #[serde(default)]
    pub investment_assets: i64,
    /// 기타 자산(보증금 등, 원) — 시뮬레이션 중 변동하지 않는 것으로 가정
    #[serde(default)]
    pub other_assets: i64,
    #[serde(default)]
    pub liabilities: Vec<Liability>,
    #[serde(default)]
    pub goals: Vec<Goal>,
    #[serde(default)]
    pub business: Option<BusinessProfile>,
    /// 현실 패턴(계절 지출·상여금·연간 고정비·연 인상률). 없으면 매달 같은 값으로 계산.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<CashflowPattern>,
    /// 비상예비자금 목표(필수지출 대비 개월 수)
    #[serde(default = "default_emergency_months")]
    pub emergency_fund_target_months: u32,
    /// 주제별 확장 필드 (input_schema.json 에 정의된 key만 허용)
    #[serde(default)]
    pub extensions: BTreeMap<String, i64>,
    /// 원 데이터에 없어서 명시적으로 설정한 계산 가정
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub notes: String,
}

fn default_emergency_months() -> u32 {
    3
}

impl Client {
    /// 가계 월 필수지출 = 고정 + 변동 + 가족지원
    pub fn essential_expenses(&self) -> i64 {
        self.fixed_expenses + self.variable_expenses + self.family_support
    }

    pub fn household_debt_payment(&self) -> i64 {
        self.liabilities
            .iter()
            .filter(|l| l.kind == LiabilityKind::Household && l.balance > 0)
            .map(|l| l.monthly_payment)
            .sum()
    }

    pub fn household_debt_balance(&self) -> i64 {
        self.liabilities
            .iter()
            .filter(|l| l.kind == LiabilityKind::Household)
            .map(|l| l.balance)
            .sum()
    }

    pub fn business_debt_balance(&self) -> i64 {
        self.liabilities
            .iter()
            .filter(|l| l.kind == LiabilityKind::Business)
            .map(|l| l.balance)
            .sum()
    }
}
