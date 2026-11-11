// 장면별 대표 프레임을 PNG 로 렌더링해 확인한다(자막 겹침·잘림·레이아웃 점검용).
//   사용: npm run still   → out/stills/<장면>-<초>.png
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
import { readFileSync } from 'node:fs'
const { SCENE_ORDER, FPS, TRANSITION_FRAMES } = await import('../src/config/schema.ts')
const ideaId = process.argv[2] ?? 'cpa_gap'
const cfg = JSON.parse(readFileSync(`src/ideas/${ideaId}.json`, 'utf8'))
mkdirSync('out/stills', { recursive: true })
let start = 0
const frames = []
for (const id of SCENE_ORDER) {
  const len = Math.round(cfg.durations[id] * FPS)
  for (const f of [0.35, 0.75]) frames.push({ id, frame: start + Math.round(len * f), sec: Math.round(cfg.durations[id] * f) })
  start += len - TRANSITION_FRAMES
}
for (const s of frames) {
  const out = `out/stills/${s.id}-${s.sec}s.png`
  const r = spawnSync('npx', ['remotion', 'still', 'src/index.ts', 'FinovaPromo', out, `--frame=${s.frame}`, '--log=error'], { stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log('저장', out)
}
