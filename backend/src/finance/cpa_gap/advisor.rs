//! AI 상담(규칙 기반 답변). 질문마다 엔진 결과에서 사실(fact)을 뽑아 정해진 문장으로 답한다.
//! 합격 가능성 예측·수험 코칭 질문은 범위 밖으로 안내한다. LLM 이 문장을 다듬더라도 숫자는 여기서 나온 값만 허용한다.

use serde::Serialize;

use super::analysis::Analysis;
use super::sim::{PathResult, Strategy};
use super::Ym;

pub const QUESTIONS: [(&str, &str); 6] = [
    ("runway", "현재 자금으로 언제까지 생활할 수 있나요?"),
    ("floor", "안전자금 하한에는 언제 도달하나요?"),
    ("supportCut", "가족 지원이 더 빨리 끊기면 어떤 조정이 필요한가요?"),
    ("delayRule", "수습처 확보가 늦어지면 어떤 전환 규칙을 적용하나요?"),
    ("feasible", "어떤 전략이 단기 지급능력 조건을 통과하나요?"),
    ("verify", "AI 제안은 어떤 계산 근거로 검증되나요?"),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub label: String,
    pub value: String,
    /// engine | input | official
    pub source: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleAnswer {
    pub id: String,
    pub question: String,
    pub answer: String,
    pub facts: Vec<Fact>,
    /// 범위 밖 질문 여부
    pub out_of_scope: bool,
}

pub fn man(v: i64) -> String {
    let m = if v >= 0 { (v + 5_000) / 10_000 } else { (v - 5_000) / 10_000 }; // 만 원 반올림(표시용)
    let s = m.abs().to_string();
    let mut out = String::new();
    for (k, c) in s.chars().enumerate() {
        if k > 0 && (s.len() - k) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    format!("{}{}만 원", if m < 0 { "−" } else { "" }, out)
}

fn ym(y: Option<Ym>) -> String {
    y.map(|v| format!("{}.{:02}", v.y, v.m)).unwrap_or_else(|| "없음".into())
}

fn name(s: Strategy) -> &'static str {
    match s {
        Strategy::A => "A 전업 수험",
        Strategy::B => "B 근로 병행",
        Strategy::C => "C 취업 전환",
        Strategy::D => "D 조건부 전환",
    }
}

fn path(a: &Analysis, s: Strategy) -> &PathResult {
    a.short.iter().find(|p| p.strategy == s).expect("strategy path")
}

fn f(label: impl Into<String>, value: impl Into<String>, source: &'static str) -> Fact {
    Fact { label: label.into(), value: value.into(), source }
}

const OUT_OF_SCOPE: [&str; 12] = ["합격 확률", "합격확률", "합격할 수 있", "합격할까", "붙을까", "붙을 수", "떨어질까", "공부법", "공부 방법", "합격 가능성", "몇 점", "커트라인"];

/// 합격 예측·수험 코칭 질문은 답하지 않는다(띄어쓰기 차이를 무시하고, "합격"과 "확률·가능·예측"이 함께 있으면 범위 밖)
pub fn out_of_scope(q: &str) -> bool {
    let n: String = q.chars().filter(|c| !c.is_whitespace()).collect();
    OUT_OF_SCOPE.iter().any(|k| n.contains(&k.replace(' ', ""))) || (n.contains("합격") && ["확률", "가능성", "예측", "될까"].iter().any(|k| n.contains(k)))
}

#[cfg(test)]
mod scope_tests {
    #[test]
    fn detects_pass_prediction_questions() {
        for q in ["제가 합격할 확률은?", "합격 가능성 알려줘", "이번에 붙을까요", "공부 방법 추천"] {
            assert!(super::out_of_scope(q), "{q}");
        }
        assert!(!super::out_of_scope("합격 후 첫 급여가 늦어지면?"));
        assert!(!super::out_of_scope("가족 지원이 끊기면 언제 부족해지나요?"));
    }
}

pub fn scope_answer(q: &str) -> RuleAnswer {
    RuleAnswer {
        id: "outOfScope".into(),
        question: q.into(),
        answer: "이 상담은 합격 가능성을 예측하거나 학습 방법을 안내하지 않습니다. 대신 합격·불합격·수습 지연 각각의 경우에 현재 자금으로 버틸 수 있는지, 언제 계획을 바꿔야 하는지를 계산으로 답합니다. 아래 추천 질문을 이용해 주세요.".into(),
        facts: vec![],
        out_of_scope: true,
    }
}

/// `what_if` = 가족 지원이 감액 시점에 바로 끊기는 경우의 분석(supportCut 질문에만 사용)
pub fn answer(id: &str, a: &Analysis, what_if: Option<&Analysis>) -> Option<RuleAnswer> {
    let q = QUESTIONS.iter().find(|(k, _)| *k == id)?.1;
    let i = &a.inputs;
    let (pa, pb, pd) = (path(a, Strategy::A), path(a, Strategy::B), path(a, Strategy::D));
    let mut facts = vec![f("현재 가용현금", man(i.cash0), "input"), f("최소 안전자금", man(i.safety_min), "input")];
    let text = match id {
        "runway" => {
            facts.push(f("전업 유지 시 월중 지급 불가 첫 달", ym(pa.insolvent), "engine"));
            facts.push(f("전업 유지 시 안전자금 첫 위반", ym(pa.tau), "engine"));
            facts.push(f("조건부 전환 시 안전자금 첫 위반", ym(pd.tau), "engine"));
            match pa.insolvent {
                Some(m) => format!(
                    "정기 소득 없이 지금처럼 전업으로 준비하면 {}에 월초 잔액으로 그달 생활비를 낼 수 없게 됩니다(월중 잔액이 0 아래). 안전자금 {}은 그보다 앞선 {}에 무너집니다. 잔액 신호에 따라 근로를 시작하는 조건부 전환(D)을 따르면 안전자금 위반은 {}로 늦춰집니다.",
                    ym(Some(m)), man(i.safety_min), ym(pa.tau), ym(pd.tau)
                ),
                None => format!("분석 기간 {}개월 동안 전업을 유지해도 월세·생활비를 낼 수 있습니다. 다만 안전자금 기준으로는 {}에 하한에 닿습니다.", i.short_horizon, ym(pa.tau)),
            }
        }
        "floor" => {
            for p in &a.short {
                let v = if p.missing.is_empty() { format!("{} (월말 {})", ym(p.tau), p.tau_cash.map(man).unwrap_or_else(|| "—".into())) } else { "입력 필요".into() };
                facts.push(f(format!("{} 첫 위반월 τ", name(p.strategy)), v, "engine"));
            }
            format!(
                "최소 안전자금 {} 기준으로, 전업(A)은 {}, 조건부 전환(D)은 {}에 처음 하한 아래로 내려갑니다. 처음부터 병행(B)하면 {}. 합격·수습 이후 소득은 이 판정에 넣지 않은 보수적 기준입니다.",
                man(i.safety_min),
                ym(pa.tau),
                ym(pd.tau),
                if pb.tau.is_none() { format!("{}개월 동안 하한을 지킵니다", i.short_horizon) } else { format!("{}에 하한에 닿습니다", ym(pb.tau)) }
            )
        }
        "supportCut" => {
            let w = what_if?;
            let (wa, wd) = (path(w, Strategy::A), path(w, Strategy::D));
            facts.push(f("현재 가정: 지원 중단 월", format!("{}.{:02}", i.support_stop_from.y, i.support_stop_from.m), "input"));
            facts.push(f("가정 변경: 지원 중단 월", format!("{}.{:02}", w.inputs.support_stop_from.y, w.inputs.support_stop_from.m), "input"));
            facts.push(f("전업 τ (현재 → 변경)", format!("{} → {}", ym(pa.tau), ym(wa.tau)), "engine"));
            facts.push(f("조건부 전환 τ (현재 → 변경)", format!("{} → {}", ym(pd.tau), ym(wd.tau)), "engine"));
            let s1 = |p: &PathResult| p.events.iter().find(|e| e.kind == "signal1").map(|e| e.month);
            facts.push(f("신호 1 발동 (현재 → 변경)", format!("{} → {}", ym(s1(pd)), ym(s1(wd))), "engine"));
            format!(
                "지원이 감액 시점({}.{:02})에 바로 끊긴다고 다시 계산하면, 전업의 안전자금 위반은 {}에서 {}로, 조건부 전환은 {}에서 {}로 바뀝니다. 신호 1(잔액 {} 이하) 발동도 {}로 당겨지므로, 근로처 탐색을 그만큼 일찍 시작하고 변동 지출을 먼저 줄여야 합니다.",
                w.inputs.support_stop_from.y, w.inputs.support_stop_from.m, ym(pa.tau), ym(wa.tau), ym(pd.tau), ym(wd.tau), man(i.signal1), ym(s1(wd))
            )
        }
        "delayRule" => {
            for t in a.tolerance.iter().filter(|t| t.strategy != Strategy::C) {
                let v = match t.months {
                    None => "발표 전 이미 위반".to_string(),
                    Some(m) if t.open_ended => format!("{m}개월 이상"),
                    Some(m) => format!("{m}개월"),
                };
                facts.push(f(format!("{} 지연 내성", name(t.strategy)), v, "engine"));
            }
            facts.push(f("발표 시 잔액(D)", man(a.signals.cash_at_announce), "engine"));
            let td = a.tolerance.iter().find(|t| t.strategy == Strategy::D).and_then(|t| t.months).unwrap_or(0);
            format!(
                "합격해도 첫 급여까지 기다리는 동안 버틸 수 있는 기간은 전략에 따라 다릅니다. 조건부 전환(D)은 발표 시 잔액 {}으로 지연 {}개월까지 안전자금을 지킵니다. 발표 직후 수습처 확정 시점을 확인해 지연이 {}개월을 넘을 것 같으면 근로 병행을 유지하고, 신호 2(잔액 {} 이하)가 오면 구직을 시작하는 것이 전환 규칙입니다(신호 3).",
                man(a.signals.cash_at_announce), td, td, man(i.signal2)
            )
        }
        "feasible" => {
            let mut ok = vec![];
            for p in &a.short {
                let st = if !p.missing.is_empty() { "입력 필요".to_string() } else if p.safe() { ok.push(name(p.strategy)); "통과".into() } else { format!("탈락 (τ {})", ym(p.tau)) };
                facts.push(f(name(p.strategy), st, "engine"));
            }
            if ok.is_empty() {
                "현재 가정에서는 18개월 동안 안전자금과 월중 지급을 모두 지키는 전략이 없습니다. 지출·근로 조건을 조정한 뒤 다시 확인해야 합니다.".into()
            } else {
                format!("18개월 동안 안전자금과 월중 지급을 모두 지키는 전략은 {}입니다. 장기 가치 비교는 이 전략들 사이에서만 합니다. 취업 전환(C)은 임금이 입력되어야 판정할 수 있습니다.", ok.join(", "))
            }
        }
        "verify" => {
            facts.push(f("계산식", "C(t) = C(t−1) + 유입 − 생활비 − 수험비 − 채무지급", "engine"));
            facts.push(f("전업 τ", ym(pa.tau), "engine"));
            facts.push(f("집단 합격률(유예생, 2026)", "61.0% = 959/1,572명 — 개인 확률 아님", "official"));
            "AI가 낸 수치는 그대로 쓰지 않고 Rust 계산 엔진으로 다시 계산해 대조합니다. 잔액·위반월·지연 내성은 같은 입력으로 독립 계산하고, 허용 오차 안이면 ‘계산 일치’, 벗어나면 ‘오류 발견’으로 표시합니다. 제도 정보(합격률, 학자금 상환 기준, 수습 제도)는 공식 자료와 대조하며, 근거를 찾지 못하면 ‘근거 부족’으로 남깁니다. 최종 판정과 수정은 사람이 기록합니다.".into()
        }
        _ => return None,
    };
    Some(RuleAnswer { id: id.into(), question: q.into(), answer: text, facts, out_of_scope: false })
}

/// LLM 답변 숫자 대조용 허용값(원 단위)
pub fn allowed_won(a: &Analysis) -> Vec<i64> {
    let i = &a.inputs;
    let mut v = vec![i.cash0, i.deposit, i.student_loan, i.living, i.rent, i.exam_cost, i.exam_cost_after, i.support_initial, i.support_reduced, i.safety_min, i.part_time_income, i.signal1, i.signal2, a.signals.cash_at_announce];
    v.extend([i.job_wage, i.trainee_salary, i.cpa_salary].into_iter().flatten());
    for p in &a.short {
        v.extend([p.min_cash, p.end_cash]);
        v.extend(p.tau_cash);
        for m in &p.months {
            v.extend([m.cash, m.net, m.inflow, m.outflow, m.mid_low]);
        }
    }
    v.extend(a.tolerance.iter().filter_map(|t| t.margin));
    v.sort();
    v.dedup();
    v
}
