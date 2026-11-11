//! 기획서 09·10 의 예시 계산을 독립 재계산한 회귀 테스트.
//! (기획서 수치를 하드코딩해 결과를 맞춘 것이 아니라, 같은 가정을 넣었을 때 같은 값이 나오는지 확인한다)

use super::analysis::{analyze, present_value, tolerance};
use super::sim::{simulate, Mode, Outcome, Strategy};
use super::{validate, CpaInputs, Ym};

const M: i64 = 10_000; // 만 원

/// 기획서(PDF) 기준 가정: 급여 자료 미입력. 기본값(조사 자료 반영)과 분리해 기획서 수치를 고정 검증한다
fn pdf() -> CpaInputs {
    CpaInputs { job_wage: None, trainee_salary: None, cpa_salary: None, ..CpaInputs::default() }
}

#[test]
fn researched_defaults_fill_wages_and_d_switches_to_job() {
    let i = CpaInputs::default();
    assert_eq!((i.job_wage, i.trainee_salary, i.cpa_salary), (Some(2_700_000), Some(3_200_000), Some(4_100_000)));
    let an = analyze(&i);
    assert!(an.long.available);
    let d = simulate(&i, Strategy::D, Outcome::Unresolved, 18);
    assert!(d.complete());
}

fn base(s: Strategy) -> super::sim::PathResult {
    let i = pdf();
    simulate(&i, s, Outcome::Unresolved, i.short_horizon)
}

fn cash_at(p: &super::sim::PathResult, y: i32, m: u32) -> i64 {
    p.months.iter().find(|r| r.month == Ym::new(y, m)).unwrap().cash
}

#[test]
fn ym_arithmetic() {
    let s = Ym::new(2026, 12);
    assert_eq!(s.add(1), Ym::new(2027, 1));
    assert_eq!(s.add(17), Ym::new(2028, 5));
    assert_eq!(Ym::new(2028, 5).diff(s), 17);
    assert_eq!(Ym::parse("2027-03"), Some(Ym::new(2027, 3)));
    assert_eq!(Ym::parse("2027-13"), None);
    assert_eq!(Ym::parse("27-03"), None);
}

#[test]
fn strategy_a_matches_proposal_baseline() {
    let a = base(Strategy::A);
    assert_eq!(a.months.len(), 18);
    assert_eq!(a.months[0].month, Ym::new(2026, 12));
    // 12월: 1,400 + 60 − 120 − 20 = 1,320
    assert_eq!(cash_at(&a, 2026, 12), 1_320 * M);
    assert_eq!(cash_at(&a, 2027, 2), 1_160 * M);
    // 신호 1 기준: 2027년 6월 말 720만 원
    assert_eq!(cash_at(&a, 2027, 6), 720 * M);
    assert_eq!(cash_at(&a, 2027, 9), 405 * M);
    // 최초 위반월 τ = 2027.10, 280만 원
    assert_eq!(a.tau, Some(Ym::new(2027, 10)));
    assert_eq!(a.tau_cash, Some(280 * M));
    assert_eq!(a.end_cash, -595 * M);
    // 음수 현금흐름을 숨기지 않는다: 월중 지급 불능 시점도 계산
    assert!(a.insolvent.is_some());
}

#[test]
fn strategy_b_matches_proposal_baseline() {
    let b = base(Strategy::B);
    assert_eq!(cash_at(&b, 2027, 2), 1_400 * M);
    assert_eq!(cash_at(&b, 2027, 6), 1_280 * M);
    assert_eq!(b.end_cash, 845 * M);
    assert_eq!(b.tau, None);
    assert!(b.safe());
}

#[test]
fn strategy_d_switches_on_signal_and_breaches_in_2028_04() {
    let d = base(Strategy::D);
    let s1 = d.events.iter().find(|e| e.kind == "signal1").unwrap();
    assert_eq!(s1.month, Ym::new(2027, 6));
    let pt = d.events.iter().find(|e| e.kind == "partTimeStart").unwrap();
    assert_eq!(pt.month, Ym::new(2027, 7));
    assert_eq!(d.tau, Some(Ym::new(2028, 4)));
    assert_eq!(d.tau_cash, Some(330 * M));
    // 신호 2(480만 원 이하)는 2028.01(465만 원)에 발동 — 임금 미입력이라 효과는 반영하지 않고 알림만
    let s2 = d.events.iter().find(|e| e.kind == "signal2").unwrap();
    assert_eq!(s2.month, Ym::new(2028, 1));
    assert!(!d.notes.is_empty());
}

