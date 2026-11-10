//! 부채 상환: 매월 (1) 이자 = 잔액 × 연이율 / 12 (원 단위 반올림)
//! (2) 납부액 = min(약정 상환액 + 추가상환, 잔액 + 이자)
//! (3) 원금 상환 = 납부액 − 이자. 납부액이 이자보다 적으면 잔액이 증가(음의 상각)하며 경고한다.

use crate::domain::clients::{Liability, LiabilityKind};
use crate::finance::rounding::apply_rate;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DebtStep {
    pub payment: i64,
    pub interest: i64,
    pub principal: i64,
    pub negative_amortization: bool,
}

#[derive(Debug, Clone)]
pub struct DebtState {
    pub id: String,
    pub kind: LiabilityKind,
    pub balance: i64,
    pub annual_rate_bps: i64,
    pub monthly_payment: i64,
}

impl From<&Liability> for DebtState {
    fn from(l: &Liability) -> Self {
        Self {
            id: l.id.clone(),
            kind: l.kind,
            balance: l.balance,
            annual_rate_bps: l.annual_rate_bps,
            monthly_payment: l.monthly_payment,
        }
    }
}

impl DebtState {
    pub fn step(&mut self, extra: i64) -> DebtStep {
        if self.balance <= 0 {
            return DebtStep::default();
        }
        let interest = apply_rate(self.balance, self.annual_rate_bps, 12);
        let due = self.balance + interest;
        let payment = (self.monthly_payment + extra.max(0)).min(due).max(0);
        let principal = payment - interest;
        self.balance -= principal;
        DebtStep {
            payment,
            interest,
            principal,
            negative_amortization: principal < 0,
        }
    }
}

/// 추가상환 대상: 잔액이 남은 가계부채 중 금리가 가장 높은 것(애벌랜치 방식).
pub fn avalanche_target(debts: &[DebtState]) -> Option<usize> {
    debts
        .iter()
        .enumerate()
        .filter(|(_, d)| d.kind == LiabilityKind::Household && d.balance > 0)
        .max_by_key(|(_, d)| d.annual_rate_bps)
        .map(|(i, _)| i)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn debt(balance: i64, bps: i64, pay: i64) -> DebtState {
        DebtState {
            id: "d".into(),
            kind: LiabilityKind::Household,
            balance,
            annual_rate_bps: bps,
            monthly_payment: pay,
        }
    }

    #[test]
    fn interest_and_principal_split() {
        let mut d = debt(9_000_000, 550, 250_000);
        let s = d.step(0);
        assert_eq!(s.interest, 41_250);
        assert_eq!(s.principal, 208_750);
        assert_eq!(d.balance, 8_791_250);
    }

    #[test]
    fn final_payment_is_capped() {
        let mut d = debt(100_000, 1200, 250_000);
        let s = d.step(0);
        assert_eq!(s.interest, 1_000);
        assert_eq!(s.payment, 101_000);
        assert_eq!(d.balance, 0);
        assert_eq!(d.step(0), DebtStep::default());
    }

    #[test]
    fn negative_amortization_detected() {
        let mut d = debt(10_000_000, 1200, 50_000);
        let s = d.step(0);
        assert!(s.negative_amortization);
        assert_eq!(d.balance, 10_050_000);
    }

    #[test]
    fn extra_payment_reduces_balance_faster() {
        let mut a = debt(9_000_000, 550, 250_000);
        let mut b = debt(9_000_000, 550, 250_000);
        a.step(0);
        b.step(100_000);
        assert_eq!(a.balance - b.balance, 100_000);
    }
}
