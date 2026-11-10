//! 규칙 기반 분석(AI API 없이 동작). 모든 인사이트는 계산 엔진 지표와 연결되며 source 로 출처를 구분한다.

use serde::Serialize;

use crate::domain::topics::{Rule, RuleOp, Severity};
use crate::finance::metrics::{Metric, Unit};
use crate::finance::projections::Projection;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: String,
    pub title: String,
    pub message: String,
    pub severity: Severity,
    pub metric: String,
    pub value: Option<i64>,
    /// "rule_engine" | "llm" — AI 생성 결과와 검증된 계산 결과를 구분
    pub source: &'static str,
    pub formula: String,
}

pub fn group_thousands(v: i64) -> String {
    let s = v.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    if v < 0 {
        format!("-{out}")
    } else {
        out
    }
}

pub fn format_value(unit: Unit, value: Option<i64>) -> String {
    let Some(v) = value else { return "해당 없음".into() };
    match unit {
        Unit::Won => format!("{}원", group_thousands(v)),
        Unit::Bps => format!("{}.{:02}%", v / 100, (v % 100).abs()),
        Unit::MonthsX10 => format!("{}.{}개월", v / 10, (v % 10).abs()),
        Unit::Months => format!("{v}개월"),
        Unit::Count => format!("{v}개"),
    }
}

pub fn evaluate_rules(rules: &[Rule], metrics: &[Metric]) -> Vec<Insight> {
    let mut out: Vec<Insight> = rules
        .iter()
        .filter_map(|r| {
            let m = metrics.iter().find(|m| m.key == r.metric)?;
            let fired = match (r.op, m.value) {
                (RuleOp::Missing, v) => v.is_none(),
                (RuleOp::Present, v) => v.is_some(),
                (_, None) => false,
                (RuleOp::Lt, Some(v)) => v < r.threshold,
                (RuleOp::Lte, Some(v)) => v <= r.threshold,
                (RuleOp::Gt, Some(v)) => v > r.threshold,
                (RuleOp::Gte, Some(v)) => v >= r.threshold,
            };
            fired.then(|| Insight {
                id: r.id.clone(),
                title: r.title.clone(),
                message: r.message.replace("{value}", &format_value(m.unit, m.value)),
                severity: r.severity,
                metric: r.metric.clone(),
                value: m.value,
                source: "rule_engine",
                formula: m.formula.to_string(),
            })
        })
        .collect();
    out.sort_by_key(|i| match i.severity {
        Severity::Critical => 0,
        Severity::Warning => 1,
        Severity::Info => 2,
    });
    out
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotAnswer {
    pub supported: bool,
    pub intent: &'static str,
    pub text: String,
    pub cited_metrics: Vec<&'static str>,
    /// "rule_engine" | "gemini"
    pub source: &'static str,
    /// LLM 답변일 때 사용한 모델 id
    pub model: Option<String>,
    /// LLM 답변일 때 비교용 규칙 엔진 답변(검증된 결정론적 답)
    pub rule_text: Option<String>,
    /// LLM 답변 속 금액·비율 개수와, 계산값과 일치하지 않는 숫자
    pub numbers_checked: usize,
    pub unverified_numbers: Vec<String>,
    /// LLM 호출 실패 시 사유(이때 text 는 규칙 엔진 답변)
    pub llm_error: Option<String>,
}

const INTENTS: &[(&str, &[&str])] = &[
    ("unsupported", &["세금", "연말정산", "보험 추천", "종목", "코인", "비트코인", "부동산 시세", "금리 전망", "주가", "연금 수령액"]),
    ("business", &["사업", "매출", "전염", "가게", "운영자금"]),
    ("debt", &["부채", "대출", "상환", "이자", "빚", "카드론"]),
    ("emergency", &["비상", "예비", "버틸", "긴급", "소진", "런웨이", "몇 개월"]),
    ("goal", &["목표", "달성", "언제", "독립", "mba", "결혼", "자동차", "우선순위"]),
    ("networth", &["순자산", "자산", "재산"]),
    ("risk", &["위험", "리스크", "문제", "경고", "주의"]),
    ("cashflow", &["현금흐름", "저축", "남는", "남나", "남아", "남을", "모을", "여력", "잉여", "적자", "흑자", "소득", "지출", "매월", "한 달"]),
];

fn find<'a>(metrics: &'a [Metric], key: &str) -> Option<&'a Metric> {
    metrics.iter().find(|m| m.key == key)
}

fn say(metrics: &[Metric], key: &str) -> String {
    find(metrics, key)
        .map(|m| format!("{} {}", m.label, format_value(m.unit, m.value)))
        .unwrap_or_default()
}

