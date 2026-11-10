//! 주제 모듈: 가계·사업 전염(household_business).
//! 사업 현금 = 이전 잔액 + 매출×(1+변화율) − 운영비 − 대표자 인출 − 사업부채 상환.
//! 사업 현금이 음수가 되고 `household_backstop` 이면 부족분 전액을 가계 현금에서 이전(전염)한다.

use crate::domain::clients::BusinessProfile;
use crate::finance::rounding::apply_rate;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BusinessStep {
    pub revenue: i64,
    pub business_net: i64,
    pub business_cash: i64,
    /// 가계 → 사업으로 이전된 금액(전염)
    pub household_transfer: i64,
    /// 전염이 차단되어 남은 미지급 부족분(사업 현금 음수 유지)
    pub unfunded_shortfall: i64,
}

pub struct BusinessState {
    pub profile: BusinessProfile,
    pub cash: i64,
    pub revenue_change_bps: i64,
    pub household_backstop: bool,
}

impl BusinessState {
    pub fn new(profile: &BusinessProfile, revenue_change_bps: i64, household_backstop: bool) -> Self {
        Self {
            cash: profile.operating_cash,
            profile: profile.clone(),
            revenue_change_bps,
            household_backstop,
        }
    }

    /// `business_debt_payment` 은 이번 달 사업부채 실제 납부액.
    pub fn step(&mut self, business_debt_payment: i64) -> BusinessStep {
        self.step_with_season(business_debt_payment, 0)
    }

    /// `season_bps`: 이번 달 매출 계절 증감률(bp). 매출 = 기본 × (1+변화율) × (1+계절)
    pub fn step_with_season(&mut self, business_debt_payment: i64, season_bps: i64) -> BusinessStep {
        let p = &self.profile;
        let shocked = p.monthly_revenue + apply_rate(p.monthly_revenue, self.revenue_change_bps, 1);
        let revenue = shocked + apply_rate(shocked, season_bps, 1);
        let net = revenue - p.monthly_cost - p.owner_draw - business_debt_payment;
        self.cash += net;
        let mut transfer = 0;
        let mut shortfall = 0;
        if self.cash < 0 {
            if self.household_backstop {
                transfer = -self.cash;
                self.cash = 0;
            } else {
                shortfall = -self.cash;
            }
        }
        BusinessStep {
            revenue,
            business_net: net,
            business_cash: self.cash,
            household_transfer: transfer,
            unfunded_shortfall: shortfall,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> BusinessProfile {
        BusinessProfile {
            monthly_revenue: 12_000_000,
            monthly_cost: 7_400_000,
            operating_cash: 1_000_000,
            owner_draw: 4_000_000,
        }
    }

    #[test]
    fn revenue_shock_creates_contagion() {
        let mut b = BusinessState::new(&profile(), -2000, true);
        // 매출 9,600,000 − 7,400,000 − 4,000,000 − 450,000 = −2,250,000
        let s = b.step(450_000);
        assert_eq!(s.revenue, 9_600_000);
        assert_eq!(s.business_net, -2_250_000);
        assert_eq!(s.household_transfer, 1_250_000);
        assert_eq!(s.business_cash, 0);
    }

    #[test]
    fn firewall_blocks_transfer() {
        let mut b = BusinessState::new(&profile(), -2000, false);
        let s = b.step(450_000);
        assert_eq!(s.household_transfer, 0);
        assert_eq!(s.unfunded_shortfall, 1_250_000);
    }
}