#[test]
fn strategies_produce_different_results() {
    let (a, b, d) = (base(Strategy::A), base(Strategy::B), base(Strategy::D));
    assert_ne!(a.end_cash, b.end_cash);
    assert_ne!(a.end_cash, d.end_cash);
    assert_ne!(b.end_cash, d.end_cash);
}

#[test]
fn strategy_c_requires_wage_and_uses_job_lead() {
    let c = base(Strategy::C);
    assert!(!c.complete());
    assert!(c.missing.contains(&"jobWage"));
    let i = CpaInputs { job_wage: Some(2_000_000), job_lead: 3, ..pdf() };
    let c = simulate(&i, Strategy::C, Outcome::Unresolved, 18);
    assert!(c.complete());
    assert_eq!(c.first_income, Some(Ym::new(2027, 2)));
    assert_eq!(c.months[0].mode, Mode::Search);
    assert_eq!(c.months[0].exam, 0, "수험 중단 전략에는 수험비가 없다");
    assert_eq!(c.months[1].wage, 0);
    assert_eq!(c.months[2].wage, 2_000_000);
}

#[test]
fn family_support_and_exam_cost_change_on_schedule() {
    let a = base(Strategy::A);
    let row = |y, m| a.months.iter().find(|r| r.month == Ym::new(y, m)).unwrap().clone();
    assert_eq!(row(2027, 2).support, 600_000);
    assert_eq!(row(2027, 3).support, 300_000);
    assert_eq!(row(2027, 8).support, 300_000);
    assert_eq!(row(2027, 9).support, 0);
    assert_eq!(row(2027, 6).exam, 200_000);
    assert_eq!(row(2027, 7).exam, 50_000);
}

#[test]
fn deposit_is_not_liquid_cash() {
    let i = CpaInputs { deposit: 99_000_000, ..pdf() };
    let a = simulate(&i, Strategy::A, Outcome::Unresolved, 18);
    assert_eq!(a.tau, base(Strategy::A).tau);
    assert_eq!(a.end_cash, -595 * M);
    let an = analyze(&i);
    assert_eq!(an.balance_sheet.liquid, 14_000_000);
    assert_eq!(an.balance_sheet.total_assets, 113_000_000);
}

#[test]
fn student_loan_is_not_a_monthly_payment_by_default() {
    let i = CpaInputs { student_loan: 50_000_000, ..pdf() };
    let a = simulate(&i, Strategy::A, Outcome::Unresolved, 18);
    assert!(a.months.iter().all(|m| m.debt == 0 && m.icl == 0));
    assert_eq!(a.end_cash, -595 * M);
    // 의무상환액을 입력해도 소득이 있는 달에만 차감
    let i = CpaInputs { icl_monthly: 100_000, trainee_salary: Some(2_500_000), ..pdf() };
    let p = simulate(&i, Strategy::A, Outcome::PassPlaced { delay: 0 }, 18);
    assert!(p.months.iter().filter(|m| m.trainee == 0).all(|m| m.icl == 0));
    assert!(p.months.iter().filter(|m| m.trainee > 0).all(|m| m.icl == 100_000));
}

#[test]
fn income_after_pass_starts_after_delay() {
    let i = CpaInputs { trainee_salary: Some(2_500_000), ..pdf() };
    for (l, y, m) in [(0u32, 2027, 10u32), (3, 2028, 1), (6, 2028, 4)] {
        let p = simulate(&i, Strategy::A, Outcome::PassPlaced { delay: l }, 18);
        assert_eq!(p.first_income, Some(Ym::new(y, m)), "L={l}");
        assert!(p.complete());
    }
    // 수습 급여 미입력이면 결과를 확정하지 않는다
    let p = simulate(&pdf(), Strategy::A, Outcome::PassPlaced { delay: 0 }, 18);
    assert!(p.missing.contains(&"traineeSalary"));
}

#[test]
fn delay_tolerance_matches_proposal() {
    let i = pdf();
    let t = |s| tolerance(&i, &base(s));
    let a = t(Strategy::A);
    assert_eq!(a.months, Some(0));
    assert_eq!(a.margin, Some(45 * M));
    let d = t(Strategy::D);
    assert_eq!(d.months, Some(6));
    assert!(!d.open_ended);
    let b = t(Strategy::B);
    assert_eq!(b.months, Some(8));
    assert!(b.open_ended);
}

#[test]
fn part_time_lead_delays_switch() {
    let i = CpaInputs { part_time_lead: 3, ..pdf() };
    let d = simulate(&i, Strategy::D, Outcome::Unresolved, 18);
    let pt = d.events.iter().find(|e| e.kind == "partTimeStart").unwrap();
    assert_eq!(pt.month, Ym::new(2027, 9));
    assert!(d.tau.unwrap() < base(Strategy::D).tau.unwrap(), "준비 기간이 길면 위반이 앞당겨진다");
}

