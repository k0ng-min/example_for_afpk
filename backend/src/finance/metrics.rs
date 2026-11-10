//! 지표 레지스트리. 분석 규칙, AI 주장 검증, 캔버스 노드, KPI 는 모두 이 key 만 참조할 수 있다.

use serde::Serialize;

use crate::domain::clients::Client;
use crate::finance::projections::Projection;
use crate::finance::rounding::ratio_bps;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Unit {
    Won,
    Bps,
    MonthsX10,
    Months,
    Count,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MetricInput {
    pub label: String,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub key: &'static str,
    pub label: &'static str,
    pub value: Option<i64>,
    pub unit: Unit,
    pub formula: &'static str,
    pub inputs: Vec<MetricInput>,
}

/// (key, label, unit, formula) — 허용 지표 목록
pub const METRIC_DEFS: &[(&str, &str, Unit, &str)] = &[
    ("monthly_income", "월 세후 소득", Unit::Won, "고객 월 소득 + 시나리오 소득 조정(1개월 차)"),
    ("essential_expenses", "월 필수지출", Unit::Won, "생활비(고정+변동) + 가족지원 + 가계부채 상환액"),
    ("monthly_surplus", "월 순현금흐름", Unit::Won, "소득 − 생활비 − 가족지원 − 부채상환 ± 일회성 − 사업 이전(1개월 차)"),
    ("savings_rate_bps", "저축률", Unit::Bps, "월 순현금흐름 ÷ 월 소득"),
    ("debt_service_ratio_bps", "부채상환비율", Unit::Bps, "월 가계부채 상환액 ÷ 월 소득"),
    ("family_support_ratio_bps", "가족지원 비율", Unit::Bps, "월 가족지원액 ÷ 월 소득"),
    ("emergency_fund_months_x10", "비상자금 커버리지", Unit::MonthsX10, "현재 현금성 자산 ÷ 월 필수지출"),
    ("total_assets", "총자산", Unit::Won, "현금 + 투자 + 기타자산 + 사업 운영자금(현재)"),
    ("total_liabilities", "총부채", Unit::Won, "가계부채 + 사업부채(현재)"),
    ("net_worth", "순자산", Unit::Won, "총자산 − 총부채(현재)"),
    ("debt_to_asset_bps", "부채비율", Unit::Bps, "총부채 ÷ 총자산(현재)"),
    ("total_interest_paid", "기간 총 이자", Unit::Won, "시뮬레이션 기간 월 이자 합계"),
    ("household_debt_free_month", "가계부채 상환 완료 시점", Unit::Months, "가계부채 잔액이 0이 되는 첫 달"),
    ("min_cash", "최저 현금 잔액", Unit::Won, "시뮬레이션 기간 중 현금성 자산 최솟값"),
    ("cash_runway_month", "현금 소진 시점", Unit::Months, "현금성 자산이 음수가 되는 첫 달(없으면 값 없음)"),
    ("negative_cashflow_months", "적자 개월 수", Unit::Count, "순현금흐름 < 0 인 달의 수"),
    ("final_net_worth", "기말 순자산", Unit::Won, "시뮬레이션 마지막 달 순자산"),
    ("goal_count", "목표 수", Unit::Count, "평가 대상 재무목표 수"),
    ("goals_on_track", "기한 내 달성 목표 수", Unit::Count, "목표 시점 이전 달성 가능한 목표 수"),
    ("primary_goal_gap", "1순위 목표 부족액", Unit::Won, "목표 시점 가용 유동자산 − 1순위 목표액"),
    ("primary_goal_achieved_month", "1순위 목표 달성 시점", Unit::Months, "가용 유동자산 ≥ 1순위 목표액이 되는 첫 달"),
    ("primary_goal_required_saving", "1순위 목표 필요 월저축", Unit::Won, "(목표액 + 비상예비자금 − 현재 유동자산) ÷ 목표 개월(올림)"),
    ("total_household_transfer", "가계→사업 이전 총액", Unit::Won, "사업 현금 부족분을 가계가 메운 금액 합계"),
    ("business_cash_depleted_month", "사업 현금 소진 시점", Unit::Months, "사업 현금 부족이 처음 발생한 달"),
];

pub fn is_known_metric(key: &str) -> bool {
    METRIC_DEFS.iter().any(|(k, ..)| *k == key)
}

fn input(label: &str, value: i64) -> MetricInput {
    MetricInput { label: label.to_string(), value }
}

pub fn compute_metrics(client: &Client, p: &Projection) -> Vec<Metric> {
    let r0 = &p.rows[0];
    let r1 = &p.rows[1.min(p.rows.len() - 1)];
    let s = &p.summary;
    let essential = r1.living_expenses + r1.family_support + r1.debt_payment;
    let primary = s.goals.first();
    let opt_month = |m: Option<u32>| m.map(i64::from);

    METRIC_DEFS
        .iter()
        .map(|&(key, label, unit, formula)| {
            let (value, inputs): (Option<i64>, Vec<MetricInput>) = match key {
                "monthly_income" => (Some(r1.income), vec![input("기본 소득", client.monthly_income)]),
                "essential_expenses" => (
                    Some(essential),
                    vec![
                        input("생활비", r1.living_expenses),
                        input("가족지원", r1.family_support),
                        input("부채상환", r1.debt_payment),
                    ],
                ),
                "monthly_surplus" => (
                    Some(r1.net_cashflow),
                    vec![
                        input("소득", r1.income),
                        input("생활비", r1.living_expenses),
                        input("가족지원", r1.family_support),
                        input("부채상환", r1.debt_payment),
                        input("일회성", r1.one_time_net),
                        input("사업 이전", r1.household_transfer),
                    ],
                ),
                "savings_rate_bps" => (
                    s.savings_rate_bps,
                    vec![input("순현금흐름", r1.net_cashflow), input("소득", r1.income)],
                ),
                "debt_service_ratio_bps" => (
                    s.debt_service_ratio_bps,
                    vec![input("부채상환", r1.debt_payment), input("소득", r1.income)],
                ),
                "family_support_ratio_bps" => (
                    ratio_bps(r1.family_support, r1.income),
                    vec![input("가족지원", r1.family_support), input("소득", r1.income)],
                ),
                "emergency_fund_months_x10" => (
                    s.emergency_fund_months_x10,
                    vec![input("현금성 자산", r0.cash), input("월 필수지출", essential)],
                ),
                "total_assets" => (Some(r0.total_assets), vec![]),
                "total_liabilities" => (
                    Some(r0.household_debt + r0.business_debt),
                    vec![input("가계부채", r0.household_debt), input("사업부채", r0.business_debt)],
                ),
                "net_worth" => (
                    Some(r0.net_worth),
                    vec![input("총자산", r0.total_assets), input("총부채", r0.total_liabilities)],
                ),
                "debt_to_asset_bps" => (
                    ratio_bps(r0.total_liabilities, r0.total_assets),
                    vec![input("총부채", r0.total_liabilities), input("총자산", r0.total_assets)],
                ),
                "total_interest_paid" => (Some(s.total_interest_paid), vec![]),
                "household_debt_free_month" => (opt_month(s.household_debt_free_month), vec![]),
                "min_cash" => (Some(s.min_cash), vec![input("발생 월", i64::from(s.min_cash_month))]),
                "cash_runway_month" => (opt_month(s.first_negative_cash_month), vec![]),
                "negative_cashflow_months" => (Some(i64::from(s.negative_cashflow_months)), vec![]),
                "final_net_worth" => (Some(s.final_net_worth), vec![]),
                "goal_count" => (Some(s.goals.len() as i64), vec![]),
                "goals_on_track" => (Some(s.goals.iter().filter(|g| g.on_track).count() as i64), vec![]),
                "primary_goal_gap" => (
                    primary.map(|g| g.gap_at_target),
                    primary
                        .map(|g| vec![input("목표액", g.target_amount), input("목표 개월", i64::from(g.target_month))])
                        .unwrap_or_default(),
                ),
                "primary_goal_achieved_month" => (primary.and_then(|g| opt_month(g.achieved_month)), vec![]),
                "primary_goal_required_saving" => (
                    primary.map(|g| g.required_monthly_saving),
                    vec![input("비상예비자금", s.emergency_reserve)],
                ),
                "total_household_transfer" => (Some(s.total_household_transfer), vec![]),
                "business_cash_depleted_month" => (opt_month(s.business_cash_depleted_month), vec![]),
                _ => (None, vec![]),
            };
            Metric { key, label, value, unit, formula, inputs }
        })
        .collect()
}

pub fn metric_value(metrics: &[Metric], key: &str) -> Option<i64> {
    metrics.iter().find(|m| m.key == key).and_then(|m| m.value)
}
