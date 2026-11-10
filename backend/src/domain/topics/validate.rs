//! 주제 구성 검증. 프리셋과 생성된 구성 모두 신뢰할 수 없는 입력으로 취급해 동일하게 검증한다.

use std::collections::HashSet;

use serde::Serialize;

use super::{ModuleId, NodeKind, SignatureVisual, TopicConfig};
use crate::domain::clients::Client;
use crate::finance::metrics::is_known_metric;
use crate::finance::projections::project;
use crate::finance::validation::{is_safe_id, validate_adjustments, validate_client};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: &'static str,
    pub label: &'static str,
    pub passed: bool,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub ok: bool,
    pub checks: Vec<Check>,
}

fn check(id: &'static str, label: &'static str, details: Vec<String>) -> Check {
    Check { id, label, passed: details.is_empty(), details }
}

fn dupes<'a>(what: &str, ids: impl Iterator<Item = &'a str>, out: &mut Vec<String>) {
    let mut seen = HashSet::new();
    for id in ids {
        if !is_safe_id(id) {
            out.push(format!("{what} id '{id}' 형식 오류"));
        }
        if !seen.insert(id) {
            out.push(format!("{what} id '{id}' 중복"));
        }
    }
}

const FORBIDDEN: &[&str] = &["<script", "javascript:", "onerror=", "onload=", "{{", "${"];

fn text_issues(field: &str, v: &str, max: usize, out: &mut Vec<String>) {
    if v.chars().count() > max {
        out.push(format!("{field}: {max}자 초과"));
    }
    let lower = v.to_lowercase();
    if FORBIDDEN.iter().any(|f| lower.contains(f)) {
        out.push(format!("{field}: 허용되지 않는 코드/템플릿 패턴 포함"));
    }
    if v.chars().any(|c| c.is_control() && c != '\n') {
        out.push(format!("{field}: 제어 문자 포함"));
    }
}

