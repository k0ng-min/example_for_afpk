//! CPA 유예생 소득 공백 재무설계 엔진 — 「합격해도 끝나지 않는다」(최종 아이디어 기획서).
//!
//! 두 개의 시계:
//! - 시계 1 (18개월): 월말 가용현금 C(t)가 최소 안전자금을 유지하는가 (통과/탈락)
//! - 시계 2 (60개월): 시계 1을 통과한 전략끼리 현재가치 비교
//!
//! 금액은 모두 정수 원(i64). 현재가치·기대가치만 rust_decimal 로 계산한 뒤 원 단위로 반올림한다
//! (0.5 이상 올림, `finance::rounding::round_won`). p·q 는 정수 %(시나리오 조건)로 받는다.
//! 계산식과 가정은 docs/FINANCIAL_ASSUMPTIONS.md §CPA 에 기록한다.

pub mod advisor;
pub mod analysis;
pub mod explore;
pub mod icl;
pub mod sim;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::finance::validation::FieldError;

/// 연-월. JSON 에서는 "YYYY-MM" 문자열
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Ym {
    pub y: i32,
    pub m: u32,
}

impl Ym {
    pub const fn new(y: i32, m: u32) -> Self {
        Self { y, m }
    }
    fn ord(self) -> i32 {
        self.y * 12 + self.m as i32 - 1
    }
    pub fn add(self, n: i32) -> Self {
        let i = self.ord() + n;
        Self { y: i.div_euclid(12), m: (i.rem_euclid(12) + 1) as u32 }
    }
    /// self - other (개월)
    pub fn diff(self, other: Ym) -> i32 {
        self.ord() - other.ord()
    }
    pub fn parse(s: &str) -> Option<Self> {
        let (y, m) = s.split_once('-')?;
        if y.len() != 4 || m.len() != 2 {
            return None;
        }
        let y: i32 = y.parse().ok()?;
        let m: u32 = m.parse().ok()?;
        ((2000..=2100).contains(&y) && (1..=12).contains(&m)).then_some(Self { y, m })
    }
    pub fn label(self) -> String {
        format!("{:04}-{:02}", self.y, self.m)
    }
}

impl Serialize for Ym {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.label())
    }
}

impl<'de> Deserialize<'de> for Ym {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Ym::parse(&s).ok_or_else(|| serde::de::Error::custom("YYYY-MM 형식의 연월이어야 합니다"))
    }
}

/// 기간 한정 현금 흐름 한 건: from 월부터 months 개월 동안 매월 amount 원
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraFlow {
    pub from: Ym,
    pub months: u32,
    pub amount: i64,
    #[serde(default)]
    pub label: String,
}

impl ExtraFlow {
    pub fn at(&self, ym: Ym) -> i64 {
        let k = ym.diff(self.from);
        if k >= 0 && (k as u32) < self.months { self.amount } else { 0 }
    }
}

