//! topics/ 디렉터리 로더. 경로 탈출을 막기 위해 허용된 프리셋 id 와 고정 파일명만 읽는다.

use std::path::Path;

use serde_json::{Map, Value};

use super::{Rule, TopicConfig};

/// (주제 id, 디렉터리명)
pub const PRESETS: &[(&str, &str)] = &[
    ("shared_workspace", "shared"),
    ("family_commitment", "family_commitment"),
    ("household_business", "household_business"),
    ("care_crisis", "care_crisis"),
    ("goal_discovery", "goal_discovery"),
    ("ai_verification", "ai_verification"),
];

pub const DEFAULT_TOPIC_ID: &str = "shared_workspace";

/// (파일명, 병합 방식: Some(key) → 해당 key 아래에 삽입, None → 최상위 병합)
const FILES: &[(&str, Option<&str>)] = &[
    ("topic.json", None),
    ("input_schema.json", Some("inputSchema")),
    ("canvas_config.json", Some("canvas")),
    ("scenario_presets.json", Some("scenarioPresets")),
    ("visual_config.json", Some("visual")),
    ("content.json", Some("content")),
    ("verification_rules.json", None),
];

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn load_topic_dir(topics_root: &Path, dir: &str) -> Result<TopicConfig, String> {
    let base = topics_root.join(dir);
    let mut merged = Map::new();
    for (file, key) in FILES {
        let v = read_json(&base.join(file))?;
        match key {
            Some(k) => {
                merged.insert((*k).to_string(), v);
            }
            None => match v {
                Value::Object(o) => merged.extend(o),
                _ => return Err(format!("{dir}/{file}: 객체여야 합니다")),
            },
        }
    }
    serde_json::from_value(Value::Object(merged)).map_err(|e| format!("{dir}: 스키마 오류 — {e}"))
}

pub fn load_base_rules(topics_root: &Path) -> Result<Vec<Rule>, String> {
    let v = read_json(&topics_root.join("shared").join("base_rules.json"))?;
    serde_json::from_value(v).map_err(|e| format!("shared/base_rules.json: {e}"))
}

pub fn load_presets(topics_root: &Path) -> Result<Vec<TopicConfig>, String> {
    PRESETS.iter().map(|(_, dir)| load_topic_dir(topics_root, dir)).collect()
}
