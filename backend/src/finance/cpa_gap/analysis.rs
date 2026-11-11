//! 분석 묶음: 18개월 전략 비교, 지연 내성, 두 단계 불확실성, 전환 신호, 60개월 조건부 장기 가치.
//!
//! V = p × [ q × V(수습 확보, L) + (1 − q) × V(미지정) ] + (1 − p) × V(불합격)
//! V(경로) = Σ_t 순현금흐름_t / (1 + r/12)^t  (t = 1..60, 월말 기준)
//! p·q 는 예측 확률이 아니라 민감도 분석용 시나리오 조건이다.

use rust_decimal::Decimal;
use serde::Serialize;

use super::sim::{simulate, Outcome, PathResult, Strategy, STRATEGIES};
use super::{CpaInputs, Ym};
use crate::finance::rounding::round_won;

pub const DELAYS: [u32; 4] = [0, 3, 6, 9];
pub const RATES_BPS: [u32; 3] = [300, 500, 700];

/// 할인율(연, bp)로 월말 순현금흐름의 현재가치
pub fn present_value(nets: &[i64], rate_bps: u32) -> i64 {
    let rm = Decimal::from(rate_bps) / Decimal::from(10_000) / Decimal::from(12);
    let step = Decimal::ONE + rm;
    let mut df = Decimal::ONE;
    let mut acc = Decimal::ZERO;
    for &n in nets {
        df /= step;
        acc += Decimal::from(n) * df;
    }
    round_won(acc)
}

/// 합격 후 첫 급여가 늦어져도 안전자금을 지킬 수 있는 지연 개월 수
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tolerance {
    pub strategy: Strategy,
    /// None = 발표 시점에 이미 안전자금 미만(지연 0개월도 불가)
    pub months: Option<u32>,
    /// 분석 기간 끝까지 유지(실제 내성은 이보다 길 수 있음)
    pub open_ended: bool,
    /// 마지막으로 버틴 달의 잔액 − 안전자금
    pub margin: Option<i64>,
    /// 가장 빠른 첫 급여월(발표 다음 달)
    pub earliest_pay: Ym,
    pub available: bool,
    pub missing: Vec<&'static str>,
}

pub fn tolerance(i: &CpaInputs, base: &PathResult) -> Tolerance {
    let ann = i.index_of(i.announce_month) as usize; // 1-based
    let rows = &base.months;
    let mut out = Tolerance { strategy: base.strategy, months: None, open_ended: false, margin: None, earliest_pay: i.announce_month.add(1), available: base.complete(), missing: base.missing.clone() };
    if ann == 0 || ann > rows.len() {
        return out;
    }
    // 발표 달까지 모두 안전자금 이상이어야 지연 0개월이 성립
    if rows[..ann].iter().any(|m| m.cash < i.safety_min) {
        return out;
    }
    let mut l = 0u32;
    let mut last = rows[ann - 1].cash;
    for m in &rows[ann..] {
        if m.cash < i.safety_min {
            break;
        }
        l += 1;
        last = m.cash;
    }
    out.open_ended = ann + l as usize >= rows.len();
    out.months = Some(l);
    out.margin = Some(last - i.safety_min);
    out
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    pub outcome: Outcome,
    pub min_cash: i64,
    pub min_month: Ym,
    pub tau: Option<Ym>,
    pub insolvent: Option<Ym>,
    pub end_cash: i64,
    pub first_income: Option<Ym>,
    pub safe: bool,
    pub complete: bool,
    pub missing: Vec<&'static str>,
}

