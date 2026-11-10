//! 자산 성장 가정: 현금·투자자산 모두 월 복리(연 bp / 12), 원 단위 반올림.
//! 수익률은 사용자가 설정한 가정이며 확정 수익이 아니다. 음수 현금에는 이자를 붙이지 않는다.

use crate::finance::rounding::apply_rate;

pub fn monthly_growth(balance: i64, annual_bps: i64) -> i64 {
    if balance <= 0 {
        return 0;
    }
    apply_rate(balance, annual_bps, 12)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn growth() {
        assert_eq!(monthly_growth(12_000_000, 300), 30_000);
        assert_eq!(monthly_growth(-1_000, 300), 0);
    }
}
