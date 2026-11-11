// 내레이션 음성 생성(Gemini TTS, 여성 음성). 장면 대본을 자막 조각 단위로 읽어 WAV 로 저장하고,
// 각 조각의 시작·길이를 src/data/narration-<idea>.json 에 기록한다. 영상은 이 시각으로 음성과 자막을 함께 배치한다.
//   사용: node scripts/make-narration.mjs [idea_id] [--voice Sulafat] [--model gemini-2.5-flash-preview-tts] [--only <장면>]
// - API 키는 저장소 루트 .env 의 GEMINI_API_KEY 에서 읽는다(출력하지 않음). 대본 텍스트가 Google 로 전송된다.
// - 대본을 바꾸면 다시 실행해야 한다. ffmpeg/ffprobe 가 PATH 에 있어야 한다(앞뒤 무음 정리·길이 측정).
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'

if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
const { splitCaptionText } = await import('../src/config/timing.ts')
const { SCENE_ORDER } = await import('../src/config/schema.ts')

const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? process.argv[i + 1] : d
}
const idea = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !['--voice', '--model'].includes(all[i - 1])) ?? 'cpa_gap'
const VOICE = arg('--voice', 'Sulafat')
// 무료 등급은 모델별 하루 10회 한도 — 장면 8개를 한 번에 만들면 거의 다 쓴다
const MODEL = arg('--model', 'gemini-2.5-flash-preview-tts')
const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
const KEY = env.match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, '')
if (!KEY) throw new Error('.env 에 GEMINI_API_KEY 없음')

const cfg = JSON.parse(readFileSync(`src/ideas/${idea}.json`, 'utf8'))
const outDir = `public/narration/${idea}`
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

async function tts(text) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        // 말투 지시문을 붙이면 모델이 지시문까지 소리 내어 읽어 대본만 보낸다(Sulafat = 차분한 여성 음성)
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
      }),
    })
    if (res.ok) {
      const j = await res.json()
      const data = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data
      if (data) return Buffer.from(data, 'base64')
    }
    console.warn(`  재시도 ${attempt} (HTTP ${res.status})`)
    await new Promise((r) => setTimeout(r, 1500 * attempt))
  }
  throw new Error(`TTS 실패: ${text}`)
}

const probe = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim())

const LEAD = 0.5 // 장면 시작 후 첫 음성까지
const WAIT_MS = Number(arg('--wait', '21000')) // 분당 요청 한도(429)를 넘지 않게 장면 사이 대기
const only = arg('--only', null) // 한 장면만 다시 만들 때

/** 오디오의 무음 구간(시작·끝) 목록 */
function silences(file) {
  const out = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'silencedetect=n=-38dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const starts = [...out.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1])
  const ends = [...out.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1])
  return starts.map((s0, k) => ({ s: s0, e: ends[k] ?? s0 })).filter((g) => g.e > g.s)
}

const prev = (() => {
  try {
    return JSON.parse(readFileSync(`src/data/narration-${idea}.json`, 'utf8'))
  } catch {
    return null
  }
})()
const manifest = { idea, provider: 'Google Gemini TTS', model: MODEL, voice: VOICE, scenes: prev?.scenes ?? {} }
let problems = 0
let first = true
for (const id of SCENE_ORDER) {
  if (only && id !== only) continue
  if (!first) await new Promise((r) => setTimeout(r, WAIT_MS))
  first = false
  const text = cfg.narration[id]
  const pieces = splitCaptionText(text)
  const raw = `${outDir}/${id}.raw.wav`
  const file = `${outDir}/${id}.wav`
  writeFileSync(raw, wav(await tts(text)))
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse', file])
  rmSync(raw)
  const dur = probe(file)
  // 자막 조각 경계 = 말 사이 무음 중 가장 긴 (조각 수 − 1)개. 없으면 글자 수 비례
  const gaps = silences(file)
    .filter((g) => g.s > 0.2 && g.e < dur - 0.2)
    .sort((x, y) => y.e - y.s - (x.e - x.s))
    .slice(0, pieces.length - 1)
    .sort((x, y) => x.s - y.s)
  let cuts
  if (gaps.length === pieces.length - 1) cuts = gaps
  else {
    const total = pieces.reduce((n, p) => n + p.length, 0)
    let acc = 0
    cuts = pieces.slice(0, -1).map((p) => {
      acc += p.length
      const t0 = (acc / total) * dur
      return { s: t0, e: t0 }
    })
  }
  const cues = pieces.map((p, k) => ({ text: p, from: +(LEAD + (k === 0 ? 0 : cuts[k - 1].e) - 0.05).toFixed(2), to: +(LEAD + (k === pieces.length - 1 ? dur : cuts[k].s) + 0.25).toFixed(2) }))
  const end = LEAD + dur
  const ok = end <= cfg.durations[id] - 0.4
  if (!ok) problems++
  manifest.scenes[id] = { file: file.replace('public/', ''), from: LEAD, dur: +dur.toFixed(2), cues, aligned: gaps.length === pieces.length - 1 }
  console.log(`${ok ? '  ' : '✗ '}${id.padEnd(9)} 음성 ${dur.toFixed(1)}초(+${LEAD}) / 장면 ${cfg.durations[id]}초 · 자막 ${pieces.length}조각 ${gaps.length === pieces.length - 1 ? '무음 정렬' : '비례 배분'}`)
}
writeFileSync(`src/data/narration-${idea}.json`, JSON.stringify(manifest, null, 1) + '\n')
console.log(problems ? `장면보다 긴 음성 ${problems}개 — durations 를 늘리거나 대본을 줄이세요` : '모든 음성이 장면 안에 들어감')