impl From<&PathResult> for BranchSummary {
    fn from(p: &PathResult) -> Self {
        Self { outcome: p.outcome, min_cash: p.min_cash, min_month: p.min_month, tau: p.tau, insolvent: p.insolvent, end_cash: p.end_cash, first_income: p.first_income, safe: p.safe(), complete: p.complete(), missing: p.missing.clone() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyBranches {
    pub strategy: Strategy,
    pub branches: Vec<BranchSummary>,
}

fn outcomes() -> Vec<Outcome> {
    let mut v: Vec<Outcome> = DELAYS.iter().map(|&d| Outcome::PassPlaced { delay: d }).collect();
    v.push(Outcome::PassUnplaced);
    v.push(Outcome::Fail);
    v
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalStatus {
    pub id: u8,
    pub threshold: Option<i64>,
    /// 지금(분석 시작 시점) 가용현금
    pub current: i64,
    /// 전업을 그대로 유지하면 처음 임계값 이하가 되는 달
    pub if_no_action: Option<Ym>,
    pub if_no_action_cash: Option<i64>,
    /// 조건부 전환(D) 경로에서 신호가 발동하는 달
    pub rule_trigger: Option<Ym>,
    pub rule_trigger_cash: Option<i64>,
    /// 신호 1: 근로소득 시작 예정 / 신호 2: 취업 급여 시작 예정
    pub effect_from: Option<Ym>,
    pub triggered_now: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Signals {
    pub items: Vec<SignalStatus>,
    /// 규칙을 실행해도 안전자금이 깨지는 첫 달(D 경로)
    pub rule_breach: Option<Ym>,
    pub rule_breach_cash: Option<i64>,
    pub rule_insolvent: Option<Ym>,
    /// D 경로의 발표 달 잔액(신호 3·4 판단 출발점)
    pub cash_at_announce: i64,
    pub notes: Vec<String>,
}

fn first_at_or_below(p: &PathResult, thr: i64) -> Option<(Ym, i64)> {
    p.months.iter().find(|m| m.cash <= thr).map(|m| (m.month, m.cash))
}

pub fn signals(i: &CpaInputs, a: &PathResult, d: &PathResult) -> Signals {
    let ev = |k: &str| d.events.iter().find(|e| e.kind == k);
    let pt = ev("partTimeStart").map(|e| e.month);
    let job = ev("jobStart").map(|e| e.month);
    let s1 = first_at_or_below(a, i.signal1);
    let s2 = first_at_or_below(a, i.signal2);
    let ann_cash = d.months.iter().find(|m| m.month == i.announce_month).map_or(i.cash0, |m| m.cash);
    let mk = |id: u8, thr: i64, na: Option<(Ym, i64)>, k: &str, eff: Option<Ym>| SignalStatus {
        id,
        threshold: Some(thr),
        current: i.cash0,
        if_no_action: na.map(|x| x.0),
        if_no_action_cash: na.map(|x| x.1),
        rule_trigger: ev(k).map(|e| e.month),
        rule_trigger_cash: ev(k).and_then(|e| d.months.iter().find(|m| m.index == e.index)).map(|m| m.cash),
        effect_from: eff,
        triggered_now: i.cash0 <= thr,
    };
    let at_ann = |id: u8| SignalStatus { id, threshold: None, current: i.cash0, if_no_action: None, if_no_action_cash: None, rule_trigger: Some(i.announce_month), rule_trigger_cash: Some(ann_cash), effect_from: None, triggered_now: false };
    Signals {
        items: vec![mk(1, i.signal1, s1, "signal1", pt), mk(2, i.signal2, s2, "signal2", job), at_ann(3), at_ann(4)],
        rule_breach: d.tau,
        rule_breach_cash: d.tau_cash,
        rule_insolvent: d.insolvent,
        cash_at_announce: ann_cash,
        notes: d.notes.clone(),
    }
}

// ───────────────────────── 60개월 ─────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathValue {
    pub outcome: Outcome,
    pub pv: i64,
    pub end_cash: i64,
    pub min_cash: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyValue {
    pub strategy: Strategy,
    /// 시계 1(18개월 기준선) 통과 여부 — 통과한 전략만 순위에 들어간다
    pub feasible: bool,
    pub p_used: u32,
    pub value: i64,
    pub value_by_rate: Vec<(u32, i64)>,
    /// 결과 상태·지연(0·3·6·9) 경로들의 현재가치 범위
    pub range: (i64, i64),
    pub paths: Vec<PathValue>,
    /// 기대 월말 잔액(가정 가중치 기준)
    pub expected_cash: Vec<i64>,
    pub low_cash: Vec<i64>,
    pub high_cash: Vec<i64>,
    pub rank: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatCell {
    pub p: u32,
    pub q: u32,
    /// 시계 1 통과 전략 중 가치 최대
    pub winner: Option<Strategy>,
    /// 단기 제약을 무시했을 때의 최대(E6 비교용)
    pub winner_ignoring_gate: Strategy,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LongTerm {
    pub available: bool,
    pub missing: Vec<&'static str>,
    pub months: Vec<Ym>,
    pub strategies: Vec<StrategyValue>,
    pub heatmap: Vec<HeatCell>,
    pub heat_steps: Vec<u32>,
}

struct Comp {
    placed: Vec<(u32, PathResult)>,
    unplaced: PathResult,
    fail: PathResult,
}

fn p_for(i: &CpaInputs, s: Strategy, base18: &PathResult, p: u32) -> u32 {
    let exam_idx = i.index_of(i.exam_month).max(0) as u32;
    let penal = match s {
        Strategy::B => true,
        Strategy::D => base18.part_time_from.is_some_and(|t| t <= exam_idx),
        _ => false,
    };
    if penal { p.saturating_sub(i.part_time_penalty_pp) } else { p }
}

fn weights(p: u32, q: u32) -> (Decimal, Decimal, Decimal) {
    let p = Decimal::from(p) / Decimal::from(100);
    let q = Decimal::from(q) / Decimal::from(100);
    (p * q, p * (Decimal::ONE - q), Decimal::ONE - p)
}

fn ev3(w: (Decimal, Decimal, Decimal), a: i64, b: i64, c: i64) -> i64 {
    round_won(w.0 * Decimal::from(a) + w.1 * Decimal::from(b) + w.2 * Decimal::from(c))
}

pub fn long_term(i: &CpaInputs, base18: &[PathResult]) -> LongTerm {
    let h = i.long_horizon;
    let months: Vec<Ym> = (1..=h).map(|t| i.month_at(t)).collect();
    let mut comps: Vec<(Strategy, Comp)> = Vec::new();
    let mut missing: Vec<&'static str> = Vec::new();
    for s in STRATEGIES {
        let placed: Vec<(u32, PathResult)> = DELAYS
            .iter()
            .copied()
            .chain(std::iter::once(i.delay))
            .map(|d| (d, simulate(i, s, Outcome::PassPlaced { delay: d }, h)))
            .collect();
        let unplaced = simulate(i, s, Outcome::PassUnplaced, h);
        let fail = simulate(i, s, Outcome::Fail, h);
        for p in placed.iter().map(|x| &x.1).chain([&unplaced, &fail]) {
            for m in &p.missing {
                if !missing.contains(m) {
                    missing.push(m);
                }
            }
        }
        comps.push((s, Comp { placed, unplaced, fail }));
    }
    missing.sort();
    let steps: Vec<u32> = (2..=18).map(|k| k * 5).collect();
    if !missing.is_empty() {
        return LongTerm { available: false, missing, months, strategies: vec![], heatmap: vec![], heat_steps: steps };
    }
    let feasible = |s: Strategy| base18.iter().find(|b| b.strategy == s).is_some_and(|b| b.safe() && b.complete());
    let base_of = |s: Strategy| base18.iter().find(|b| b.strategy == s).expect("base path");

    // 경로별 현재가치(할인율별)
    let pv_of = |p: &PathResult, r: u32| present_value(&p.nets(), r);
    let value_at = |s: Strategy, c: &Comp, p: u32, q: u32, r: u32| -> i64 {
        let chosen = &c.placed.last().expect("placed").1;
        if s == Strategy::C {
            return pv_of(&c.fail, r); // C 는 결과 상태와 무관
        }
        let w = weights(p_for(i, s, base_of(s), p), q);
        ev3(w, pv_of(chosen, r), pv_of(&c.unplaced, r), pv_of(&c.fail, r))
    };

    let mut out: Vec<StrategyValue> = Vec::new();
    for (s, c) in &comps {
        let s = *s;
        let r = i.discount_bps;
        let chosen = &c.placed.last().expect("placed").1;
        let p_used = if s == Strategy::C { 0 } else { p_for(i, s, base_of(s), i.p_pct) };
        let mut paths: Vec<PathValue> = c.placed[..DELAYS.len()].iter().map(|(_, p)| PathValue { outcome: p.outcome, pv: pv_of(p, r), end_cash: p.end_cash, min_cash: p.min_cash }).collect();
        paths.push(PathValue { outcome: c.unplaced.outcome, pv: pv_of(&c.unplaced, r), end_cash: c.unplaced.end_cash, min_cash: c.unplaced.min_cash });
        paths.push(PathValue { outcome: c.fail.outcome, pv: pv_of(&c.fail, r), end_cash: c.fail.end_cash, min_cash: c.fail.min_cash });
        let (lo, hi) = if s == Strategy::C {
            let v = pv_of(&c.fail, r);
            (v, v)
        } else {
            (paths.iter().map(|x| x.pv).min().unwrap_or(0), paths.iter().map(|x| x.pv).max().unwrap_or(0))
        };
        let w = weights(p_used, i.q_pct);
        let all: Vec<&PathResult> = if s == Strategy::C { vec![&c.fail] } else { c.placed[..DELAYS.len()].iter().map(|x| &x.1).chain([&c.unplaced, &c.fail]).collect() };
        let expected_cash: Vec<i64> = (0..h as usize)
            .map(|k| if s == Strategy::C { c.fail.months[k].cash } else { ev3(w, chosen.months[k].cash, c.unplaced.months[k].cash, c.fail.months[k].cash) })
            .collect();
        let low_cash = (0..h as usize).map(|k| all.iter().map(|p| p.months[k].cash).min().unwrap_or(0)).collect();
        let high_cash = (0..h as usize).map(|k| all.iter().map(|p| p.months[k].cash).max().unwrap_or(0)).collect();
        out.push(StrategyValue {
            strategy: s,
            feasible: feasible(s),
            p_used,
            value: value_at(s, c, i.p_pct, i.q_pct, r),
            value_by_rate: RATES_BPS.iter().map(|&rr| (rr, value_at(s, c, i.p_pct, i.q_pct, rr))).collect(),
            range: (lo, hi),
            paths: if s == Strategy::C { vec![PathValue { outcome: Outcome::Unresolved, pv: lo, end_cash: c.fail.end_cash, min_cash: c.fail.min_cash }] } else { paths },
            expected_cash,
            low_cash,
            high_cash,
            rank: None,
        });
    }
    let mut order: Vec<usize> = (0..out.len()).filter(|&k| out[k].feasible).collect();
    order.sort_by(|&a, &b| out[b].value.cmp(&out[a].value));
    for (r, k) in order.into_iter().enumerate() {
        out[k].rank = Some(r as u32 + 1);
    }

    // p × q 경계도: 경로 현재가치는 p·q 와 무관하므로 한 번만 계산
    let r = i.discount_bps;
    let pre: Vec<(Strategy, i64, i64, i64)> = comps
        .iter()
        .map(|(s, c)| (*s, pv_of(&c.placed.last().expect("placed").1, r), pv_of(&c.unplaced, r), pv_of(&c.fail, r)))
        .collect();
    let mut heat = Vec::new();
    for &q in &steps {
        for &p in &steps {
            let vals: Vec<(Strategy, i64)> = pre
                .iter()
                .map(|&(s, a, b, f)| (s, if s == Strategy::C { f } else { ev3(weights(p_for(i, s, base_of(s), p), q), a, b, f) }))
                .collect();
            let best = |only_feasible: bool| vals.iter().filter(|(s, _)| !only_feasible || feasible(*s)).max_by_key(|(_, v)| *v).map(|x| x.0);
            heat.push(HeatCell { p, q, winner: best(true), winner_ignoring_gate: best(false).unwrap_or(Strategy::A) });
        }
    }
    LongTerm { available: true, missing: vec![], months, strategies: out, heatmap: heat, heat_steps: steps }
}

// ───────────────────────── 묶음 응답 ─────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub month: Ym,
    pub kind: &'static str,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub inputs: CpaInputs,
    pub short: Vec<PathResult>,
    pub tolerance: Vec<Tolerance>,
    pub uncertainty: Vec<StrategyBranches>,
    pub signals: Signals,
    pub long: LongTerm,
    pub markers: Vec<Marker>,
    /// 가용현금과 구분해 표시하는 비유동 자산·부채
    pub balance_sheet: BalanceSheet,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSheet {
    pub liquid: i64,
    pub deposit: i64,
    pub total_assets: i64,
    pub student_loan: i64,
    pub net_worth: i64,
    /// 가용현금 ÷ 월 필수지출(생활비+수험비) — 0.1개월 단위(×10)
    pub runway_x10: i64,
}

pub fn analyze(i: &CpaInputs) -> Analysis {
    let h = i.short_horizon;
    let short: Vec<PathResult> = STRATEGIES.iter().map(|&s| simulate(i, s, Outcome::Unresolved, h)).collect();
    let tolerance = short.iter().map(|p| tolerance(i, p)).collect();
    let uncertainty = STRATEGIES
        .iter()
        .map(|&s| StrategyBranches { strategy: s, branches: outcomes().into_iter().map(|o| BranchSummary::from(&simulate(i, s, o, h))).collect() })
        .collect();
    let signals = signals(i, &short[0], &short[3]);
    let long = long_term(i, &short);
    let mut markers = vec![
        Marker { month: i.support_reduce_from, kind: "support", label: format!("가족 지원 {}만 원", i.support_reduced / 10_000) },
        Marker { month: i.exam_month, kind: "exam", label: "제2차 시험*".into() },
        Marker { month: i.announce_month, kind: "announce", label: "합격 발표*".into() },
        Marker { month: i.announce_month.add(1), kind: "firstPay", label: "가장 빠른 첫 급여".into() },
    ];
    if i.support_stop_from != i.announce_month {
        markers.push(Marker { month: i.support_stop_from, kind: "support", label: "가족 지원 0원".into() });
    } else {
        markers[2].label = "발표* · 지원 0원".into();
    }
    let monthly_need = i.living + i.exam_cost;
    let runway_x10 = if monthly_need > 0 { round_won(Decimal::from(i.cash0) * Decimal::from(10) / Decimal::from(monthly_need)) } else { 0 };
    let balance_sheet = BalanceSheet { liquid: i.cash0, deposit: i.deposit, total_assets: i.cash0 + i.deposit, student_loan: i.student_loan, net_worth: i.cash0 + i.deposit - i.student_loan, runway_x10 };
    Analysis { inputs: i.clone(), short, tolerance, uncertainty, signals, long, markers, balance_sheet }
}
