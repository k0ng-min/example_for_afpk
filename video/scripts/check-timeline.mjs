// 모든 주제 설정(src/ideas/*.json)을 검사한다: 스키마, 전체 90~120초, 대본 속도, 자막 길이, 스냅샷 존재.
//   사용: npm run check            (모든 설정)
//         npm run check -- generic (하나만)
// Node 22 의 TypeScript 형식 제거 기능으로 영상과 같은 timing.ts 를 그대로 불러온다.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

const { checkConfig, captionsFor } = await import('../src/config/timing.ts')
const only = process.argv.slice(2).find((a) => !a.startsWith('--'))
const files = readdirSync('src/ideas').filter((f) => f.endsWith('.json') && (!only || f === `${only}.json`))
if (!files.length) {
  console.error(`설정 파일 없음: ${only ?? '(src/ideas 비어 있음)'}`)
  process.exit(1)
}
let failed = 0
for (const f of files) {
  const raw = JSON.parse(readFileSync(`src/ideas/${f}`, 'utf8'))
  const snapPath = `src/data/${raw.snapshot}`
  const snap = existsSync(snapPath) ? JSON.parse(readFileSync(snapPath, 'utf8')) : null
  const res = checkConfig(raw)
  if (!snap) res.errors.push(`스냅샷 없음: ${snapPath} (npm run snapshot -- --out ${snapPath})`)
  const ok = res.errors.length === 0
  if (!ok) failed++
  console.log(`${ok ? '통과' : '실패'}  ${f}  전체 ${res.seconds.toFixed(1)}초`)
  for (const e of res.errors) console.log(`   ✗ ${e}`)
  for (const w of res.warnings) console.log(`   · ${w}`)
  if (ok && process.argv.includes('--captions')) {
    for (const id of ['problem', 'intro', 'client', 'ai', 'simulate', 'verify', 'plan', 'ending']) {
      for (const c of captionsFor(raw, id)) console.log(`   [${id} ${c.from.toFixed(1)}–${c.to.toFixed(1)}] ${c.text}`)
    }
  }
}
process.exit(failed ? 1 : 0)