/// 고객·가정 입력. 기본값 = 기획서 07 의 가상 고객 김유예 기준 설정(팀 가정값, 통계 아님)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct CpaInputs {
    /// 분석 시작 월(1개월차)
    pub start_month: Ym,
    pub short_horizon: u32,
    pub long_horizon: u32,

    /// 가용 현금성 예금(유동성 분석의 출발점)
    pub cash0: i64,
    /// 주거 보증금 — 자산이지만 가용현금이 아니다
    pub deposit: i64,
    /// 학자금 대출 잔액(취업 후 상환 가정 — 월 지출에 자동 반영하지 않음)
    pub student_loan: i64,
    /// 취업 후 상환 의무상환액(월). 국세청 기준 확인 전에는 0. 근로·수습 소득이 있는 달에만 차감
    pub icl_monthly: i64,
    /// 의무상환 원천공제가 시작되는 달(국세청: 귀속연도 다음 해 7월). 비우면 소득이 있는 모든 달
    pub icl_start: Option<Ym>,
    /// 그 밖의 실제 채무지급액(월)
    pub other_debt_payment: i64,
    /// 현재 정기 근로소득(월, 세후). 기본 0 = 무소득. 모든 전략에 월말 입금
    pub current_income: i64,

    /// 필수 생활비(월세 포함)
    pub living: i64,
    /// 그중 월세(표시용)
    pub rent: i64,
    pub exam_cost: i64,
    pub exam_cost_after: i64,
    /// 수험비가 낮아지는 첫 달
    pub exam_cost_change: Ym,

    pub support_initial: i64,
    pub support_reduced: i64,
    pub support_reduce_from: Ym,
    pub support_stop_from: Ym,

    pub safety_min: i64,

    pub part_time_income: i64,
    /// 근로를 결정한 달 말 → 첫 근로소득이 들어오는 달까지(개월). 1 = 다음 달
    pub part_time_lead: u32,
    /// 전환 취업 세후 월급 — 자료 확정 전에는 비어 있음(C·불합격·미지정 경로 계산 불가)
    pub job_wage: Option<i64>,
    /// 구직 시작 → 첫 급여까지(개월)
    pub job_lead: u32,

    pub exam_month: Ym,
    pub announce_month: Ym,

    /// 신호 1·2 임계값
    pub signal1: i64,
    pub signal2: i64,
    /// 신호 2 발동 시 줄이는 생활비(월). 기본 0
    pub signal2_cut: i64,

    /// 확인되지 않은 지원금·적금 등(월). 기본 0 — E5 검증(가정이 결과를 얼마나 바꾸는가)용
    pub unverified_inflow: i64,

    /// 기간 한정 현금 흐름(지원 제도·대출 가정). 양수 = 월초 유입, 음수 = 월초 유출(대출 이자 등). 기본 없음
    pub extra_flows: Vec<ExtraFlow>,

    // ── 60개월 비교 입력(확정 전에는 비어 있음) ──
    pub trainee_salary: Option<i64>,
    pub cpa_salary: Option<i64>,
    pub trainee_months: u32,
    /// 수습 지연 L(개월): 발표 다음 달부터 첫 급여까지의 추가 대기
    pub delay: u32,
    /// 합격 조건 p, 수습 확보 조건 q — 개인 확률이 아닌 시나리오 조건(정수 %)
    pub p_pct: u32,
    pub q_pct: u32,
    /// 근로 병행에 따른 p 하락폭(%p)
    pub part_time_penalty_pp: u32,
    /// 연 할인율(bp). 월 할인율 = 연율/12
    pub discount_bps: u32,
}

impl Default for CpaInputs {
    fn default() -> Self {
        Self {
            start_month: Ym::new(2026, 12),
            short_horizon: 18,
            long_horizon: 60,
            cash0: 14_000_000,
            deposit: 10_000_000,
            student_loan: 16_000_000,
            icl_monthly: 0,
            icl_start: None,
            other_debt_payment: 0,
            current_income: 0,
            living: 1_200_000,
            rent: 500_000,
            exam_cost: 200_000,
            exam_cost_after: 50_000,
            exam_cost_change: Ym::new(2027, 7),
            support_initial: 600_000,
            support_reduced: 300_000,
            support_reduce_from: Ym::new(2027, 3),
            support_stop_from: Ym::new(2027, 9),
            safety_min: 3_600_000,
            part_time_income: 800_000,
            part_time_lead: 1,
            // 경총 2025.01 대졸 초임 분석: 정규직 평균 연 3,675만 원 → 세후 월 약 270만 원(4대보험·간이세액 근사)
            job_wage: Some(2_700_000),
            job_lead: 3,
            exam_month: Ym::new(2027, 6),
            announce_month: Ym::new(2027, 9),
            signal1: 7_200_000,
            signal2: 4_800_000,
            signal2_cut: 0,
            unverified_inflow: 0,
            extra_flows: Vec::new(),
            // 대형 회계법인 수습 연봉 6천만~7천만 원, 4천만~5천만 원 인하 검토 보도(아시아경제 2025.03) → 보수적으로 연 4,500만 원, 세후 월 약 320만 원
            trainee_salary: Some(3_200_000),
            // 수습 이후: 같은 보도의 현행 하단 연 6,000만 원 → 세후 월 약 410만 원
            cpa_salary: Some(4_100_000),
            trainee_months: 12,
            delay: 3,
            p_pct: 45,
            q_pct: 70,
            part_time_penalty_pp: 5,
            discount_bps: 500,
        }
    }
}

impl CpaInputs {
    /// 시작 월 = 1개월차
    pub fn index_of(&self, ym: Ym) -> i32 {
        ym.diff(self.start_month) + 1
    }
    pub fn month_at(&self, t: u32) -> Ym {
        self.start_month.add(t as i32 - 1)
    }
}

