//! 월 단위 결정론적 재무 시뮬레이션. 계산식은 docs/FINANCIAL_ASSUMPTIONS.md 와 일치해야 한다.

use serde::Serialize;

use crate::domain::clients::{Client, LiabilityKind};
use crate::domain::goals::Goal;
use crate::domain::scenarios::ScenarioAdjustments;
use crate::finance::assets::monthly_growth;
use crate::finance::business::BusinessState;
use crate::finance::cashflow::month_flows;
use crate::finance::liabilities::{avalanche_target, DebtState};
use crate::finance::pattern::{calendar_month, season_bps};
use crate::finance::rounding::{ceil_div, months_x10, ratio_bps, won_str};

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MonthRow {
    pub month: u32,
    pub income: i64,
    pub living_expenses: i64,
    pub family_support: i64,
    pub debt_payment: i64,
    pub interest_paid: i64,
    pub principal_paid: i64,
    pub one_time_net: i64,
    pub household_transfer: i64,
    /// 가계 월 순현금흐름(음수 그대로 표시)
    pub net_cashflow: i64,
    pub cash: i64,
    pub investments: i64,
    pub other_assets: i64,
    pub business_cash: i64,
    pub household_debt: i64,
    pub business_debt: i64,
    pub total_assets: i64,
    pub total_liabilities: i64,
    pub net_worth: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoalResult {
    pub goal_id: String,
    pub name: String,
    pub priority: u8,
    pub target_amount: i64,
    pub target_month: u32,
    /// 우선순위 누적 목표액(상위 목표 + 본 목표)
    pub cumulative_target: i64,
    pub achieved_month: Option<u32>,
    pub on_track: bool,
    /// 목표 시점 (가용 유동자산 − 누적 목표액). 음수면 부족액.
    pub gap_at_target: i64,
    /// 목표 시점까지 단순 적립(수익률 미반영) 기준 필요 월 저축액
    pub required_monthly_saving: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Warning {
    pub code: String,
    pub severity: String,
    pub month: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionSummary {
    pub horizon_months: u32,
    pub first_month_net_cashflow: i64,
    pub average_net_cashflow: i64,
    pub negative_cashflow_months: u32,
    pub first_negative_cash_month: Option<u32>,
    pub min_cash: i64,
    pub min_cash_month: u32,
    pub final_cash: i64,
    pub final_net_worth: i64,
    pub net_worth_change: i64,
    pub total_interest_paid: i64,
    pub household_debt_free_month: Option<u32>,
    pub emergency_reserve: i64,
    pub savings_rate_bps: Option<i64>,
    pub debt_service_ratio_bps: Option<i64>,
    pub emergency_fund_months_x10: Option<i64>,
    pub total_household_transfer: i64,
    pub business_cash_depleted_month: Option<u32>,
    pub goals: Vec<GoalResult>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Projection {
    pub rows: Vec<MonthRow>,
    pub summary: ProjectionSummary,
    pub warnings: Vec<Warning>,
    pub assumptions: Vec<String>,
}

pub const ENGINE_ASSUMPTIONS: &[&str] = &[
    "월 단위 결정론적 계산이며 확률적 수익·물가상승은 반영하지 않음",
    "모든 금액은 원 단위 정수, 이자·수익은 0.5원 이상 올림(MidpointAwayFromZero)",
    "부채 이자 = 잔액 × 연이율 ÷ 12, 추가상환은 금리가 가장 높은 가계부채부터",
    "투자·현금 수익률은 사용자 가정값이며 미래 수익을 보장하지 않음",
    "목표는 우선순위 순으로 누적 적립 방식 평가(가용 유동자산 = 현금 + 투자 − 비상예비자금)",
    "기타 자산(보증금 등)은 시뮬레이션 기간 동안 변동 없음",
    "현실 패턴이 있는 고객은 달력 월별 계절 지출·연간 정기 유입·유출·연 인상률을 결정론적으로 반영(난수 없음)",
];

fn liquid(row: &MonthRow, reserve: i64) -> i64 {
    row.cash + row.investments - reserve
}

pub fn project(client: &Client, adj: &ScenarioAdjustments) -> Projection {
    let horizon = adj.horizon_months.clamp(1, 360);
    let mut debts: Vec<DebtState> = client.liabilities.iter().map(DebtState::from).collect();
    let mut business = client
        .business
        .as_ref()
        .map(|b| BusinessState::new(b, adj.business_revenue_change_bps, adj.household_backstop));
    let mut cash = client.cash_assets;
    let mut investments = client.investment_assets;
    let mut unfunded_business: i64 = 0;
    let mut warnings: Vec<Warning> = vec![];
    let mut negamort_warned = false;

    let balance_of = |debts: &[DebtState], kind: LiabilityKind| -> i64 {
        debts.iter().filter(|d| d.kind == kind).map(|d| d.balance).sum()
    };
    let build_row = |month: u32,
                     cash: i64,
                     investments: i64,
                     business_cash: i64,
                     unfunded: i64,
                     debts: &[DebtState]|
     -> MonthRow {
        let household_debt = balance_of(debts, LiabilityKind::Household);
        let business_debt = balance_of(debts, LiabilityKind::Business);
        let total_assets = cash.max(0) + investments + client.other_assets + business_cash.max(0);
        // 음수 현금(부족 자금)과 사업 미지급 부족분은 부채로 집계해 숨기지 않는다.
        let total_liabilities = household_debt
            + business_debt
            + (-cash).max(0)
            + (-business_cash).max(0).max(unfunded);
        MonthRow {
            month,
            cash,
            investments,
            other_assets: client.other_assets,
            business_cash,
            household_debt,
            business_debt,
            total_assets,
            total_liabilities,
            net_worth: total_assets - total_liabilities,
            ..Default::default()
        }
    };

    let mut rows = vec![build_row(
        0,
        cash,
        investments,
        business.as_ref().map_or(0, |b| b.cash),
        0,
        &debts,
    )];

    let mut reserve = 0;
    for month in 1..=horizon {
        let f = month_flows(client, adj, month);
        let cash_growth = monthly_growth(cash, adj.cash_return_bps);

        let target = avalanche_target(&debts);
        let (mut hh_pay, mut interest, mut principal, mut biz_pay) = (0, 0, 0, 0);
        for (i, d) in debts.iter_mut().enumerate() {
            let extra = if Some(i) == target { adj.extra_debt_payment } else { 0 };
            let s = d.step(extra);
            if s.negative_amortization && !negamort_warned {
                negamort_warned = true;
                warnings.push(Warning {
                    code: "NEGATIVE_AMORTIZATION".into(),
                    severity: "critical".into(),
                    month: Some(month),
                    message: format!("부채 '{}'의 월 상환액이 이자보다 적어 잔액이 증가합니다.", d.id),
                });
            }
            interest += s.interest;
            principal += s.principal;
            // 사업 프로필이 있으면 사업부채는 사업 현금에서, 없으면 가계에서 상환
            if d.kind == LiabilityKind::Business && business.is_some() {
                biz_pay += s.payment;
            } else {
                hh_pay += s.payment;
            }
        }

        let mut transfer = 0;
        let mut business_cash = 0;
        if let Some(b) = business.as_mut() {
            let season = client.pattern.as_ref().map_or(0, |p| {
                season_bps(&p.business_revenue_season_bps, calendar_month(p.start_calendar_month, month))
            });
            let s = b.step_with_season(biz_pay, season);
            transfer = s.household_transfer;
            business_cash = s.business_cash;
            unfunded_business = s.unfunded_shortfall;
        }

        let one_time_net = f.one_time_inflow - f.one_time_outflow;
        let net = f.income - f.living_expenses - f.family_support - hh_pay + one_time_net - transfer;
        cash += net + cash_growth;

        let invest = adj.monthly_investment.max(0).min(cash.max(0));
        cash -= invest;
        investments += monthly_growth(investments, adj.investment_return_bps) + invest;

        if month == 1 {
            reserve = i64::from(client.emergency_fund_target_months)
                * (f.living_expenses + f.family_support + hh_pay);
        }

        let mut row = build_row(month, cash, investments, business_cash, unfunded_business, &debts);
        row.income = f.income;
        row.living_expenses = f.living_expenses;
        row.family_support = f.family_support;
        row.debt_payment = hh_pay;
        row.interest_paid = interest;
        row.principal_paid = principal;
        row.one_time_net = one_time_net;
        row.household_transfer = transfer;
        row.net_cashflow = net;
        rows.push(row);
    }

    let goals: Vec<Goal> = adj.goals.clone().unwrap_or_else(|| client.goals.clone());
    let summary = summarize(&rows, horizon, reserve, &goals, &mut warnings);
    let mut assumptions: Vec<String> = ENGINE_ASSUMPTIONS.iter().map(|s| s.to_string()).collect();
    assumptions.extend(client.assumptions.iter().cloned());
    Projection { rows, summary, warnings, assumptions }
}

fn summarize(
    rows: &[MonthRow],
    horizon: u32,
    reserve: i64,
    goals: &[Goal],
    warnings: &mut Vec<Warning>,
) -> ProjectionSummary {
    let first = &rows[1];
    let body = &rows[1..];
    let negative_cashflow_months = body.iter().filter(|r| r.net_cashflow < 0).count() as u32;
    let first_negative_cash_month = body.iter().find(|r| r.cash < 0).map(|r| r.month);
    let min_row = rows.iter().min_by_key(|r| (r.cash, r.month)).unwrap_or(first);
    let last = rows.last().unwrap_or(first);
    let average_net_cashflow =
        body.iter().map(|r| r.net_cashflow).sum::<i64>() / i64::from(horizon.max(1));
    let household_debt_free_month = if rows[0].household_debt == 0 {
        None
    } else {
        body.iter().find(|r| r.household_debt == 0).map(|r| r.month)
    };
    let total_household_transfer: i64 = body.iter().map(|r| r.household_transfer).sum();
    let business_cash_depleted_month =
        body.iter().find(|r| r.household_transfer > 0 || r.business_cash < 0).map(|r| r.month);
    let essential = first.living_expenses + first.family_support + first.debt_payment;

    if first.net_cashflow < 0 {
        warnings.push(Warning {
            code: "NEGATIVE_CASHFLOW".into(),
            severity: "critical".into(),
            month: Some(1),
            message: format!("첫 달부터 월 순현금흐름이 {}으로 적자입니다.", won_str(first.net_cashflow)),
        });
    } else if negative_cashflow_months > 0 {
        let m = body.iter().find(|r| r.net_cashflow < 0).map(|r| r.month);
        warnings.push(Warning {
            code: "NEGATIVE_CASHFLOW".into(),
            severity: "warning".into(),
            month: m,
            message: format!("시뮬레이션 기간 중 {negative_cashflow_months}개월 동안 순현금흐름이 적자입니다."),
        });
    }
    if let Some(m) = first_negative_cash_month {
        warnings.push(Warning {
            code: "CASH_DEPLETED".into(),
            severity: "critical".into(),
            month: Some(m),
            message: format!("{m}개월 차에 현금성 자산이 소진되어 부족자금이 발생합니다."),
        });
    }
    if total_household_transfer > 0 {
        warnings.push(Warning {
            code: "BUSINESS_CONTAGION".into(),
            severity: "critical".into(),
            month: business_cash_depleted_month,
            message: format!("사업 현금 부족으로 가계에서 총 {}이 사업으로 이전됩니다.", won_str(total_household_transfer)),
        });
    }
    if rows[0].cash < reserve {
        warnings.push(Warning {
            code: "EMERGENCY_FUND_LOW".into(),
            severity: "warning".into(),
            month: Some(0),
            message: format!("현재 현금성 자산이 비상예비자금 목표({})보다 적습니다.", won_str(reserve)),
        });
    }

    let mut sorted: Vec<&Goal> = goals.iter().collect();
    sorted.sort_by_key(|g| (g.priority, g.target_month));
    let mut cumulative = 0;
    let goal_results = sorted
        .into_iter()
        .map(|g| {
            cumulative += g.target_amount;
            let achieved_month = rows.iter().find(|r| liquid(r, reserve) >= cumulative).map(|r| r.month);
            let eval_month = g.target_month.min(horizon) as usize;
            let gap_at_target = liquid(&rows[eval_month], reserve) - cumulative;
            let on_track = achieved_month.is_some_and(|m| m <= g.target_month);
            let required_monthly_saving = ceil_div(
                cumulative + reserve - (rows[0].cash + rows[0].investments),
                i64::from(g.target_month.max(1)),
            );
            if !on_track {
                warnings.push(Warning {
                    code: "GOAL_AT_RISK".into(),
                    severity: "warning".into(),
                    month: Some(g.target_month),
                    message: format!(
                        "목표 '{}'는 목표 시점({}개월)에 {}이 부족합니다.",
                        g.name,
                        g.target_month,
                        won_str((-gap_at_target).max(0))
                    ),
                });
            }
            GoalResult {
                goal_id: g.id.clone(),
                name: g.name.clone(),
                priority: g.priority,
                target_amount: g.target_amount,
                target_month: g.target_month,
                cumulative_target: cumulative,
                achieved_month,
                on_track,
                gap_at_target,
                required_monthly_saving,
            }
        })
        .collect();

    ProjectionSummary {
        horizon_months: horizon,
        first_month_net_cashflow: first.net_cashflow,
        average_net_cashflow,
        negative_cashflow_months,
        first_negative_cash_month,
        min_cash: min_row.cash,
        min_cash_month: min_row.month,
        final_cash: last.cash,
        final_net_worth: last.net_worth,
        net_worth_change: last.net_worth - rows[0].net_worth,
        total_interest_paid: body.iter().map(|r| r.interest_paid).sum(),
        household_debt_free_month,
        emergency_reserve: reserve,
        savings_rate_bps: ratio_bps(first.net_cashflow, first.income),
        debt_service_ratio_bps: ratio_bps(first.debt_payment, first.income),
        emergency_fund_months_x10: months_x10(rows[0].cash, essential),
        total_household_transfer,
        business_cash_depleted_month,
        goals: goal_results,
    }
}
