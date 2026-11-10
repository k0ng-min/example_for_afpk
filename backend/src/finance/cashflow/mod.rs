//! 월별 가계 소득·지출 산정(부채 상환 제외).

use crate::domain::clients::Client;
use crate::domain::scenarios::{EventKind, ScenarioAdjustments};
use crate::finance::pattern::{annual_sum, calendar_month, compound, season_bps, year_index};
use crate::finance::rounding::apply_rate;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MonthFlows {
    pub income: i64,
    pub living_expenses: i64,
    pub family_support: i64,
    pub one_time_inflow: i64,
    pub one_time_outflow: i64,
}

pub fn month_flows(client: &Client, adj: &ScenarioAdjustments, month: u32) -> MonthFlows {
    // 현실 패턴: 연 인상률(복리) → 변동지출 계절성 → 연간 정기 유입·유출
    let (mut income, mut fixed, mut variable) =
        (client.monthly_income, client.fixed_expenses, client.variable_expenses);
    let (mut inflow, mut outflow) = (0, 0);
    if let Some(p) = &client.pattern {
        let y = year_index(month);
        let cal = calendar_month(p.start_calendar_month, month);
        income = compound(income, p.annual_income_growth_bps, y);
        fixed = compound(fixed, p.annual_expense_growth_bps, y);
        variable = compound(variable, p.annual_expense_growth_bps, y);
        variable += apply_rate(variable, season_bps(&p.variable_expense_season_bps, cal), 1);
        inflow = annual_sum(&p.annual_inflows, cal);
        outflow = annual_sum(&p.annual_outflows, cal);
    }
    let mut f = MonthFlows {
        income: income + adj.income_change,
        living_expenses: fixed + adj.fixed_expense_change + variable + adj.variable_expense_change,
        family_support: adj.family_support_override.unwrap_or(client.family_support),
        one_time_inflow: inflow,
        one_time_outflow: outflow,
    };
    for e in adj.events.iter().filter(|e| e.active_in(month)) {
        match e.kind {
            EventKind::IncomeChange => f.income += e.amount,
            EventKind::ExpenseChange => f.living_expenses += e.amount,
            EventKind::OneTimeInflow => f.one_time_inflow += e.amount,
            EventKind::OneTimeOutflow => f.one_time_outflow += e.amount,
        }
    }
    // 소득·지출이 음수가 되는 조정은 0으로 막되(예: 소득 −500만), 결과 현금흐름의 음수는 숨기지 않는다.
    f.income = f.income.max(0);
    f.living_expenses = f.living_expenses.max(0);
    f.family_support = f.family_support.max(0);
    f
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(pattern: serde_json::Value) -> Client {
        serde_json::from_value(serde_json::json!({
            "id": "t", "name": "t", "age": 30, "occupation": "", "familySituation": "",
            "topicId": "t", "synthetic": true,
            "monthlyIncome": 3_000_000, "fixedExpenses": 1_000_000, "variableExpenses": 500_000,
            "cashAssets": 0, "pattern": pattern
        }))
        .unwrap()
    }

    #[test]
    fn no_pattern_is_flat() {
        let c = client(serde_json::Value::Null);
        let adj = ScenarioAdjustments::default();
        assert_eq!(month_flows(&c, &adj, 1), month_flows(&c, &adj, 25));
    }

    #[test]
    fn pattern_applies_season_bonus_and_growth() {
        let mut season = vec![0i64; 12];
        season[0] = 2000; // 1월 변동지출 +20%
        let c = client(serde_json::json!({
            "startCalendarMonth": 11,
            "variableExpenseSeasonBps": season,
            "annualInflows": [{ "name": "상여", "calendarMonth": 1, "amount": 1_500_000 }],
            "annualOutflows": [{ "name": "자동차보험", "calendarMonth": 12, "amount": 700_000 }],
            "annualIncomeGrowthBps": 300,
            "annualExpenseGrowthBps": 200
        }));
        let adj = ScenarioAdjustments::default();
        // 1개월 차 = 11월: 패턴 없음과 동일
        let m1 = month_flows(&c, &adj, 1);
        assert_eq!((m1.income, m1.living_expenses, m1.one_time_inflow, m1.one_time_outflow), (3_000_000, 1_500_000, 0, 0));
        // 2개월 차 = 12월: 자동차보험
        assert_eq!(month_flows(&c, &adj, 2).one_time_outflow, 700_000);
        // 3개월 차 = 1월: 변동지출 500,000 × 1.2 = 600,000, 상여 1,500,000
        let m3 = month_flows(&c, &adj, 3);
        assert_eq!(m3.living_expenses, 1_600_000);
        assert_eq!(m3.one_time_inflow, 1_500_000);
        // 13개월 차 = 2년 차 11월: 소득 3% 인상, 생활비 2% 상승
        let m13 = month_flows(&c, &adj, 13);
        assert_eq!(m13.income, 3_090_000);
        assert_eq!(m13.living_expenses, 1_530_000);
    }
}
