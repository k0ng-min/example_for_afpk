# generated — Adaptive Idea Engine 생성 주제

런타임(웹앱)에서 생성된 주제 구성은 보안상 파일 시스템에 쓰지 않고 SQLite `topic_versions` 테이블에 버전으로 저장된다.

생성 구성을 소스 관리용 프리셋으로 승격하려면(개발 방식 A):

1. Idea Configuration Studio → 미리보기에서 "JSON 내보내기"로 구성을 받는다.
2. 이 폴더 아래 `<topic_id>/` 디렉터리를 만들고 7개 파일(topic.json 등)로 분리한다.
3. `backend/src/domain/topics/loader.rs` 의 `PRESETS` 에 등록하고 `cargo test` 로 검증한다.