/// `client` 는 주제의 대표 고객(계산 가능 여부 확인용). 없으면 계산 검사 실패.
pub fn validate_topic(t: &TopicConfig, client: Option<&Client>) -> ValidationReport {
    let mut checks = vec![];

    // 1. 식별자·텍스트
    let mut d = vec![];
    if !is_safe_id(&t.id) {
        d.push(format!("주제 id '{}' 형식 오류", t.id));
    }
    for (f, v, max) in [
        ("name", &t.name, 60),
        ("serviceName", &t.service_name, 60),
        ("tagline", &t.tagline, 160),
        ("problem", &t.problem, 600),
        ("targetCustomer", &t.target_customer, 200),
        ("content.heroTitle", &t.content.hero_title, 120),
        ("content.heroSubtitle", &t.content.hero_subtitle, 300),
        ("content.intro", &t.content.intro, 1200),
        ("content.problemStatement", &t.content.problem_statement, 1200),
        ("content.reportTitle", &t.content.report_title, 120),
        ("content.disclaimer", &t.content.disclaimer, 600),
    ] {
        text_issues(f, v, max, &mut d);
    }
    for v in t
        .content
        .analysis_questions
        .iter()
        .chain(&t.content.stage_descriptions)
        .chain(&t.verification_checklist)
        .chain(&t.requires_development)
    {
        text_issues("content", v, 400, &mut d);
    }
    for n in &t.canvas.nodes {
        text_issues("canvas.node", &n.label, 60, &mut d);
        text_issues("canvas.node.detail", &n.detail, 400, &mut d);
    }
    for r in &t.rules {
        text_issues("rule", &r.message, 300, &mut d);
    }
    for c in &t.ai_draft_claims {
        text_issues("aiDraftClaim", &c.statement, 300, &mut d);
    }
    if t.service_name.trim().is_empty() || t.content.hero_title.trim().is_empty() {
        d.push("서비스명·히어로 제목은 비어 있을 수 없습니다".into());
    }
    checks.push(check("schema", "데이터 스키마·텍스트 안전성", d));

    // 2. 중복·참조
    let mut d = vec![];
    dupes("node", t.canvas.nodes.iter().map(|n| n.id.as_str()), &mut d);
    dupes("edge", t.canvas.edges.iter().map(|e| e.id.as_str()), &mut d);
    dupes("preset", t.scenario_presets.iter().map(|p| p.id.as_str()), &mut d);
    dupes("rule", t.rules.iter().map(|r| r.id.as_str()), &mut d);
    dupes("input", t.input_schema.iter().map(|i| i.key.as_str()), &mut d);
    dupes("section", t.content.report_sections.iter().map(|s| s.id.as_str()), &mut d);
    dupes("action", t.content.action_templates.iter().map(|a| a.id.as_str()), &mut d);
    dupes("claim", t.ai_draft_claims.iter().map(|c| c.id.as_str()), &mut d);
    let node_ids: HashSet<&str> = t.canvas.nodes.iter().map(|n| n.id.as_str()).collect();
    for e in &t.canvas.edges {
        if !node_ids.contains(e.source.as_str()) || !node_ids.contains(e.target.as_str()) {
            d.push(format!("edge '{}'가 존재하지 않는 노드를 참조", e.id));
        }
    }
    let preset_ids: HashSet<&str> = t.scenario_presets.iter().map(|p| p.id.as_str()).collect();
    for c in &t.ai_draft_claims {
        if let Some(p) = &c.scenario_preset {
            if !preset_ids.contains(p.as_str()) {
                d.push(format!("claim '{}'가 존재하지 않는 시나리오 '{p}'를 참조", c.id));
            }
        }
    }
    if t.canvas.nodes.is_empty() || t.canvas.nodes.len() > 40 {
        d.push("캔버스 노드는 1~40개여야 합니다".into());
    }
    if !t.canvas.nodes.iter().any(|n| n.kind == NodeKind::Client) {
        d.push("캔버스에 고객 노드가 필요합니다".into());
    }
    checks.push(check("canvas", "AI 캔버스 노드·연결", d));

    // 3. 지표 참조(계산 엔진에 존재하는 지표만 허용)
    let mut d = vec![];
    let refs = t
        .canvas
        .nodes
        .iter()
        .filter_map(|n| n.metric.as_deref())
        .chain(t.visual.kpis.iter().map(String::as_str))
        .chain(t.rules.iter().map(|r| r.metric.as_str()))
        .chain(t.ai_draft_claims.iter().filter_map(|c| c.metric.as_deref()));
    for m in refs {
        if !is_known_metric(m) {
            d.push(format!("알 수 없는 지표 '{m}' — 새 지표는 Rust 계산 모듈 개발이 필요"));
        }
    }
    checks.push(check("metrics", "계산 지표 연결", d));

    // 4. 차트·시각화
    let mut d = vec![];
    if t.visual.charts.is_empty() {
        d.push("차트가 최소 1개 필요합니다".into());
    }
    if t.visual.kpis.is_empty() || t.visual.kpis.len() > 8 {
        d.push("KPI 는 1~8개여야 합니다".into());
    }
    let has = |m: ModuleId| t.modules.contains(&m);
    if !has(ModuleId::CoreCashflow) {
        d.push("core_cashflow 모듈은 필수입니다".into());
    }
    if t.signature_visual == SignatureVisual::ContagionMap && !has(ModuleId::BusinessContagion) {
        d.push("Contagion Map 은 business_contagion 모듈이 필요합니다".into());
    }
    if t.signature_visual == SignatureVisual::VerificationCourt && !has(ModuleId::ClaimVerification) {
        d.push("Verification Court 는 claim_verification 모듈이 필요합니다".into());
    }
    checks.push(check("visual", "차트·시각화 연결", d));

    // 5. 콘텐츠·보고서
    let mut d = vec![];
    if t.content.stage_descriptions.len() != 6 {
        d.push("재무설계 6단계 설명은 정확히 6개여야 합니다".into());
    }
    if t.content.report_sections.is_empty() {
        d.push("보고서 섹션이 최소 1개 필요합니다".into());
    }
    if t.content.analysis_questions.is_empty() {
        d.push("분석 질문이 최소 1개 필요합니다".into());
    }
    if t.content.action_templates.is_empty() {
        d.push("실행계획 템플릿이 최소 1개 필요합니다".into());
    }
    if t.verification_checklist.is_empty() {
        d.push("검증 체크리스트가 필요합니다".into());
    }
    checks.push(check("content", "콘텐츠·보고서 구성", d));

    // 6. AI 역할
    let mut d = vec![];
    if !t.agents.iter().any(|a| a.agent == super::AgentId::Critic) {
        d.push("AI 결과의 비판적 검증을 위해 critic 역할이 필요합니다".into());
    }
    for a in &t.agents {
        text_issues("agents.focus", &a.focus, 300, &mut d);
    }
    checks.push(check("ai", "AI 프롬프트 역할 구성", d));

    // 7. 입력 스키마·시나리오 계산 가능 여부
    let mut d = vec![];
    for f in &t.input_schema {
        if !(f.min <= f.default && f.default <= f.max) {
            d.push(format!("입력 '{}': min ≤ default ≤ max 위반", f.key));
        }
    }
    if t.scenario_presets.is_empty() {
        d.push("시나리오 프리셋이 최소 1개 필요합니다".into());
    }
    for p in &t.scenario_presets {
        for e in validate_adjustments(&p.adjustments) {
            d.push(format!("시나리오 '{}': {} {}", p.id, e.field, e.message));
        }
    }
    match client {
        None => d.push(format!("대표 고객 '{}'을(를) 찾을 수 없습니다", t.primary_client_id)),
        Some(c) => {
            for e in validate_client(c) {
                d.push(format!("고객 {}: {}", e.field, e.message));
            }
            if has(ModuleId::BusinessContagion) && c.business.is_none() {
                d.push("business_contagion 모듈은 사업 프로필이 있는 고객이 필요합니다".into());
            }
            if d.is_empty() {
                for p in &t.scenario_presets {
                    let proj = project(c, &p.adjustments);
                    if proj.rows.len() != p.adjustments.horizon_months as usize + 1 {
                        d.push(format!("시나리오 '{}' 계산 결과 행 수 불일치", p.id));
                    }
                }
            }
        }
    }
    checks.push(check("calculation", "고객 데이터·시나리오 계산 가능 여부", d));

    ValidationReport { ok: checks.iter().all(|c| c.passed), checks }
}