const MAX_WON: i64 = 10_000_000_000;

pub fn validate(i: &CpaInputs) -> Vec<FieldError> {
    let mut e = Vec::new();
    let mut err = |f: &str, m: &str| e.push(FieldError { field: f.into(), message: m.into() });
    let amounts: [(&str, i64); 18] = [
        ("currentIncome", i.current_income),
        ("cash0", i.cash0),
        ("deposit", i.deposit),
        ("studentLoan", i.student_loan),
        ("iclMonthly", i.icl_monthly),
        ("otherDebtPayment", i.other_debt_payment),
        ("living", i.living),
        ("rent", i.rent),
        ("examCost", i.exam_cost),
        ("examCostAfter", i.exam_cost_after),
        ("supportInitial", i.support_initial),
        ("supportReduced", i.support_reduced),
        ("safetyMin", i.safety_min),
        ("partTimeIncome", i.part_time_income),
        ("signal1", i.signal1),
        ("signal2", i.signal2),
        ("signal2Cut", i.signal2_cut),
        ("unverifiedInflow", i.unverified_inflow),
    ];
    for (f, v) in amounts {
        if !(0..=MAX_WON).contains(&v) {
            err(f, "0원 이상 100억 원 이하여야 합니다");
        }
    }
    for (f, v) in [("jobWage", i.job_wage), ("traineeSalary", i.trainee_salary), ("cpaSalary", i.cpa_salary)] {
        if let Some(v) = v {
            if !(0..=MAX_WON).contains(&v) {
                err(f, "0원 이상 100억 원 이하여야 합니다");
            }
        }
    }
    if i.rent > i.living {
        err("rent", "월세는 필수 생활비에 포함되므로 생활비보다 클 수 없습니다");
    }
    if i.extra_flows.len() > 6 {
        err("extraFlows", "기간 한정 흐름은 6개까지 넣을 수 있습니다");
    }
    for f in &i.extra_flows {
        if !(1..=60).contains(&f.months) || f.amount.abs() > 50_000_000 || f.label.chars().count() > 40 {
            err("extraFlows", "기간은 1~60개월, 금액은 ±5,000만 원 이내, 이름은 40자 이내여야 합니다");
            break;
        }
    }
    if i.signal2_cut > i.living {
        err("signal2Cut", "절감액은 생활비보다 클 수 없습니다");
    }
    if !(6..=36).contains(&i.short_horizon) {
        err("shortHorizon", "6~36개월");
    }
    if !(12..=120).contains(&i.long_horizon) || i.long_horizon < i.short_horizon {
        err("longHorizon", "12~120개월이며 단기 기간 이상이어야 합니다");
    }
    if !(1..=12).contains(&i.part_time_lead) {
        err("partTimeLead", "1~12개월");
    }
    if !(1..=24).contains(&i.job_lead) {
        err("jobLead", "1~24개월");
    }
    if !(1..=36).contains(&i.trainee_months) {
        err("traineeMonths", "1~36개월");
    }
    if i.delay > 24 {
        err("delay", "0~24개월");
    }
    if i.p_pct > 100 {
        err("pPct", "0~100");
    }
    if i.q_pct > 100 {
        err("qPct", "0~100");
    }
    if i.part_time_penalty_pp > 100 {
        err("partTimePenaltyPp", "0~100");
    }
    if i.discount_bps > 3000 {
        err("discountBps", "0~30%");
    }
    if i.signal2 > i.signal1 {
        err("signal2", "신호 2 임계값은 신호 1 이하여야 합니다");
    }
    let start = i.start_month;
    if i.exam_month < start {
        err("examMonth", "분석 시작 월 이후여야 합니다");
    }
    if i.announce_month < i.exam_month {
        err("announceMonth", "시험 월 이후여야 합니다");
    }
    if i.announce_month.diff(start) >= i.short_horizon as i32 {
        err("announceMonth", "발표 월이 단기 분석 기간 안에 있어야 합니다");
    }
    if i.support_stop_from < i.support_reduce_from {
        err("supportStopFrom", "지원 중단 월은 감액 월 이후여야 합니다");
    }
    e
}

#[cfg(test)]
mod tests;
