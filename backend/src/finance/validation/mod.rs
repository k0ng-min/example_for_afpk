//! 입력 검증. API 로 들어오는 고객·시나리오와 Adaptive Idea Engine 이 생성한 합성 고객 모두 이 검증을 통과해야 한다.

use serde::Serialize;

use crate::domain::clients::Client;
use crate::domain::goals::Goal;
use crate::domain::scenarios::ScenarioAdjustments;

pub const MAX_AMOUNT: i64 = 1_000_000_000_000; // 1조 원
pub const MAX_HORIZON: u32 = 360;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

#[derive(Default)]
pub struct Errors(pub Vec<FieldError>);

impl Errors {
    fn push(&mut self, field: impl Into<String>, message: impl Into<String>) {
        self.0.push(FieldError { field: field.into(), message: message.into() });
    }
    fn amount(&mut self, field: &str, v: i64) {
        if !(0..=MAX_AMOUNT).contains(&v) {
            self.push(field, "금액은 0원 이상 1조 원 이하여야 합니다");
        }
    }
    fn delta(&mut self, field: &str, v: i64) {
        if v.abs() > MAX_AMOUNT {
            self.push(field, "조정 금액 범위를 벗어났습니다");
        }
    }
    fn bps(&mut self, field: &str, v: i64, min: i64, max: i64) {
        if !(min..=max).contains(&v) {
            self.push(field, format!("비율은 {min}bp ~ {max}bp 범위여야 합니다"));
        }
    }
    fn text(&mut self, field: &str, v: &str, max: usize, required: bool) {
        if required && v.trim().is_empty() {
            self.push(field, "필수 입력입니다");
        }
        if v.chars().count() > max {
            self.push(field, format!("{max}자 이하로 입력하세요"));
        }
        if v.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
            self.push(field, "제어 문자는 허용되지 않습니다");
        }
    }
}

pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn goals(e: &mut Errors, prefix: &str, goals: &[Goal]) {
    if goals.len() > 20 {
        e.push(prefix, "목표는 최대 20개입니다");
    }
    for (i, g) in goals.iter().enumerate() {
        let f = format!("{prefix}[{i}]");
        if !is_safe_id(&g.id) {
            e.push(format!("{f}.id"), "id 형식이 올바르지 않습니다");
        }
        e.text(&format!("{f}.name"), &g.name, 80, true);
        e.text(&format!("{f}.category"), &g.category, 40, false);
        if g.target_amount <= 0 || g.target_amount > MAX_AMOUNT {
            e.push(format!("{f}.targetAmount"), "목표 금액은 0원보다 커야 합니다");
        }
        if g.target_month == 0 || g.target_month > MAX_HORIZON {
            e.push(format!("{f}.targetMonth"), "목표 시점은 1~360개월입니다");
        }
        if g.priority == 0 || g.priority > 20 {
            e.push(format!("{f}.priority"), "우선순위는 1~20입니다");
        }
    }
}

