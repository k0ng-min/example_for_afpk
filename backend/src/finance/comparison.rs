//! 시나리오 비교: 각 시나리오를 독립적으로 계산하고 기준 시나리오 대비 차이를 산출한다.

use serde::Serialize;

use crate::domain::clients::Client;
use crate::domain::scenarios::Scenario;
use crate::finance::projections::{project, Projection};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparedScenario {
    pub scenario_id: String,
    pub name: String,
    pub color: String,
    pub projection: Projection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonDelta {
    pub scenario_id: String,
    pub metric: &'static str,
    pub label: &'static str,
    pub value: Option<i64>,
    pub baseline: Option<i64>,
    pub delta: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub baseline_id: String,
    pub scenarios: Vec<ComparedScenario>,
    pub deltas: Vec<ComparisonDelta>,
}

fn pick(p: &Projection) -> [(&'static str, &'static str, Option<i64>); 7] {
    let s = &p.summary;
    [
        ("final_net_worth", "기말 순자산", Some(s.final_net_worth)),
        ("final_cash", "기말 현금", Some(s.final_cash)),
        ("min_cash", "최저 현금", Some(s.min_cash)),
        ("first_month_net_cashflow", "월 순현금흐름", Some(s.first_month_net_cashflow)),
        ("total_interest_paid", "총 이자", Some(s.total_interest_paid)),
        ("goals_on_track", "기한 내 달성 목표", Some(s.goals.iter().filter(|g| g.on_track).count() as i64)),
        (
            "primary_goal_achieved_month",
            "1순위 목표 달성 월",
            s.goals.first().and_then(|g| g.achieved_month).map(i64::from),
        ),
    ]
}

pub fn compare(client: &Client, scenarios: &[Scenario]) -> Comparison {
    let computed: Vec<ComparedScenario> = scenarios
        .iter()
        .map(|s| ComparedScenario {
            scenario_id: s.id.clone(),
            name: s.name.clone(),
            color: s.color.clone(),
            projection: project(client, &s.adjustments),
        })
        .collect();
    let base_idx = scenarios.iter().position(|s| s.is_baseline).unwrap_or(0);
    let baseline_id = scenarios.get(base_idx).map(|s| s.id.clone()).unwrap_or_default();
    let mut deltas = vec![];
    if let Some(base) = computed.get(base_idx) {
        let base_vals = pick(&base.projection);
        for c in &computed {
            for (i, (metric, label, value)) in pick(&c.projection).into_iter().enumerate() {
                let baseline = base_vals[i].2;
                deltas.push(ComparisonDelta {
                    scenario_id: c.scenario_id.clone(),
                    metric,
                    label,
                    value,
                    baseline,
                    delta: value.zip(baseline).map(|(v, b)| v - b),
                });
            }
        }
    }
    Comparison { baseline_id, scenarios: computed, deltas }
}
