//! Gemini REST 클라이언트(서버 측 전용). 키는 환경변수 GEMINI_API_KEY 로만 받고 로그·응답에 절대 노출하지 않는다.
//! 호출: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…
//! (신형 `AQ.` 키는 x-goog-api-key 헤더를 거부하고 key 쿼리만 인증되어 쿼리 방식을 쓴다. URL 은 로그·오류에 남기지 않는다)
//! 주 모델이 혼잡(503)·한도(429)·시간 초과면 예비 모델로 한 번 더 시도한다.
//!
//! LLM 출력은 신뢰하지 않는다: 답변 속 금액·비율을 Rust 엔진 계산값과 대조해(`check_numbers`)
//! 근거 없는 숫자를 화면에 "검증되지 않은 수치"로 표시한다.

use std::time::Duration;

use serde_json::{json, Value};

const ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Clone)]
pub struct GeminiClient {
    http: reqwest::Client,
    key: String,
    pub model: String,
    pub fallback_model: Option<String>,
}

impl std::fmt::Debug for GeminiClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GeminiClient").field("model", &self.model).field("fallback_model", &self.fallback_model).field("key", &"***").finish()
    }
}

/// 모델 id 는 URL 경로에 들어가므로 허용 문자만 받는다(경로 조작 방지)
pub fn valid_model(m: &str) -> bool {
    !m.is_empty() && m.len() <= 64 && m.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.')
}

impl GeminiClient {
    pub fn new(key: String, model: String, fallback_model: Option<String>) -> Result<Self, String> {
        for m in std::iter::once(&model).chain(fallback_model.iter()) {
            if !valid_model(m) {
                return Err(format!("Gemini 모델 id 형식이 올바르지 않습니다: {m}"));
            }
        }
        let fallback_model = fallback_model.filter(|f| f != &model);
        let http = reqwest::Client::builder().timeout(Duration::from_secs(40)).build().map_err(|e| e.to_string())?;
        Ok(Self { http, key, model, fallback_model })
    }

    /// 주 모델 → (혼잡·한도·시간 초과 시) 예비 모델. 성공하면 (답변, 실제 사용 모델)
    pub async fn generate(&self, system: &str, user: &str) -> Result<(String, String), String> {
        match self.generate_with(&self.model, system, user).await {
            Ok(t) => Ok((t, self.model.clone())),
            Err((retryable, e)) => match (&self.fallback_model, retryable) {
                (Some(fb), true) => {
                    tracing::warn!(model = %self.model, fallback = %fb, error = %e, "Gemini 주 모델 실패 — 예비 모델로 재시도");
                    self.generate_with(fb, system, user).await.map(|t| (t, fb.clone())).map_err(|(_, e2)| format!("{e} / 예비 모델({fb}): {e2}"))
                }
                _ => Err(e),
            },
        }
    }