#[test]
fn signal2_switches_to_job_when_wage_known() {
    let i = CpaInputs { job_wage: Some(2_200_000), job_lead: 2, ..pdf() };
    let d = simulate(&i, Strategy::D, Outcome::Unresolved, 18);
    let job = d.events.iter().find(|e| e.kind == "jobStart").unwrap();
    assert_eq!(job.month, Ym::new(2028, 3));
    assert_eq!(d.tau, None);
}

#[test]
fn mid_month_low_flags_payment_failure() {
    let a = base(Strategy::A);
    // 2028.01: 월초 잔액 30만 − 지출 125만 → 월중 −95만
    let r = a.months.iter().find(|m| m.month == Ym::new(2028, 1)).unwrap();
    assert_eq!(r.mid_low, -95 * M);
    assert_eq!(a.insolvent, Some(Ym::new(2028, 1)));
}

#[test]
fn present_value_discounts_monthly() {
    assert_eq!(present_value(&[1_200_000], 1200), 1_188_119); // 1.2M / 1.01
    assert_eq!(present_value(&[100, 100], 0), 200);
}

#[test]
fn long_term_requires_explicit_inputs() {
    let an = analyze(&pdf());
    assert!(!an.long.available);
    for f in ["jobWage", "traineeSalary", "cpaSalary"] {
        assert!(an.long.missing.contains(&f), "{f}");
    }
    assert!(an.long.strategies.is_empty());
}

#[test]
fn long_term_gate_excludes_infeasible_strategies() {
    let i = CpaInputs { job_wage: Some(2_200_000), trainee_salary: Some(2_800_000), cpa_salary: Some(4_000_000), ..pdf() };
    let an = analyze(&i);
    assert!(an.long.available);
    let get = |s| an.long.strategies.iter().find(|v| v.strategy == s).unwrap();
    assert!(!get(Strategy::A).feasible);
    assert!(get(Strategy::A).rank.is_none());
    assert!(get(Strategy::B).feasible);
    assert!(get(Strategy::B).rank.is_some());
    // 경계도는 17×17(5%p 간격), 승자는 항상 시계 1 통과 전략
    assert_eq!(an.long.heatmap.len(), 289);
    for c in &an.long.heatmap {
        if let Some(w) = c.winner {
            assert!(get(w).feasible);
        }
    }
    // p 가 높을수록 수험 전략 가치가 커진다(단조성)
    let v = |p| {
        let j = CpaInputs { p_pct: p, ..i.clone() };
        analyze(&j).long.strategies.iter().find(|v| v.strategy == Strategy::B).unwrap().value
    };
    assert!(v(80) > v(30));
    // B 는 병행 하락폭 적용, D 는 시험 뒤에 근로를 시작하므로 미적용
    assert_eq!(get(Strategy::B).p_used, 40);
    assert_eq!(get(Strategy::D).p_used, 45);
}

#[test]
fn validation_rejects_bad_inputs() {
    assert!(validate(&pdf()).is_empty());
    let bad = CpaInputs { cash0: -1, p_pct: 120, signal2: 9_000_000, announce_month: Ym::new(2027, 5), ..pdf() };
    let e = validate(&bad);
    let fields: Vec<_> = e.iter().map(|x| x.field.as_str()).collect();
    for f in ["cash0", "pPct", "signal2", "announceMonth"] {
        assert!(fields.contains(&f), "{f}: {fields:?}");
    }
}

#[test]
fn current_income_adds_to_every_strategy() {
    let i = CpaInputs { current_income: 300_000, ..pdf() };
    let a = simulate(&i, Strategy::A, Outcome::Unresolved, 18);
    assert_eq!(a.end_cash, -595 * M + 300_000 * 18);
    assert!(a.months.iter().all(|m| m.base == 300_000));
}

#[test]
fn icl_start_delays_withholding() {
    let i = CpaInputs { icl_monthly: 100_000, icl_start: Some(Ym::new(2028, 7)), trainee_salary: Some(2_500_000), cpa_salary: Some(3_500_000), ..pdf() };
    let p = simulate(&i, Strategy::A, Outcome::PassPlaced { delay: 0 }, 60);
    for m in &p.months {
        let expect = if m.month >= Ym::new(2028, 7) && m.trainee > 0 { 100_000 } else { 0 };
        assert_eq!(m.icl, expect, "{}", m.month.label());
    }
}