pub fn copilot_answer(
    question: &str,
    metrics: &[Metric],
    projection: &Projection,
    insights: &[Insight],
) -> CopilotAnswer {
    let q = question.to_lowercase();
    let intent = INTENTS
        .iter()
        .find(|(_, kws)| kws.iter().any(|k| q.contains(k)))
        .map(|(i, _)| *i)
        .unwrap_or("none");
    let s = &projection.summary;
    let (supported, text, cited): (bool, String, Vec<&'static str>) = match intent {
        "unsupported" => (
            false,
            "이 질문은 세금·보험·투자상품·시장 전망 등 현재 계산 엔진이 다루지 않는 영역입니다. 확인되지 않은 정보를 생성하지 않기 위해 답변하지 않습니다. 해당 내용은 공식 출처를 확인한 뒤 시나리오 이벤트로 직접 입력해 주세요.".into(),
            vec![],
        ),
        "cashflow" => (
            true,
            format!(
                "{}. {}. 시뮬레이션 기간 평균 순현금흐름은 {}이며, 적자인 달은 {}개월입니다.",
                say(metrics, "monthly_surplus"),
                say(metrics, "savings_rate_bps"),
                format_value(Unit::Won, Some(s.average_net_cashflow)),
                s.negative_cashflow_months
            ),
            vec!["monthly_surplus", "savings_rate_bps"],
        ),
        "debt" => (
            true,
            format!(
                "{}. {}. {}.",
                say(metrics, "debt_service_ratio_bps"),
                say(metrics, "total_interest_paid"),
                match s.household_debt_free_month {
                    Some(m) => format!("가계부채는 {m}개월 차에 상환 완료됩니다"),
                    None => "시뮬레이션 기간 내 가계부채 상환 완료 시점이 없거나 가계부채가 없습니다".into(),
                }
            ),
            vec!["debt_service_ratio_bps", "total_interest_paid", "household_debt_free_month"],
        ),
        "emergency" => (
            true,
            format!(
                "{}. 비상예비자금 목표는 {}입니다. {}.",
                say(metrics, "emergency_fund_months_x10"),
                format_value(Unit::Won, Some(s.emergency_reserve)),
                match s.first_negative_cash_month {
                    Some(m) => format!("현재 조건이면 {m}개월 차에 현금이 소진됩니다"),
                    None => format!(
                        "기간 내 현금 소진은 없으며 최저 현금은 {}개월 차 {}입니다",
                        s.min_cash_month,
                        format_value(Unit::Won, Some(s.min_cash))
                    ),
                }
            ),
            vec!["emergency_fund_months_x10", "min_cash", "cash_runway_month"],
        ),
        "goal" => {
            let lines: Vec<String> = s
                .goals
                .iter()
                .map(|g| {
                    format!(
                        "{}순위 '{}': {} (목표 {}개월, 필요 월저축 {})",
                        g.priority,
                        g.name,
                        match g.achieved_month {
                            Some(m) if g.on_track => format!("{m}개월 차 달성 가능"),
                            Some(m) => format!("{m}개월 차 달성 — 목표 시점 초과"),
                            None => "기간 내 달성 불가".into(),
                        },
                        g.target_month,
                        format_value(Unit::Won, Some(g.required_monthly_saving))
                    )
                })
                .collect();
            if lines.is_empty() {
                (true, "등록된 재무목표가 없습니다. Client Profile에서 목표를 추가하세요.".into(), vec![])
            } else {
                (true, lines.join("\n"), vec!["goals_on_track", "primary_goal_achieved_month", "primary_goal_required_saving"])
            }
        }
        "networth" => (
            true,
            format!("{}. {}. 기간 중 순자산 변화는 {}입니다.", say(metrics, "net_worth"), say(metrics, "final_net_worth"), format_value(Unit::Won, Some(s.net_worth_change))),
            vec!["net_worth", "final_net_worth"],
        ),
        "business" => {
            if s.business_cash_depleted_month.is_none() && s.total_household_transfer == 0 && find(metrics, "business_cash_depleted_month").is_some_and(|m| m.value.is_none()) {
                (true, "현재 시나리오에서는 사업 현금 부족이나 가계 전염이 발생하지 않습니다. 사업 프로필이 없는 고객이라면 해당 분석은 적용되지 않습니다.".into(), vec!["total_household_transfer"])
            } else {
                (
                    true,
                    format!("{}. {}.", say(metrics, "business_cash_depleted_month"), say(metrics, "total_household_transfer")),
                    vec!["business_cash_depleted_month", "total_household_transfer"],
                )
            }
        }
        "risk" => {
            let mut lines: Vec<String> = insights.iter().take(5).map(|i| format!("[{}] {}", i.title, i.message)).collect();
            lines.extend(projection.warnings.iter().take(3).map(|w| format!("[계산 경고] {}", w.message)));
            if lines.is_empty() {
                (true, "현재 규칙과 계산 기준으로 탐지된 주요 위험이 없습니다.".into(), vec![])
            } else {
                (true, lines.join("\n"), vec![])
            }
        }
        _ => (
            false,
            "질문 의도를 규칙 기반 엔진이 파악하지 못했습니다. 지원 질문 예: '매월 얼마나 남나요?', '비상자금으로 몇 개월 버틸 수 있나요?', '목표는 언제 달성되나요?', '부채 이자는 얼마인가요?', '주요 위험은?'".into(),
            vec![],
        ),
    };
    CopilotAnswer { supported, intent, text, cited_metrics: cited, source: "rule_engine", model: None, rule_text: None, numbers_checked: 0, unverified_numbers: vec![], llm_error: None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats() {
        assert_eq!(group_thousands(1_234_567), "1,234,567");
        assert_eq!(group_thousands(-1_000), "-1,000");
        assert_eq!(format_value(Unit::Bps, Some(1563)), "15.63%");
        assert_eq!(format_value(Unit::MonthsX10, Some(31)), "3.1개월");
        assert_eq!(format_value(Unit::Won, None), "해당 없음");
    }
}
