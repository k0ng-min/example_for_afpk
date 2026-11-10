use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Goal {
    pub id: String,
    pub name: String,
    /// 목표 금액(원)
    pub target_amount: i64,
    /// 목표 시점(시뮬레이션 시작 후 개월 수)
    pub target_month: u32,
    /// 우선순위(1이 가장 높음)
    pub priority: u8,
    #[serde(default)]
    pub category: String,
}
