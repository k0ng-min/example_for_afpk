//! AI 상담: 규칙 엔진 답변을 먼저 만들고, Gemini 가 연결되어 있으면 같은 근거 데이터로 자연어 답변을 생성한다.
//! - Gemini 에는 Rust 계산 결과(지표·예측 요약·목표·경고)와 규칙 엔진 답변만 전달한다.
//! - Gemini 답변 속 금액·비율은 계산값과 자동 대조해 일치하지 않는 숫자를 `unverified_numbers` 로 표시한다.
//! - 호출 실패 시 규칙 엔진 답변을 그대로 돌려주고 실패 사유를 `llm_error` 에 담는다(허위로 LLM 답변이라 하지 않음).

use serde_json::json;

use crate::domain::clients::Client;
use crate::finance::metrics::{Metric, Unit};
use crate::finance::projections::Projection;
use crate::integrations::ai::gemini::check_numbers;
use crate::services::analysis::{format_value, CopilotAnswer, Insight};
use crate::services::state::AppState;

/// Gemini 에 넘기는 근거 데이터와, 답변 대조에 쓰는 허용 수치(원 / bp)
fn grounding(client: &Client, metrics: &[Metric], projection: &Projection, insights: &[Insight]) -> (serde_json::Value, Vec<i64>, Vec<i64>) {
    let mut won: Vec<i64> = vec![];
    let mut bps: Vec<i64> = vec![];
    let ms: Vec<_> = metrics
        .iter()
        .map(|m| {
            match (m.unit, m.value) {
                (Unit::Won, Some(v)) => won.push(v),
                (Unit::Bps, Some(v)) => bps.push(v),
                _ => {}
            }
            for i in &m.inputs {
                won.push(i.value);
            }
            json!({ "key": m.key, "label": m.label, "value": format_value(m.unit, m.value), "formula": m.formula })
        })
        .collect();
    let s = &projection.summary;
    won.extend([
        s.first_month_net_cashflow, s.average_net_cashflow, s.min_cash, s.final_cash, s.final_net_worth,
        s.net_worth_change, s.total_interest_paid, s.emergency_reserve, s.total_household_transfer,
    ]);
    won.extend([
        client.monthly_income, client.fixed_expenses, client.variable_expenses, client.family_support,
        client.cash_assets, client.investment_assets, client.other_assets,
        client.fixed_expenses + client.variable_expenses,
    ]);
    for l in &client.liabilities {
        won.extend([l.balance, l.monthly_payment]);
        bps.push(l.annual_rate_bps);
    }
    if let Some(b) = &client.business {
        won.extend([b.monthly_revenue, b.monthly_cost, b.operating_cash, b.owner_draw]);
    }
    if let Some(p) = &client.pattern {
        bps.extend([p.annual_income_growth_bps, p.annual_expense_growth_bps]);
        won.extend(p.annual_inflows.iter().chain(&p.annual_outflows).map(|i| i.amount));
    }
    let goals: Vec<_> = s
        .goals
        .iter()
        .map(|g| {
            won.extend([g.target_amount, g.cumulative_target, g.gap_at_target, -g.gap_at_target, g.required_monthly_saving]);
            json!({
                "name": g.name, "priority": g.priority, "targetAmount": format_value(Unit::Won, Some(g.target_amount)),
                "targetMonth": g.target_month, "achievedMonth": g.achieved_month, "onTrack": g.on_track,
                "gapAtTarget": format_value(Unit::Won, Some(g.gap_at_target)),
                "requiredMonthlySaving": format_value(Unit::Won, Some(g.required_monthly_saving)),
            })
        })
        .collect();
    let data = json!({
        "client": {
            "name": client.name, "age": client.age, "occupation": client.occupation,
            "familySituation": client.family_situation, "synthetic": true,
            "assumptions": client.assumptions,
        },
        "metrics": ms,
        "projection": {
            "horizonMonths": s.horizon_months,
            "minCash": format_value(Unit::Won, Some(s.min_cash)), "minCashMonth": s.min_cash_month,
            "finalNetWorth": format_value(Unit::Won, Some(s.final_net_worth)),
            "totalInterestPaid": format_value(Unit::Won, Some(s.total_interest_paid)),
            "firstNegativeCashMonth": s.first_negative_cash_month,
            "negativeCashflowMonths": s.negative_cashflow_months,
            "warnings": projection.warnings.iter().map(|w| &w.message).collect::<Vec<_>>(),
        },
        "goals": goals,
        "insights": insights.iter().map(|i| json!({ "title": i.title, "message": i.message })).collect::<Vec<_>>(),
    });
    (data, won, bps)
}

pub async fn answer(state: &AppState, question: &str, client: &Client, metrics: &[Metric], projection: &Projection, insights: &[Insight], rule: CopilotAnswer) -> CopilotAnswer {
    let Some(gemini) = &state.ai.gemini else { return rule };
    let (data, won, bps) = grounding(client, metrics, projection, insights);
    let system = format!("{}\n\n{}", state.ai.base_prompt, state.ai.copilot_prompt);
    let user = format!(
        "<client_data>\n{}\n</client_data>\n\n<rule_engine_answer>\n{}\n</rule_engine_answer>\n\n질문: {}",
        serde_json::to_string_pretty(&data).unwrap_or_default(),
        rule.text,
        question
    );
    match gemini.generate(&system, &user).await {
        Ok((text, used_model)) => {
            let (n, bad) = check_numbers(&text, &won, &bps);
            CopilotAnswer {
                supported: true,
                intent: rule.intent,
                text: text.trim().to_string(),
                cited_metrics: rule.cited_metrics.clone(),
                source: "gemini",
                model: Some(used_model),
                rule_text: Some(rule.text),
                numbers_checked: n,
                unverified_numbers: bad,
                llm_error: None,
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "Gemini 호출 실패 — 규칙 엔진 답변으로 대체");
            CopilotAnswer { llm_error: Some(e), ..rule }
        }
    }
}
