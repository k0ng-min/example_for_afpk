//! 반올림 규칙: 모든 원 단위 계산은 rust_decimal 로 수행한 뒤
//! "0.5 이상 올림(MidpointAwayFromZero)"으로 정수 원에 맞춘다.

use rust_decimal::prelude::ToPrimitive;
use rust_decimal::{Decimal, RoundingStrategy};

/// `amount * bps / 10000 / periods` 를 원 단위로 반올림.
/// 예: 잔액 9,000,000원, 연 5.5%(550bp), 월(12) → 41,250원
pub fn apply_rate(amount: i64, bps: i64, periods: i64) -> i64 {
    if amount == 0 || bps == 0 {
        return 0;
    }
    let v = Decimal::from(amount) * Decimal::from(bps)
        / Decimal::from(10_000)
        / Decimal::from(periods.max(1));
    round_won(v)
}

pub fn round_won(v: Decimal) -> i64 {
    v.round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero)
        .to_i64()
        .unwrap_or(if v.is_sign_negative() { i64::MIN } else { i64::MAX })
}

/// 비율을 bp 로 (numerator / denominator * 10000), 반올림. 분모 0 이면 None.
pub fn ratio_bps(numerator: i64, denominator: i64) -> Option<i64> {
    if denominator == 0 {
        return None;
    }
    Some(round_won(
        Decimal::from(numerator) * Decimal::from(10_000) / Decimal::from(denominator),
    ))
}

/// 개월 수를 0.1개월 단위 정수로 (예: 35 = 3.5개월). 분모 0 이면 None.
pub fn months_x10(numerator: i64, monthly: i64) -> Option<i64> {
    if monthly <= 0 {
        return None;
    }
    Some(round_won(
        Decimal::from(numerator) * Decimal::from(10) / Decimal::from(monthly),
    ))
}

/// 올림 나눗셈(양수 전용). 필요 월 저축액 계산에 사용.
pub fn ceil_div(a: i64, b: i64) -> i64 {
    if b <= 0 {
        return a;
    }
    if a <= 0 {
        return 0;
    }
    (a + b - 1) / b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monthly_interest_rounds_half_up() {
        assert_eq!(apply_rate(9_000_000, 550, 12), 41_250);
        // 1,000,001 * 0.05 / 12 = 4166.670... → 4167
        assert_eq!(apply_rate(1_000_001, 500, 12), 4_167);
        // 0.5 경계: 1,200 * 0.05 / 12 = 5.0, 1,212 * 0.05/12 = 5.05 → 5
        assert_eq!(apply_rate(1_212, 500, 12), 5);
        // 30 * 1% / 12 = 0.025 → 0, 600 * 1% /12 = 0.5 → 1
        assert_eq!(apply_rate(600, 100, 12), 1);
    }

    #[test]
    fn ratios() {
        assert_eq!(ratio_bps(250_000, 3_200_000), Some(781));
        assert_eq!(ratio_bps(1, 0), None);
        assert_eq!(months_x10(6_500_000, 2_100_000), Some(31));
        assert_eq!(ceil_div(10, 3), 4);
        assert_eq!(ceil_div(-5, 3), 0);
    }
}

/// 원 금액 표기(천 단위 구분) — 경고·인사이트 메시지용
pub fn won_str(v: i64) -> String {
    let s = v.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    format!("{}{out}원", if v < 0 { "-" } else { "" })
}
