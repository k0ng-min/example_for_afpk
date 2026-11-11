//! 탐색 분석: "무엇이 결과를 가장 크게 바꾸는가"(민감도)와 "공적 지원·대출을 받으면 어떻게 되는가"(제도 비교).
//!
//! 모든 수치는 `simulate` 를 입력만 바꿔 다시 돌린 결과다. 새 계산식은 없다.
//! - 버팀 개월 수: 전업 수험(A)을 계속할 때 월말 잔액이 안전자금 아래로 처음 내려가기 전까지 유지되는 개월 수(최대 48개월까지 봄)
//! - 지원 제도: 금액·기간은 2026년 공고·보도 기준이며 2027년 선정·지급은 확정되지 않았다(`verified = false`).

use serde::{Deserialize, Serialize};

use super::sim::{simulate, Outcome, Strategy, STRATEGIES};
use super::{CpaInputs, ExtraFlow, Ym};

const RUNWAY_HORIZON: u32 = 48;

/// 전업 유지 시 안전자금을 지키는 개월 수. 48개월 안에 위반이 없으면 None(= 48개월 이상)
pub fn runway_months(i: &CpaInputs) -> Option<u32> {
    let p = simulate(i, Strategy::A, Outcome::Unresolved, RUNWAY_HORIZON);
    p.tau.map(|t| i.index_of(t).max(1) as u32 - 1)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitivityRow {
    pub key: &'static str,
    pub label: &'static str,
    /// 낮춘 쪽·높인 쪽 설명(예: "-20%", "3개월 빨리")
    pub low_label: String,
    pub high_label: String,
    pub runway_low: Option<u32>,
    pub runway_high: Option<u32>,
    /// 18개월 말 잔액(전업 수험)
    pub end_low: i64,
    pub end_high: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sensitivity {
    pub runway_base: Option<u32>,
    pub end_base: i64,
    pub horizon: u32,
    pub rows: Vec<SensitivityRow>,
}

fn pct(v: i64, p: i64) -> i64 {
    v + v * p / 100
}

fn end18(i: &CpaInputs) -> i64 {
    simulate(i, Strategy::A, Outcome::Unresolved, i.short_horizon).end_cash
}

pub fn sensitivity(i: &CpaInputs) -> Sensitivity {
    type Tweak = Box<dyn Fn(&mut CpaInputs, i64)>;
    // (키, 이름, 변화 방식, 낮춤 설명, 높임 설명). 각 요인은 "고객에게 불리한 쪽 / 유리한 쪽"이 아니라 값의 낮춤·높임이다
    let factors: Vec<(&'static str, &'static str, Tweak, String, String)> = vec![
        ("living", "필수 생활비", Box::new(|x: &mut CpaInputs, d| x.living = pct(x.living, d)), "-20%".into(), "+20%".into()),
        ("cash0", "현재 보유 현금", Box::new(|x: &mut CpaInputs, d| x.cash0 = pct(x.cash0, d)), "-20%".into(), "+20%".into()),
        (
            "support",
            "가족 지원 금액",
            Box::new(|x: &mut CpaInputs, d| {
                x.support_initial = pct(x.support_initial, d);
                x.support_reduced = pct(x.support_reduced, d);
            }),
            "-20%".into(),
            "+20%".into(),
        ),
        (
            "supportStop",
            "가족 지원 종료 시점",
            Box::new(|x: &mut CpaInputs, d| {
                let n = if d < 0 { -3 } else { 3 };
                x.support_stop_from = x.support_stop_from.add(n);
                if x.support_reduce_from > x.support_stop_from {
                    x.support_reduce_from = x.support_stop_from;
                }
            }),
            "3개월 빨리".into(),
            "3개월 늦게".into(),
        ),
        (
            "exam",
            "수험비",
            Box::new(|x: &mut CpaInputs, d| {
                x.exam_cost = pct(x.exam_cost, d);
                x.exam_cost_after = pct(x.exam_cost_after, d);
            }),
            "-20%".into(),
            "+20%".into(),
        ),
        ("safety", "비상금 하한(안전자금)", Box::new(|x: &mut CpaInputs, d| x.safety_min = pct(x.safety_min, d)), "-20%".into(), "+20%".into()),
    ];
    let rows = factors
        .into_iter()
        .map(|(key, label, f, low_label, high_label)| {
            let mut lo = i.clone();
            f(&mut lo, -20);
            let mut hi = i.clone();
            f(&mut hi, 20);
            SensitivityRow { key, label, low_label, high_label, runway_low: runway_months(&lo), runway_high: runway_months(&hi), end_low: end18(&lo), end_high: end18(&hi) }
        })
        .collect();
    Sensitivity { runway_base: runway_months(i), end_base: end18(i), horizon: RUNWAY_HORIZON, rows }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyEffect {
    pub strategy: Strategy,
    pub tau: Option<Ym>,
    pub min_cash: i64,
    pub end_cash: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportOption {
    pub id: &'static str,
    pub name: &'static str,
    /// grant = 갚지 않는 지원금, loan = 갚아야 하는 대출
    pub kind: &'static str,
    pub summary: String,
    pub flows: Vec<ExtraFlow>,
    /// 18개월 동안 들어오는 총액(대출은 원금, 이자 유출은 별도)
    pub total_in: i64,
    pub total_out: i64,
    pub conditions: &'static str,
    pub caution: &'static str,
    pub source: &'static str,
    pub source_url: &'static str,
    /// 2027년 선정·지급이 확인되지 않았으므로 항상 false(계획에 확정 유입으로 넣지 않는다)
    pub verified: bool,
    pub runway: Option<u32>,
    pub effects: Vec<StrategyEffect>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Supports {
    pub base_runway: Option<u32>,
    pub base: Vec<StrategyEffect>,
    pub options: Vec<SupportOption>,
}

fn effects(i: &CpaInputs) -> Vec<StrategyEffect> {
    [Strategy::A, Strategy::D]
        .iter()
        .map(|&s| {
            let p = simulate(i, s, Outcome::Unresolved, i.short_horizon);
            StrategyEffect { strategy: s, tau: p.tau, min_cash: p.min_cash, end_cash: p.end_cash }
        })
        .collect()
}

/// 이 고객에게 해당할 수 있는 공적 지원·정책 대출을 하나씩 넣어 다시 계산한다
pub fn supports(i: &CpaInputs) -> Supports {
    let end = i.start_month.add(i.short_horizon as i32 - 1);
    let loan_at = i.support_stop_from;
    let loan_amount: i64 = 6_000_000;
    // 연 4% 가정, 거치기간 이자만 납부: 600만 × 4% ÷ 12 = 2만 원
    let loan_interest: i64 = 20_000;
    let interest_months = end.diff(loan_at).max(0) as u32;
    let specs: Vec<(&'static str, &'static str, &'static str, Vec<ExtraFlow>, String, &'static str, &'static str, &'static str, &'static str)> = vec![
        (
            "seoulYouth",
            "서울시 청년수당",
            "grant",
            vec![ExtraFlow { from: Ym::new(2027, 5), months: 6, amount: 500_000, label: "서울시 청년수당".into() }],
            "월 50만 원 × 6개월(2027.05부터 가정)".into(),
            "서울 거주 만 19~34세 미취업, 건강보험료 기준 중위소득 150% 이하. 매월 활동 기록 제출",
            "2026년 기준. 연 1~2회 모집·선정제라 2027년 선정 여부와 지급 시작 월은 알 수 없음",
            "서울시 미디어허브(2026 청년수당 모집)",
            "https://mediahub.seoul.go.kr/archives/2017342",
        ),
        (
            "kua",
            "국민취업지원제도 구직촉진수당",
            "grant",
            vec![ExtraFlow { from: i.announce_month.add(1), months: 6, amount: 600_000, label: "구직촉진수당".into() }],
            format!("월 60만 원 × 6개월({}부터 가정)", i.announce_month.add(1).label().replace('-', ".")),
            "만 18~34세 청년 특례, 가구 중위소득·재산 기준. 매월 구직활동 이행 필요",
            "구직활동 의무 때문에 전업 수험 중에는 맞지 않음 → 발표 후 수습 미지정·불합격 시 검토. 금액은 2026년 인상분(블로그·보도 기준, 고용24 확인 필요)",
            "위키트리(2026 구직촉진수당 월 60만 원)",
            "https://www.wikitree.co.kr/articles/1134313",
        ),
        (
            "sunshineLoan",
            "햇살론 유스(정책 대출)",
            "loan",
            vec![
                ExtraFlow { from: loan_at, months: 1, amount: loan_amount, label: "햇살론 유스 600만 원".into() },
                ExtraFlow { from: loan_at.add(1), months: interest_months.max(1), amount: -loan_interest, label: "대출 이자(연 4% 가정)".into() },
            ],
            format!("{}에 600만 원 대출, 이후 월 이자 2만 원(연 4% 가정, 거치)", loan_at.label().replace('-', ".")),
            "만 19~34세, 연소득 3,500만 원 이하 미취업 청년·대학(원)생 등. 1인 평생 1,200만 원 한도",
            "갚아야 하는 빚. 수습 급여가 늦어지면 상환 부담이 공백 ②와 겹침. 금리는 취급 기관·신용에 따라 다름",
            "뱅크샐러드(햇살론 유스 조건)",
            "https://www.banksalad.com/product/loans/CDLN003502",
        ),
    ];
    let options = specs
        .into_iter()
        .map(|(id, name, kind, flows, summary, conditions, caution, source, source_url)| {
            let mut x = i.clone();
            x.extra_flows.extend(flows.iter().cloned());
            let in_window = |f: &ExtraFlow| (0..i.short_horizon as i32).map(|k| f.at(i.start_month.add(k))).sum::<i64>();
            let total_in = flows.iter().filter(|f| f.amount > 0).map(in_window).sum();
            let total_out = -flows.iter().filter(|f| f.amount < 0).map(in_window).sum::<i64>();
            SupportOption { id, name, kind, summary, total_in, total_out, conditions, caution, source, source_url, verified: false, runway: runway_months(&x), effects: effects(&x), flows }
        })
        .collect();
    Supports { base_runway: runway_months(i), base: effects(i), options }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Explore {
    pub sensitivity: Sensitivity,
    pub supports: Supports,
    pub stress: Stress,
    pub fans: Vec<Fan>,
}

pub fn explore(i: &CpaInputs) -> Explore {
    Explore { sensitivity: sensitivity(i), supports: supports(i), stress: stress(i), fans: fans(i) }
}

/* ── 지연 범위(팬 차트): 합격·수습 확보 후 첫 급여 지연 L = 0~9개월 각각의 월말 잔액 ── */

pub const FAN_DELAYS: [u32; 10] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fan {
    pub strategy: Strategy,
    pub delays: Vec<u32>,
    pub months: Vec<Ym>,
    /// series[k][t] = 지연 delays[k] 일 때 t 번째 달 월말 잔액
    pub series: Vec<Vec<i64>>,
    /// 지연별 최초 안전자금 위반월
    pub taus: Vec<Option<Ym>>,
    pub missing: Vec<&'static str>,
}

/// 발표 후 최대 지연(9개월) + 3개월까지 보이도록 기간을 잡는다(최대 36개월)
pub fn fan_horizon(i: &CpaInputs) -> u32 {
    let need = i.index_of(i.announce_month).max(1) as u32 + 12;
    need.clamp(i.short_horizon, 36)
}

pub fn fans(i: &CpaInputs) -> Vec<Fan> {
    let h = fan_horizon(i);
    STRATEGIES
        .iter()
        .map(|&s| {
            let paths: Vec<_> = FAN_DELAYS.iter().map(|&d| simulate(i, s, Outcome::PassPlaced { delay: d }, h)).collect();
            let missing = paths.iter().flat_map(|p| p.missing.iter().copied()).collect::<std::collections::BTreeSet<_>>().into_iter().collect();
            Fan {
                strategy: s,
                delays: FAN_DELAYS.to_vec(),
                months: paths[0].months.iter().map(|r| r.month).collect(),
                series: paths.iter().map(|p| p.months.iter().map(|r| r.cash).collect()).collect(),
                taus: paths.iter().map(|p| p.tau).collect(),
                missing,
            }
        })
        .collect()
}

/* ── 스트레스 테스트: 나쁜 일이 생기면 어느 전략이 버티나 ── */

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressEffect {
    pub strategy: Strategy,
    pub tau: Option<Ym>,
    pub insolvent: Option<Ym>,
    pub min_cash: i64,
    pub end_cash: i64,
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressCase {
    pub id: &'static str,
    pub label: &'static str,
    pub detail: String,
    pub effects: Vec<StressEffect>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stress {
    pub base: StressCase,
    pub cases: Vec<StressCase>,
}

fn stress_effects(i: &CpaInputs) -> Vec<StressEffect> {
    STRATEGIES
        .iter()
        .map(|&s| {
            let p = simulate(i, s, Outcome::Unresolved, i.short_horizon);
            StressEffect { strategy: s, tau: p.tau, insolvent: p.insolvent, min_cash: p.min_cash, end_cash: p.end_cash, missing: !p.missing.is_empty() }
        })
        .collect()
}

type Shock = (&'static str, &'static str, String, fn(&mut CpaInputs));

fn shock_support_early(x: &mut CpaInputs) {
    x.support_stop_from = x.support_stop_from.add(-3);
    if x.support_reduce_from > x.support_stop_from {
        x.support_reduce_from = x.support_stop_from;
    }
}
fn shock_living(x: &mut CpaInputs) {
    x.living += x.living * 15 / 100;
}
fn shock_pt_late(x: &mut CpaInputs) {
    x.part_time_lead += 2;
}
fn shock_pt_low(x: &mut CpaInputs) {
    x.part_time_income -= x.part_time_income / 4;
}
fn shock_emergency(x: &mut CpaInputs) {
    x.extra_flows.push(super::ExtraFlow { from: x.start_month.add(2), months: 1, amount: -3_000_000, label: "긴급 지출(스트레스 테스트)".into() });
}

fn shocks(i: &CpaInputs) -> Vec<Shock> {
    vec![
        ("supportEarly", "가족 지원이 3개월 일찍 끊김", format!("지원 종료 {} → {}", i.support_stop_from.label().replace('-', "."), i.support_stop_from.add(-3).label().replace('-', ".")), shock_support_early),
        ("living15", "물가·월세 상승(생활비 +15%)", format!("월 {}만 → {}만 원", i.living / 10_000, (i.living + i.living * 15 / 100) / 10_000), shock_living),
        ("ptLate", "아르바이트가 2개월 늦게 구해짐", format!("근로 결정 → 첫 소득 {}개월 → {}개월", i.part_time_lead, i.part_time_lead + 2), shock_pt_late),
        ("ptLow", "아르바이트 소득 25% 감소", format!("월 {}만 → {}만 원", i.part_time_income / 10_000, (i.part_time_income - i.part_time_income / 4) / 10_000), shock_pt_low),
        ("emergency", "300만 원 긴급 지출(병원·이사)", format!("{}에 한 번", i.start_month.add(2).label().replace('-', ".")), shock_emergency),
    ]
}

pub fn stress(i: &CpaInputs) -> Stress {
    let list = shocks(i);
    let mut all = i.clone();
    let mut cases: Vec<StressCase> = list
        .iter()
        .map(|(id, label, detail, f)| {
            let mut x = i.clone();
            f(&mut x);
            f(&mut all);
            StressCase { id, label, detail: detail.clone(), effects: stress_effects(&x) }
        })
        .collect();
    cases.push(StressCase { id: "all", label: "위 다섯 가지가 한꺼번에", detail: "최악의 경우".into(), effects: stress_effects(&all) });
    Stress { base: StressCase { id: "base", label: "지금 가정", detail: "충격 없음".into(), effects: stress_effects(i) }, cases }
}

/* ── 월별 점검(6단계 모니터링): 실제 월말 잔액을 계획과 비교하고, 그 잔액에서 다시 계산 ── */

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckinEntry {
    pub month: Ym,
    pub cash: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckinRequest {
    #[serde(default)]
    pub inputs: CpaInputs,
    pub strategy: Strategy,
    pub entries: Vec<CheckinEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckinRow {
    pub month: Ym,
    pub actual: i64,
    /// 계획(선택 전략, 결과 미반영 기준) 월말 잔액. 계획 기간 밖이면 None
    pub plan: Option<i64>,
    pub diff: Option<i64>,
    /// "safe" | "signal1" | "signal2" | "belowSafety"
    pub level: &'static str,
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reprojection {
    pub from: Ym,
    pub cash: i64,
    /// 이 잔액에서 공부만 계속할 때 안전자금을 지키는 개월 수(48개월 이상이면 None)
    pub runway: Option<u32>,
    pub strategy_tau: Option<Ym>,
    pub strategy_end: i64,
    pub end_month: Ym,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanPoint {
    pub month: Ym,
    pub cash: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkin {
    pub strategy: Strategy,
    pub plan: Vec<PlanPoint>,
    pub rows: Vec<CheckinRow>,
    pub reprojection: Option<Reprojection>,
}

pub fn validate_checkin(r: &CheckinRequest) -> Vec<crate::finance::validation::FieldError> {
    let mut e = super::validate(&r.inputs);
    let bad = |m: &str| crate::finance::validation::FieldError { field: "entries".into(), message: m.into() };
    if r.entries.len() > 36 {
        e.push(bad("점검 기록은 36개까지 넣을 수 있습니다"));
    }
    let start = r.inputs.start_month;
    if r.entries.iter().any(|x| x.month < start || x.month.diff(start) >= 36 || x.cash.abs() > 10_000_000_000) {
        e.push(bad("점검 월은 분석 시작부터 36개월 안, 잔액은 ±100억 원 이내여야 합니다"));
    }
    e
}

pub fn checkin(r: &CheckinRequest) -> Checkin {
    let i = &r.inputs;
    let path = simulate(i, r.strategy, Outcome::Unresolved, i.short_horizon);
    let plan: Vec<PlanPoint> = path.months.iter().map(|m| PlanPoint { month: m.month, cash: m.cash }).collect();
    let mut entries = r.entries.clone();
    entries.sort_by_key(|x| x.month);
    entries.dedup_by_key(|x| x.month);
    let rows = entries
        .iter()
        .map(|x| {
            let p = plan.iter().find(|q| q.month == x.month).map(|q| q.cash);
            let (level, action) = if x.cash < i.safety_min {
                ("belowSafety", format!("비상금 하한({}만 원) 아래입니다. 지출을 줄이고 근로·구직을 바로 시작하세요.", i.safety_min / 10_000))
            } else if x.cash <= i.signal2 {
                ("signal2", format!("점검선 2({}만 원) 도달: 구직을 시작합니다(첫 급여까지 약 {}개월).", i.signal2 / 10_000, i.job_lead))
            } else if x.cash <= i.signal1 {
                ("signal1", format!("점검선 1({}만 원) 도달: 아르바이트를 시작합니다(첫 소득까지 약 {}개월).", i.signal1 / 10_000, i.part_time_lead))
            } else {
                ("safe", "점검선 위: 지금 계획을 유지합니다.".to_string())
            };
            CheckinRow { month: x.month, actual: x.cash, plan: p, diff: p.map(|v| x.cash - v), level, action }
        })
        .collect();
    let reprojection = entries.last().map(|last| {
        let mut x = i.clone();
        x.start_month = last.month.add(1);
        x.cash0 = last.cash;
        let p = simulate(&x, r.strategy, Outcome::Unresolved, x.short_horizon);
        Reprojection { from: x.start_month, cash: last.cash, runway: runway_months(&x), strategy_tau: p.tau, strategy_end: p.end_cash, end_month: x.start_month.add(x.short_horizon as i32 - 1) }
    });
    Checkin { strategy: r.strategy, plan, rows, reprojection }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runway_matches_first_breach() {
        // 기본 가정: 전업은 2027.10 에 처음 하한 아래 → 시작(2026.12)부터 10개월 유지
        assert_eq!(runway_months(&CpaInputs::default()), Some(10));
    }

    #[test]
    fn sensitivity_moves_in_expected_direction() {
        let s = sensitivity(&CpaInputs::default());
        let row = |k: &str| s.rows.iter().find(|r| r.key == k).unwrap().clone();
        let living = row("living");
        assert!(living.runway_low >= s.runway_base && living.runway_high <= s.runway_base);
        assert!(living.end_low > s.end_base && living.end_high < s.end_base);
        let cash = row("cash0");
        assert!(cash.end_high - s.end_base == 14_000_000 / 5);
    }

    #[test]
    fn fan_series_cover_all_delays() {
        let f = fans(&CpaInputs::default());
        assert_eq!(f.len(), 4);
        let a = &f[0];
        assert_eq!(a.series.len(), 10);
        // 지연이 길수록 마지막 달 잔액은 같거나 작다
        let last: Vec<i64> = a.series.iter().map(|s| *s.last().unwrap()).collect();
        assert!(last.windows(2).all(|w| w[0] >= w[1]), "{last:?}");
    }

    #[test]
    fn stress_all_is_worst() {
        let s = stress(&CpaInputs::default());
        assert_eq!(s.cases.len(), 6);
        let all = s.cases.last().unwrap();
        // 규칙이 없는 A·B·C 는 충격이 겹치면 반드시 나빠진다. D 는 점검선에 더 빨리 닿아 취업 전환이 앞당겨지므로 예외일 수 있다
        for (k, e) in all.effects.iter().enumerate().take(3) {
            assert!(e.end_cash <= s.base.effects[k].end_cash, "{:?}", e.strategy);
        }
    }

    #[test]
    fn checkin_flags_signals_and_reprojects() {
        let i = CpaInputs::default();
        let r = CheckinRequest {
            inputs: i.clone(),
            strategy: Strategy::D,
            entries: vec![CheckinEntry { month: Ym::new(2027, 1), cash: 13_000_000 }, CheckinEntry { month: Ym::new(2027, 2), cash: 7_000_000 }],
        };
        assert!(validate_checkin(&r).is_empty());
        let c = checkin(&r);
        assert_eq!(c.rows[0].level, "safe");
        assert_eq!(c.rows[1].level, "signal1");
        let rp = c.reprojection.unwrap();
        assert_eq!(rp.from, Ym::new(2027, 3));
        assert!(rp.runway.unwrap_or(48) < runway_months(&i).unwrap_or(48));
    }

    #[test]
    fn supports_add_cash_and_loan_has_interest() {
        let s = supports(&CpaInputs::default());
        let seoul = s.options.iter().find(|o| o.id == "seoulYouth").unwrap();
        assert_eq!(seoul.total_in, 3_000_000);
        let a_base = s.base.iter().find(|e| e.strategy == Strategy::A).unwrap();
        let a_seoul = seoul.effects.iter().find(|e| e.strategy == Strategy::A).unwrap();
        assert_eq!(a_seoul.end_cash - a_base.end_cash, 3_000_000);
        let loan = s.options.iter().find(|o| o.id == "sunshineLoan").unwrap();
        assert_eq!(loan.total_in, 6_000_000);
        assert!(loan.total_out > 0);
        assert!(s.options.iter().all(|o| !o.verified));
    }
}
