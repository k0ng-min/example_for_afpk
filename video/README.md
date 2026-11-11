# FINOVA 제품 소개영상 (Remotion)

「합격해도 끝나지 않는다」 — CPA 2차 유예생 소득 공백 재무설계를 소개하는 **106.5초 · 1920×1080 · 30fps · H.264 MP4** 영상 프로젝트.
웹앱(frontend/backend)과 분리된 폴더이며, 웹앱 코드·API·DB 는 읽기만 한다.

- 결과물: `out/finova-promo.mp4`
- 디자인: 최종 사이트와 같은 모던 블랙 & 화이트(밝은 바탕, 은은한 격자, 검은 강조). 색은 의미(초록 버팀·앰버 부족·코랄 위험·보라 AI)와 전략 구분에만 쓴다.
- 재무 수치: 전부 `src/data/snapshot-cpa.json` — 실행 중인 Rust 엔진(`/api/cpa/defaults·analyze·explore·experiments`)에서 받아 저장한 값. 영상용으로 지어낸 숫자는 없다.
- AI 검증 장면의 주장은 `ai/evaluations/cpa_experiment_runs.json` 의 실제 Gemini 원출력이며, 엔진 값은 기획서와 같은 "임금 미입력" 가정으로 다시 계산했다(웹앱 AI 검증 화면과 동일). 23건 집계(일치 6·오류 7·검토 10)는 웹앱 AI 검증 화면 결과(`docs/CPA_FINAL_IDEA.md` 5-1).

## 실행·렌더링

```bash
cd video
npm install                 # 처음 한 번
npm run snapshot            # (선택) 백엔드 실행 중일 때 엔진 수치 갱신 → src/data/snapshot-cpa.json
npm run check               # 설정 검사: 스키마·전체 90~120초·대본 속도·자막 길이
npm run check -- --captions # 자막 시간표까지 출력
npm run studio              # 브라우저 미리보기(Remotion Studio)
npm run still               # 장면별 대표 프레임 PNG → out/stills/
npm run render              # 최종 MP4 → out/finova-promo.mp4
```

자막 없이 렌더링: `npx remotion render src/index.ts FinovaPromo out/no-captions.mp4 --props='{"captions":false}'`

## 스토리보드 (전환 0.5초 겹침 포함 106.5초)

| # | 장면 | 길이 | 화면 | 데이터 출처 |
|---|---|---|---|---|
| 1 | 문제 제기 | 12초 | 보유 현금·생활비·가족 지원·수험비·시험/발표 일정·학자금·수습처 카드가 떠다니다 흐려지고 "합격해도 월세는 기다려주지 않는다" | 엔진 입력값(합성 고객) |
| 2 | 소개 | 10초 | FINOVA 브랜드 → 앱 창이 펼쳐지며 "두 번의 소득 공백" 타임라인(공백 ① 수험 기간, 공백 ② 첫 급여까지) | 시험·발표 월(공고 전 임시) |
| 3 | 고객 정보 | 14초 | 고객 숫자 카운트업 + 공부만 할 때 잔액 선이 그려지고 2027.10 비상금 부족 표시, "버틸 수 있는 기간 10개월" | `analyze` A 경로, `explore` 민감도 |
| 4 | AI 분석 | 14초 | 판단 흐름 노드 8개가 차례로 연결 → 네 가지 선택지 카드(18개월 판정·최저 잔액) → 커서가 D 선택 | `analyze` short |
| 5 | 시뮬레이션 | 18초 | 네 전략 18개월 잔액 동시 그리기 → 스트레스 테스트 표(충격 5개 + 한꺼번에)가 행마다 채워짐 | `analyze`, `explore` stress |
| 6 | AI 검증 | 19초 | 실제 Gemini 주장 3건(E1 일치, E8·E6 오류)을 엔진 값과 대조해 판정 도장 → 집계 23·6·7·10 → 검증 순서 4단계 | runs 파일 + 엔진 재계산 |
| 7 | 실행 계획·보고서 | 14초 | 점검선 1·2 규칙 카드(예상 발동 월) → 보고서 9개 섹션이 조립되고 인쇄·PDF | `analyze` signals |
| 8 | 엔딩 | 9초 | 브랜드 + "합격 확률이 아니라, 버틸 수 있는 시간을 설계합니다" + 기대 효과 | 설정 |

## 내레이션 대본 (자막과 동일, `src/ideas/cpa_gap.json` → `narration`)

1. 보유 현금 1,400만 원, 줄어드는 가족 지원, 아직 정해지지 않은 수습처. CPA 2차 유예생에게 합격은 끝이 아닙니다.
2. 합격 전 수험 기간과 합격 후 첫 급여까지. 두 번의 소득 공백을 하나의 워크스페이스에서 설계합니다.
3. 고객의 돈과 일정을 넣으면, Rust 계산 엔진이 매달 잔액을 계산합니다. 공부만 계속하면 10개월 뒤 비상금 하한 아래로 내려갑니다.
4. AI 분석은 고객 상황부터 전환 규칙까지 판단의 흐름을 연결합니다. 먼저 네 가지 선택지가 18개월을 버티는지 확인합니다.
5. 조건을 바꾸면 그래프가 바로 다시 계산됩니다. 생활비 상승과 지원 중단 같은 충격을 한꺼번에 넣어, 어느 선택지가 끝까지 버티는지 봅니다.
6. AI의 답은 정답이 아니라 검증할 가설입니다. 실제 AI 답변의 숫자를 엔진 값과 하나씩 대조해, 부족 자금을 310만 원으로 잘못 계산한 오류를 찾아냈습니다.
7. 검증된 결과는 잔액 점검선에 따른 실행 규칙과 보고서로 정리됩니다. 언제 무엇을 바꿀지 미리 정해 둡니다.
8. 합격 확률이 아니라, 버틸 수 있는 시간을 설계합니다. (엔딩은 화면 문구와 같아 자막을 끔: `captions.ending = []`, 음성은 나옴)

