//! 월별 가용현금 시뮬레이션.
//!
//! C(t) = C(t-1) + 실제 현금유입 − 필수생활비 − 수험비 − 실제 채무지급액
//!
//! - 가족 지원·미확인 유입은 월초, 근로·급여 소득은 월말에 들어온다고 본다.
//!   월중 최저 잔액 = C(t-1) + 월초 유입 − 이번 달 지출 (< 0 이면 지급의무 이행 불가)
//! - 확정되지 않은 수습 급여·취업 임금은 입력되기 전까지 유입에 넣지 않고 `missing` 으로 알린다.

use std::collections::BTreeSet;

use serde::Serialize;

use super::{CpaInputs, Ym};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, serde::Deserialize)]
pub enum Strategy {
    A,
    B,
    C,
    D,
}

pub const STRATEGIES: [Strategy; 4] = [Strategy::A, Strategy::B, Strategy::C, Strategy::D];

/// 발표 이후의 결과 상태
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Outcome {
    /// 결과를 반영하지 않음(기획서 09 기준선: 합격·수습·취업 이후 소득 미반영)
    Unresolved,
    /// 합격 + 수습처 확보, 첫 급여 = 발표 다음 달 + L
    PassPlaced { delay: u32 },
    /// 합격했으나 수습 미지정 → 대체 근로(구직)
    PassUnplaced,
    /// 불합격 → 유예 종료, 취업 전환
    Fail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// 전업 수험(결과 대기 포함)
    Study,
    /// 근로 병행
    StudyWork,
    /// 취업 근로
    Job,
    /// 수습 근무
    Trainee,
    /// 수습 이후 회계사 근무
    Cpa,
    /// 취업 전환 후 구직 중(C 전략의 첫 급여 전)
    Search,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthRow {
    pub index: u32,
    pub month: Ym,
    pub mode: Mode,
    pub support: i64,
    /// 현재 정기 근로소득(입력값, 월말)
    pub base: i64,
    pub part_time: i64,
    pub wage: i64,
    pub trainee: i64,
    pub extra: i64,
    pub living: i64,
    pub exam: i64,
    pub debt: i64,
    pub icl: i64,
    pub inflow: i64,
    pub outflow: i64,
    pub net: i64,
    pub mid_low: i64,
    pub cash: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathEvent {
    pub index: u32,
    pub month: Ym,
    /// signal1 | signal2 | partTimeStart | jobStart | traineeStart | cpaStart
    pub kind: &'static str,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathResult {
    pub strategy: Strategy,
    pub outcome: Outcome,
    pub months: Vec<MonthRow>,
    pub min_cash: i64,
    pub min_month: Ym,
    /// 최초 안전자금 위반월 τ: C(t) < Cmin 이 처음 발생한 달
    pub tau: Option<Ym>,
    pub tau_cash: Option<i64>,
    /// 월중 잔액이 음수가 되어 지급의무를 이행할 수 없는 첫 달
    pub insolvent: Option<Ym>,
    pub end_cash: i64,
    /// 첫 급여(취업·수습) 소득이 들어온 달 — 근로 병행 소득은 제외
    pub first_income: Option<Ym>,
    /// 근로 병행 소득이 처음 들어온 개월차(D 의 p 하락 판단용)
    pub part_time_from: Option<u32>,
    pub events: Vec<PathEvent>,
    /// 계산에 필요한데 비어 있는 입력(이 경로의 수치는 확정 결과로 쓰지 않는다)
    pub missing: Vec<&'static str>,
    pub notes: Vec<String>,
}

impl PathResult {
    pub fn complete(&self) -> bool {
        self.missing.is_empty()
    }
    pub fn safe(&self) -> bool {
        self.tau.is_none() && self.insolvent.is_none()
    }
    pub fn nets(&self) -> Vec<i64> {
        self.months.iter().map(|m| m.net).collect()
    }
}

fn support_at(i: &CpaInputs, ym: Ym) -> i64 {
    if ym >= i.support_stop_from {
        0
    } else if ym >= i.support_reduce_from {
        i.support_reduced
    } else {
        i.support_initial
    }
}

pub fn simulate(i: &CpaInputs, s: Strategy, outcome: Outcome, horizon: u32) -> PathResult {
    let ann = i.index_of(i.announce_month).max(0) as u32;
    let mut missing: BTreeSet<&'static str> = BTreeSet::new();
    let mut notes: Vec<String> = Vec::new();
    let mut events: Vec<PathEvent> = Vec::new();

    // 개월차 기준 시작 시점(그 달에 첫 소득이 들어온다)
    let mut pt_start: Option<u32> = (s == Strategy::B).then_some(1);
    // C: 분석 시작 직전(0개월차 말)에 구직을 시작
    let mut job_start: Option<u32> = (s == Strategy::C).then_some(i.job_lead);
    let mut trainee_start: Option<u32> = None;
    if s != Strategy::C {
        match outcome {
            Outcome::Unresolved => {}
            Outcome::PassPlaced { delay } => trainee_start = Some(ann + 1 + delay),
            Outcome::PassUnplaced | Outcome::Fail => job_start = Some(ann + i.job_lead),
        }
    }
    let mut sig1 = false;
    let mut sig2 = false;
    let mut cut_from: Option<u32> = None;

    let mut cash = i.cash0;
    let mut months = Vec::with_capacity(horizon as usize);
    let mut first_income: Option<Ym> = None;
    let mut part_time_from: Option<u32> = None;
    let mut started = (false, false, false, false); // pt, job, trainee, cpa 이벤트 기록 여부

    for t in 1..=horizon {
        let ym = i.month_at(t);
        let trainee_on = trainee_start.is_some_and(|k| t >= k);
        let job_on = !trainee_on && job_start.is_some_and(|k| t >= k);
        let pt_on = !trainee_on && !job_on && pt_start.is_some_and(|k| t >= k);

        let (mut trainee, mut cpa_mode) = (0, false);
        if trainee_on {
            let k = trainee_start.unwrap_or(t);
            if t - k < i.trainee_months {
                match i.trainee_salary {
                    Some(v) => trainee = v,
                    None => {
                        missing.insert("traineeSalary");
                    }
                }
                if !started.2 {
                    started.2 = true;
                    events.push(PathEvent { index: t, month: ym, kind: "traineeStart", detail: "수습 첫 급여".into() });
                }
            } else {
                cpa_mode = true;
                match i.cpa_salary {
                    Some(v) => trainee = v,
                    None => {
                        missing.insert("cpaSalary");
                    }
                }
                if !started.3 {
                    started.3 = true;
                    events.push(PathEvent { index: t, month: ym, kind: "cpaStart", detail: "수습 종료 후 회계사 급여".into() });
                }
            }
        }
        let wage = if job_on {
            if !started.1 {
                started.1 = true;
                events.push(PathEvent { index: t, month: ym, kind: "jobStart", detail: "취업 첫 급여".into() });
            }
            match i.job_wage {
                Some(v) => v,
                None => {
                    missing.insert("jobWage");
                    0
                }
            }
        } else {
            0
        };
        let part_time = if pt_on {
            if !started.0 {
                started.0 = true;
                part_time_from = Some(t);
                events.push(PathEvent { index: t, month: ym, kind: "partTimeStart", detail: "근로 병행 첫 소득".into() });
            }
            i.part_time_income
        } else {
            0
        };
        let earning = trainee_on || job_on;
        let resolved_out = matches!(outcome, Outcome::PassUnplaced | Outcome::Fail) && t > ann;
        let mode = if trainee_on {
            if cpa_mode { Mode::Cpa } else { Mode::Trainee }
        } else if job_on {
            Mode::Job
        } else if pt_on {
            Mode::StudyWork
        } else if s == Strategy::C || resolved_out {
            Mode::Search
        } else {
            Mode::Study
        };
        if first_income.is_none() && earning {
            first_income = Some(ym);
        }

        let support = support_at(i, ym);
        let extra = i.unverified_inflow + i.extra_flows.iter().map(|f| f.at(ym)).sum::<i64>();
        let living = i.living - if cut_from.is_some_and(|k| t >= k) { i.signal2_cut } else { 0 };
        // 수험비는 수험 상태(전업·병행)에서만. C(수험 중단)와 근로·수습·구직 상태에서는 0
        let studying = matches!(mode, Mode::Study | Mode::StudyWork) && s != Strategy::C && !resolved_out;
        let exam = if !studying {
            0
        } else if ym >= i.exam_cost_change {
            i.exam_cost_after
        } else {
            i.exam_cost
        };
        let debt = i.other_debt_payment;
        let icl = if earning && i.icl_start.is_none_or(|s0| ym >= s0) { i.icl_monthly } else { 0 };
        let base = i.current_income;

        let inflow = support + extra + base + part_time + wage + trainee;
        let outflow = living + exam + debt + icl;
        let net = inflow - outflow;
        let mid_low = cash + support + extra - outflow;
        cash += net;

        months.push(MonthRow { index: t, month: ym, mode, support, base, part_time, wage, trainee, extra, living, exam, debt, icl, inflow, outflow, net, mid_low, cash });

        // 조건부 전환(D): 월말 잔액으로 신호 판정
        if s == Strategy::D && !trainee_on && !job_on {
            if !sig1 && cash <= i.signal1 {
                sig1 = true;
                events.push(PathEvent { index: t, month: ym, kind: "signal1", detail: format!("월말 잔액 {}원 ≤ 신호 1 임계값", cash) });
                if pt_start.is_none() {
                    pt_start = Some(t + i.part_time_lead);
                }
            }
            if !sig2 && cash <= i.signal2 {
                sig2 = true;
                events.push(PathEvent { index: t, month: ym, kind: "signal2", detail: format!("월말 잔액 {}원 ≤ 신호 2 임계값", cash) });
                if i.signal2_cut > 0 {
                    cut_from = Some(t + 1);
                }
                match i.job_wage {
                    Some(_) => {
                        let k = t + i.job_lead;
                        job_start = Some(job_start.map_or(k, |j| j.min(k)));
                    }
                    None => notes.push("신호 2 발동: 취업 임금이 입력되지 않아 취업 전환 효과는 반영하지 않았습니다".into()),
                }
            }
        }
    }

    let (mut min_cash, mut min_month) = (i.cash0, i.start_month);
    for m in &months {
        if m.cash < min_cash {
            min_cash = m.cash;
            min_month = m.month;
        }
    }
    let breach = months.iter().find(|m| m.cash < i.safety_min);
    let insolvent = months.iter().find(|m| m.mid_low < 0).map(|m| m.month);
    PathResult {
        strategy: s,
        outcome,
        min_cash,
        min_month,
        tau: breach.map(|m| m.month),
        tau_cash: breach.map(|m| m.cash),
        insolvent,
        end_cash: months.last().map_or(i.cash0, |m| m.cash),
        first_income,
        part_time_from,
        months,
        events,
        missing: missing.into_iter().collect(),
        notes,
    }
}
