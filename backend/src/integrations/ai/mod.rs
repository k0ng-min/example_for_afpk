//! AI 통합 계층. ai/ 디렉터리의 에이전트 레지스트리와 프롬프트를 로드한다.
//! GEMINI_API_KEY 가 있으면 AI 상담이 Gemini 를 서버 측에서 호출한다(gemini.rs). 없으면 규칙 기반 + Rust 계산만 사용한다.
//! 그 외 에이전트(분석·검증·보고서)는 여전히 규칙 엔진이며, 호출하지 않은 기능을 LLM 결과라고 표시하지 않는다.

pub mod gemini;

use std::path::{Component, Path};

use serde::{Deserialize, Serialize};

use crate::domain::topics::AgentId;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentDef {
    pub id: AgentId,
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub task_prompt: String,
    pub input_schema: String,
    pub output_schema: String,
    /// "rule_engine" | "llm_optional" — 현재 실제 구현 방식
    pub runtime: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentView {
    #[serde(flatten)]
    pub def: AgentDef,
    pub system_prompt_text: String,
    pub task_prompt_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    /// "rule_based" — 현재 모든 분석은 규칙 기반 + Rust 계산
    pub mode: &'static str,
    pub llm_key_detected: bool,
    pub llm_calls_enabled: bool,
    pub note: &'static str,
    /// 설정된 기본 모델명(키가 설정된 경우만). 실제 응답 모델은 답변마다 별도로 돌려준다.
    pub model: Option<String>,
    /// LLM 을 실제로 호출하는 기능 목록(그 외 기능은 규칙 엔진)
    pub llm_features: Vec<&'static str>,
    /// LLM 에 전달하는 데이터 범위(투명성 표시용)
    pub llm_input_scope: &'static str,
}

pub struct AiRegistry {
    pub agents: Vec<AgentView>,
    pub status: AiStatus,
    /// 설정 시 AI 상담 답변을 Gemini 로 생성
    pub gemini: Option<gemini::GeminiClient>,
    /// 공통 시스템 프롬프트(ai/prompts/system/base.md) + AI 상담 작업 프롬프트(ai/prompts/analysis/copilot.md)
    pub base_prompt: String,
    pub copilot_prompt: String,
}

/// ai/ 하위의 상대 경로만 허용(경로 탈출 방지)
fn safe_rel(p: &str) -> bool {
    let path = Path::new(p);
    !p.is_empty() && path.components().all(|c| matches!(c, Component::Normal(_))) && p.ends_with(".md")
}

impl AiRegistry {
    pub fn load(ai_dir: &Path, key_present: bool, gemini: Option<gemini::GeminiClient>) -> Result<Self, String> {
        let reg_path = ai_dir.join("config").join("agents.json");
        let text = std::fs::read_to_string(&reg_path).map_err(|e| format!("{}: {e}", reg_path.display()))?;
        let defs: Vec<AgentDef> = serde_json::from_str(&text).map_err(|e| format!("agents.json: {e}"))?;
        let mut agents = vec![];
        for d in defs {
            for p in [&d.system_prompt, &d.task_prompt] {
                if !safe_rel(p) {
                    return Err(format!("agents.json: 허용되지 않는 프롬프트 경로 '{p}'"));
                }
            }
            let read = |p: &str| std::fs::read_to_string(ai_dir.join(p)).map_err(|e| format!("{p}: {e}"));
            agents.push(AgentView { system_prompt_text: read(&d.system_prompt)?, task_prompt_text: read(&d.task_prompt)?, def: d });
        }
        let base_prompt = std::fs::read_to_string(ai_dir.join("prompts/system/base.md")).map_err(|e| format!("base.md: {e}"))?;
        let copilot_prompt = std::fs::read_to_string(ai_dir.join("prompts/analysis/copilot.md")).map_err(|e| format!("copilot.md: {e}"))?;
        if let Some(g) = &gemini {
            let model = Some(g.model.clone());
            return Ok(Self {
                agents,
                base_prompt,
                copilot_prompt,
                gemini,
                status: AiStatus {
                    mode: "gemini",
                    llm_key_detected: true,
                    llm_calls_enabled: true,
                    note: "Gemini API 키가 설정되어 AI 재무 상담 답변만 Gemini 가 작성합니다. 근거는 Rust 계산값뿐이며, 답변 속 금액·비율은 서버가 계산값과 자동 대조합니다. 분석·검증·보고서·캔버스는 규칙 엔진과 Rust 계산입니다.",
                    model,
                    llm_features: vec!["copilot"],
                    llm_input_scope: "합성 고객의 이름·나이·직업·가족 상황·계산 가정, Rust 계산 지표·예측 요약·목표·경고, 규칙 엔진 초안 답변",
                },
            });
        }
        Ok(Self {
            agents,
            base_prompt,
            copilot_prompt,
            gemini: None,
            status: AiStatus {
                mode: "rule_based",
                llm_key_detected: key_present,
                llm_calls_enabled: false,
                note: if key_present {
                    "ANTHROPIC_API_KEY 는 감지만 하고 호출하지 않습니다(Gemini 만 지원). 모든 결과는 규칙 기반 엔진과 Rust 계산으로 생성됩니다."
                } else {
                    "AI API 키가 없습니다. 모든 결과는 규칙 기반 엔진과 Rust 계산으로 생성됩니다."
                },
                model: None,
                llm_features: vec![],
                llm_input_scope: "LLM 미호출",
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_escape() {
        assert!(safe_rel("prompts/system/base.md"));
        assert!(!safe_rel("../secrets.md"));
        assert!(!safe_rel("C:/x.md"));
        assert!(!safe_rel("prompts/x.json"));
    }
}