pub fn validate_client(c: &Client) -> Vec<FieldError> {
    let mut e = Errors::default();
    if !is_safe_id(&c.id) {
        e.push("id", "id 형식이 올바르지 않습니다");
    }
    if !is_safe_id(&c.topic_id) {
        e.push("topicId", "주제 id 형식이 올바르지 않습니다");
    }
    if !c.synthetic {
        e.push("synthetic", "초기 개발 범위에서는 합성 고객 데이터만 허용됩니다");
    }
    e.text("name", &c.name, 40, true);
    e.text("occupation", &c.occupation, 60, false);
    e.text("familySituation", &c.family_situation, 200, false);
    e.text("notes", &c.notes, 2000, false);
    if !(15..=100).contains(&c.age) {
        e.push("age", "나이는 15~100세입니다");
    }
    for (f, v) in [
        ("monthlyIncome", c.monthly_income),
        ("fixedExpenses", c.fixed_expenses),
        ("variableExpenses", c.variable_expenses),
        ("familySupport", c.family_support),
        ("cashAssets", c.cash_assets),
        ("investmentAssets", c.investment_assets),
        ("otherAssets", c.other_assets),
    ] {
        e.amount(f, v);
    }
    if c.emergency_fund_target_months > 24 {
        e.push("emergencyFundTargetMonths", "비상예비자금 목표는 0~24개월입니다");
    }
    if c.liabilities.len() > 20 {
        e.push("liabilities", "부채는 최대 20개입니다");
    }
    for (i, l) in c.liabilities.iter().enumerate() {
        let f = format!("liabilities[{i}]");
        if !is_safe_id(&l.id) {
            e.push(format!("{f}.id"), "id 형식이 올바르지 않습니다");
        }
        e.text(&format!("{f}.name"), &l.name, 60, true);
        e.amount(&format!("{f}.balance"), l.balance);
        e.amount(&format!("{f}.monthlyPayment"), l.monthly_payment);
        e.bps(&format!("{f}.annualRateBps"), l.annual_rate_bps, 0, 3000);
        if l.balance > 0 && l.monthly_payment == 0 {
            e.push(format!("{f}.monthlyPayment"), "잔액이 있으면 월 상환액이 필요합니다");
        }
    }
    goals(&mut e, "goals", &c.goals);
    if let Some(b) = &c.business {
        e.amount("business.monthlyRevenue", b.monthly_revenue);
        e.amount("business.monthlyCost", b.monthly_cost);
        e.amount("business.operatingCash", b.operating_cash);
        e.amount("business.ownerDraw", b.owner_draw);
    }
    if let Some(p) = &c.pattern {
        if !(1..=12).contains(&p.start_calendar_month) {
            e.push("pattern.startCalendarMonth", "시작 월은 1~12입니다");
        }
        for (f, t) in [
            ("pattern.variableExpenseSeasonBps", &p.variable_expense_season_bps),
            ("pattern.businessRevenueSeasonBps", &p.business_revenue_season_bps),
        ] {
            if !(t.is_empty() || t.len() == 12) {
                e.push(f, "계절성은 비우거나 12개월 값을 모두 입력해야 합니다");
            }
            for v in t.iter() {
                e.bps(f, *v, -9000, 20000);
            }
        }
        e.bps("pattern.annualIncomeGrowthBps", p.annual_income_growth_bps, -5000, 5000);
        e.bps("pattern.annualExpenseGrowthBps", p.annual_expense_growth_bps, -5000, 5000);
        for (f, items) in [("pattern.annualInflows", &p.annual_inflows), ("pattern.annualOutflows", &p.annual_outflows)] {
            if items.len() > 24 {
                e.push(f, "연간 항목은 최대 24개입니다");
            }
            for (i, it) in items.iter().enumerate() {
                e.text(&format!("{f}[{i}].name"), &it.name, 40, true);
                e.amount(&format!("{f}[{i}].amount"), it.amount);
                if !(1..=12).contains(&it.calendar_month) {
                    e.push(format!("{f}[{i}].calendarMonth"), "발생 월은 1~12입니다");
                }
            }
        }
    }
    if c.extensions.len() > 30 {
        e.push("extensions", "확장 필드는 최대 30개입니다");
    }
    for (k, v) in &c.extensions {
        if !is_safe_id(k) {
            e.push("extensions", format!("확장 필드 key '{k}' 형식이 올바르지 않습니다"));
        }
        e.delta(&format!("extensions.{k}"), *v);
    }
    if c.assumptions.len() > 30 {
        e.push("assumptions", "가정은 최대 30개입니다");
    }
    for (i, a) in c.assumptions.iter().enumerate() {
        e.text(&format!("assumptions[{i}]"), a, 300, false);
    }
    e.0
}

pub fn validate_adjustments(a: &ScenarioAdjustments) -> Vec<FieldError> {
    let mut e = Errors::default();
    if a.horizon_months == 0 || a.horizon_months > MAX_HORIZON {
        e.push("horizonMonths", "기간은 1~360개월입니다");
    }
    for (f, v) in [
        ("incomeChange", a.income_change),
        ("fixedExpenseChange", a.fixed_expense_change),
        ("variableExpenseChange", a.variable_expense_change),
    ] {
        e.delta(f, v);
    }
    if let Some(v) = a.family_support_override {
        e.amount("familySupportOverride", v);
    }
    e.amount("extraDebtPayment", a.extra_debt_payment);
    e.amount("monthlyInvestment", a.monthly_investment);
    e.bps("investmentReturnBps", a.investment_return_bps, -5000, 3000);
    e.bps("cashReturnBps", a.cash_return_bps, 0, 2000);
    e.bps("businessRevenueChangeBps", a.business_revenue_change_bps, -10_000, 10_000);
    if a.events.len() > 50 {
        e.push("events", "이벤트는 최대 50개입니다");
    }
    for (i, ev) in a.events.iter().enumerate() {
        let f = format!("events[{i}]");
        if !is_safe_id(&ev.id) {
            e.push(format!("{f}.id"), "id 형식이 올바르지 않습니다");
        }
        e.text(&format!("{f}.name"), &ev.name, 80, true);
        e.delta(&format!("{f}.amount"), ev.amount);
        if ev.start_month == 0 || ev.start_month > MAX_HORIZON {
            e.push(format!("{f}.startMonth"), "시작 월은 1~360입니다");
        }
        if let Some(end) = ev.end_month {
            if end < ev.start_month {
                e.push(format!("{f}.endMonth"), "종료 월은 시작 월 이후여야 합니다");
            }
        }
    }
    if let Some(g) = &a.goals {
        goals(&mut e, "goals", g);
    }
    e.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_ids() {
        assert!(is_safe_id("client_a-1"));
        assert!(!is_safe_id("../etc"));
        assert!(!is_safe_id(""));
        assert!(!is_safe_id("a b"));
    }
}