    /// 1회 호출. Err 의 bool = 다른 모델로 재시도할 만한 오류(혼잡·한도·시간 초과·모델 없음)
    async fn generate_with(&self, model: &str, system: &str, user: &str) -> Result<String, (bool, String)> {
        let body = json!({
            "systemInstruction": { "parts": [{ "text": system }] },
            "contents": [{ "role": "user", "parts": [{ "text": user }] }],
            "generationConfig": { "temperature": 0.2, "maxOutputTokens": 8192 }
        });
        let url = format!("{ENDPOINT}/{model}:generateContent");
        let res = self
            .http
            .post(url)
            .query(&[("key", self.key.as_str())])
            .json(&body)
            .send()
            .await
            .map_err(|e| if e.is_timeout() { (true, "Gemini 응답 시간 초과(40초)".to_string()) } else { (true, "Gemini 서버에 연결하지 못했습니다".to_string()) })?;
        let status = res.status();
        let v: Value = res.json().await.map_err(|_| (true, format!("Gemini 응답을 해석하지 못했습니다(HTTP {status})")))?;
        if !status.is_success() {
            let retryable = matches!(status.as_u16(), 404 | 429 | 500 | 503 | 504);
            let msg = v["error"]["message"].as_str().unwrap_or("알 수 없는 오류");
            let hint = match status.as_u16() {
                400 | 403 => " — API 키 또는 모델명을 확인하세요",
                404 => " — GEMINI_MODEL 모델명을 확인하세요",
                429 => " — 무료 사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요",
                503 => " — 모델 요청이 몰려 있습니다. 잠시 후 다시 시도하세요",
                _ => "",
            };
            // 오류 본문에 키가 들어오는 경우를 대비해 키 문자열을 지운다
            return Err((retryable, format!("{model} HTTP {}: {}{hint}", status.as_u16(), msg.replace(&self.key, "***"))));
        }
        let text: String = v["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| parts.iter().filter(|p| p["thought"].as_bool() != Some(true)).filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join(""))
            .unwrap_or_default();
        if text.trim().is_empty() {
            let reason = v["candidates"][0]["finishReason"].as_str().or(v["promptFeedback"]["blockReason"].as_str()).unwrap_or("빈 응답");
            return Err((false, format!("{model} 가 답변을 만들지 않았습니다({reason})")));
        }
        // 길이 제한으로 잘린 답은 잘렸다고 표시한다(잘린 출력을 완전한 답처럼 보이지 않게)
        if v["candidates"][0]["finishReason"].as_str() == Some("MAX_TOKENS") {
            return Ok(format!("{text}

[응답이 최대 출력 길이에서 잘렸습니다]"));
        }
        Ok(text)
    }
}

/// 답변 속 숫자 하나: 원문 표기와 1/100 단위 정수값(예: "1.02억" → 10_200_000_000, "34.38%" → 3438)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NumToken {
    pub raw: String,
    pub hundredths: i128,
    pub percent: bool,
}

/// 금액(원·만·억)과 비율(%)만 추출한다. 개월·세·순위 같은 작은 정수는 검사 대상이 아니다.
pub fn extract_numbers(text: &str) -> Vec<NumToken> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = vec![];
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        let neg = start > 0 && (chars[start - 1] == '-' || chars[start - 1] == '−');
        let mut int_part = String::new();
        let mut frac = String::new();
        while i < chars.len() && (chars[i].is_ascii_digit() || (chars[i] == ',' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit())) {
            if chars[i] != ',' {
                int_part.push(chars[i]);
            }
            i += 1;
        }
        if i + 1 < chars.len() && chars[i] == '.' && chars[i + 1].is_ascii_digit() {
            i += 1;
            while i < chars.len() && chars[i].is_ascii_digit() {
                frac.push(chars[i]);
                i += 1;
            }
        }
        let mut j = i;
        while j < chars.len() && chars[j] == ' ' {
            j += 1;
        }
        let unit: String = chars[j..chars.len().min(j + 2)].iter().collect();
        let (mult, percent, consumed): (i128, bool, usize) = if unit.starts_with('%') {
            (1, true, 1)
        } else if unit.starts_with("억") {
            (100_000_000, false, 1)
        } else if unit.starts_with("만") {
            (10_000, false, 1)
        } else if unit.starts_with('원') {
            (1, false, 1)
        } else {
            (1, false, 0)
        };
        // "999만원", "1.02억원"처럼 뒤따르는 '원'까지 원문 표기에 포함
        let consumed = if consumed == 1 && (unit.starts_with('만') || unit.starts_with('억')) && chars.get(j + 1) == Some(&'원') { 2 } else { consumed };
        let raw_end = if consumed > 0 { j + consumed } else { i };
        let raw: String = chars[if neg { start - 1 } else { start }..raw_end].iter().collect();
        let frac2: String = format!("{:0<2}", frac.chars().take(2).collect::<String>());
        let whole: i128 = int_part.parse().unwrap_or(0);
        let mut h = whole * 100 + frac2.parse::<i128>().unwrap_or(0);
        if !percent {
            h *= mult;
        }
        if neg {
            h = -h;
        }
        // 단위 없는 숫자는 1,000 이상(콤마 금액)만 금액으로 본다
        let is_money_like = consumed > 0 || whole >= 1000;
        if is_money_like {
            out.push(NumToken { raw: raw.trim().to_string(), hundredths: h, percent });
        }
        i = raw_end.max(i);
    }
    out
}

/// 허용값(엔진 계산값·입력값)과 ±1% 이내(또는 만 원 반올림 표기) 일치하지 않는 숫자를 반환
pub fn check_numbers(text: &str, allowed_won: &[i64], allowed_pct_bps: &[i64]) -> (usize, Vec<String>) {
    let toks = extract_numbers(text);
    // 금액: 상대 1% 또는 5,000원 이내(만 원 반올림 표기 허용). 비율: 상대 1% 또는 0.05%p 이내
    let near_won = |a: i128, b: i128| {
        let d = (a - b).abs();
        d * 100 <= b.abs() || d <= 500_000
    };
    let near_pct = |a: i128, b: i128| {
        let d = (a - b).abs();
        d * 100 <= b.abs() || d <= 5
    };
    let mut bad = vec![];
    for t in &toks {
        let ok = if t.percent {
            allowed_pct_bps.iter().any(|&b| near_pct(t.hundredths, i128::from(b)))
        } else {
            allowed_won.iter().any(|&w| near_won(t.hundredths, i128::from(w) * 100))
        };
        if !ok && !bad.contains(&t.raw) {
            bad.push(t.raw.clone());
        }
    }
    (toks.len(), bad)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_name_is_restricted() {
        assert!(valid_model("gemini-2.5-flash"));
        assert!(!valid_model("../x"));
        assert!(!valid_model("gemini/flash?key=1"));
    }

    #[test]
    fn extracts_korean_money_and_percent() {
        let t = extract_numbers("월 순현금흐름은 1,100,000원, 약 110만 원이고 저축률은 34.38%이며 순자산은 1.02억, 3개월 차");
        let v: Vec<(i128, bool)> = t.iter().map(|x| (x.hundredths, x.percent)).collect();
        assert_eq!(v, vec![(110_000_000, false), (110_000_000, false), (3438, true), (10_200_000_000, false)]);
    }

    #[test]
    fn flags_unsupported_numbers() {
        let (n, bad) = check_numbers("저축 여력은 110만 원, 투자하면 연 7% 수익, 순자산 999만원", &[1_100_000, 8_700_000], &[3438]);
        assert_eq!(n, 3);
        assert_eq!(bad, vec!["7%".to_string(), "999만원".to_string()]);
        let (_, bad) = check_numbers("−2,464만 원까지 줄어듭니다", &[-24_640_000], &[]);
        assert!(bad.is_empty());
    }
}
