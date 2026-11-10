-- FINOVA 초기 스키마. 모든 도메인 데이터는 검증된 JSON 문서로 저장하고, 조회 키만 컬럼으로 분리한다.
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_client ON scenarios(client_id);

CREATE TABLE IF NOT EXISTS action_plans (
    client_id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_records (
    client_id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 주제 구성 버전: 프리셋(preset:*)과 생성 구성 모두 불변 행으로 저장(덮어쓰기 대신 새 버전 생성)
CREATE TABLE IF NOT EXISTS topic_versions (
    id TEXT PRIMARY KEY NOT NULL,
    topic_id TEXT NOT NULL,
    label TEXT NOT NULL,
    source TEXT NOT NULL,          -- preset | generated | imported
    status TEXT NOT NULL,          -- preset | draft | validated | invalid
    config TEXT NOT NULL,
    client TEXT,                   -- 생성된 합성 고객(JSON)
    meta TEXT NOT NULL DEFAULT '{}',  -- 아이디어 입력·분석·생성 노트
    validation TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