### 내레이션 음성

- **여성 음성(Google Gemini TTS, 모델 `gemini-2.5-flash-preview-tts`, 목소리 `Sulafat`)** 으로 장면마다 생성해 `public/narration/cpa_gap/<장면>.wav` 에 두었다. 장면 시작 0.5초 뒤 재생된다.
- 자막은 실제 말소리에 맞춘다: 음성 속 무음 구간으로 자막 조각 경계를 찾아 `src/data/narration-cpa_gap.json` 에 시각을 기록한다(8개 장면 모두 무음 정렬 성공).
- 검증: 생성된 음성을 다시 받아 적게 해 대본과 일치(숫자 1,400만·310만·CPA 포함)를 확인했다.
- 다시 만들기: `npm run voice` (= `node scripts/make-narration.mjs cpa_gap`, ffmpeg 필요). 한 장면만: `-- --only verify`. 다른 목소리: `-- --voice Aoede`.
  - 무료 등급은 **모델별 하루 10회** 한도라 8개 장면을 한 번 만들면 그날 거의 다 쓴다(장면 사이 21초 대기).
  - 말투 지시문을 대본 앞에 붙이면 모델이 지시문까지 읽는 문제가 있어 대본만 보낸다.
  - 대본 텍스트가 Google 로 전송된다. API 키는 저장소 루트 `.env` 의 `GEMINI_API_KEY`(출력·저장하지 않음).
- 음성 없이 렌더링: `--props='{"voice":false}'`. 직접 녹음한 파일을 쓰려면 설정에 `"narrationAudio": { "problem": "narration/my/problem.mp3" }`.
- 배경음악은 라이선스 확인 전이라 넣지 않았다.

## 아이디어(주제) 교체 방법

디자인·전환·애니메이션은 코드에 고정하고, 주제별 내용은 JSON 한 파일로 분리했다.

1. `src/ideas/cpa_gap.json` 을 복사해 `src/ideas/<새id>.json` 을 만들고 내용을 바꾼다.
   - `ideaTitle`, `hook`, `problemStatement`, `targetCustomer`, `financialChallenge`
   - `problemCards`(값은 `from: "client.cash0"` 처럼 스냅샷 경로 또는 `text`)
   - `gaps`, `navItems`, `aiAnalysis.nodes`, `scenarioExamples`(전략 4개 설명)
   - `verificationProcess`, `planRules`(`from: "signals.s1"` 로 엔진 발동 월 표시), `reportSections`
   - `expectedBenefits`, `endingMessage`, `endingSub`
   - `durations`(장면별 초), `narration`(장면별 대본), `captions`(선택), `narrationAudio`(선택)
2. 수치가 바뀌면 백엔드를 실행하고 `npm run snapshot -- --out src/data/<스냅샷>.json`, 설정의 `snapshot` 에 파일 이름을 적고 `src/data/index.ts` 에 한 줄 등록한다.
3. `src/config/active.ts` 의 `IDEAS` 에 등록하고 `ACTIVE_IDEA` 를 바꾼다(또는 렌더 때 `--props='{"ideaId":"<새id>"}'`).
4. `npm run check` — 전체 길이가 90~120초를 벗어나거나 대본이 장면 길이에 비해 너무 길면(초당 6.2자 초과) 실패한다.
5. `npm run still` 로 프레임을 확인한 뒤 `npm run render`.

## 폴더

```
video/
├── src/
│   ├── index.ts · Root.tsx · Video.tsx   # 등록·합성(장면 8개 + 교차 전환 + 자막)
│   ├── config/   schema.ts(zod) · timing.ts(길이·자막 계산) · active.ts(활성 주제)
│   ├── ideas/    cpa_gap.json             # 주제별 콘텐츠
│   ├── data/     snapshot-cpa.json · index.ts
│   ├── design/   tokens.ts · fonts.ts
│   ├── components/ motion.tsx(무대·카메라·커서·단계 목록·자막) · ui.tsx(앱 창·선 그래프·칩)
│   └── scenes/   Problem · Intro · Client · Ai · Simulate · Verify · Plan · Ending
├── scripts/  fetch-engine-snapshot.mjs · check-timeline.mjs · render-stills.mjs
└── public/fonts/  Pretendard·Outfit (OFL 1.1, FONTS.md)
```

## 라이선스 메모

- 글꼴: Pretendard·Outfit 모두 SIL OFL 1.1(`public/fonts/FONTS.md`).
- Remotion: 개인·3인 이하 조직·비영리는 무료, 그 외 조직은 회사 라이선스가 필요하다(https://www.remotion.dev/license). 대학생 팀의 공모전 제출이 무료 범위에 드는지 팀이 확인할 것.
- 외부 이미지·음악·아이콘 에셋은 쓰지 않았다(모든 그래픽은 코드로 그림).
