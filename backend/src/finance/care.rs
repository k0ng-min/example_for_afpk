//! 주제 모듈: 돌봄 충격(care_shock). 돌봄 파라미터를 검증 가능한 표준 이벤트로 변환한다.
//! 새로운 계산식을 만들지 않고 기존 이벤트 엔진을 재사용한다(LLM 생성 수식 실행 없음).

use crate::domain::scenarios::{EventKind, FutureEvent};

#[derive(Debug, Clone, Copy)]
pub struct CareParams {
    pub start_month: u32,
    /// 단축근무 등으로 인한 월 소득 감소(양수)
    pub income_drop: i64,
    /// 월 추가 돌봄 비용(양수)
    pub care_cost: i64,
    /// 휴직 개월 수(0이면 없음)
    pub leave_months: u32,
    /// 휴직 기간 월 소득 감소(양수)
    pub leave_income_drop: i64,
}

pub fn care_events(p: CareParams) -> Vec<FutureEvent> {
    let mut ev = vec![];
    let start = p.start_month.max(1);
    let after_leave = start + p.leave_months;
    if p.leave_months > 0 {
        ev.push(FutureEvent {
            id: "care_leave".into(),
            name: "돌봄 휴직 기간 소득 감소".into(),
            kind: EventKind::IncomeChange,
            start_month: start,
            end_month: Some(after_leave - 1),
            amount: -p.leave_income_drop.abs(),
        });
    }
    if p.income_drop != 0 {
        ev.push(FutureEvent {
            id: "care_income".into(),
            name: "근로시간 감소로 소득 감소".into(),
            kind: EventKind::IncomeChange,
            start_month: after_leave,
            end_month: None,
            amount: -p.income_drop.abs(),
        });
    }
    if p.care_cost != 0 {
        ev.push(FutureEvent {
            id: "care_cost".into(),
            name: "추가 돌봄 비용".into(),
            kind: EventKind::ExpenseChange,
            start_month: start,
            end_month: None,
            amount: p.care_cost.abs(),
        });
    }
    ev
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leave_then_reduced_hours() {
        let ev = care_events(CareParams { start_month: 3, income_drop: 700_000, care_cost: 450_000, leave_months: 3, leave_income_drop: 1_500_000 });
        assert_eq!(ev.len(), 3);
        assert_eq!(ev[0].end_month, Some(5));
        assert_eq!(ev[1].start_month, 6);
        assert!(ev[1].active_in(6) && !ev[1].active_in(5));
        assert!(ev[2].active_in(3));
    }
}
