// 실행 중인 Rust API(/api/cpa/*)에서 영상에 쓸 계산 결과를 받아 스냅샷 JSON 으로 저장한다.
// 영상의 재무 수치는 이 파일에서만 가져온다(영상용 임의 수치 없음). 웹앱 데이터는 읽기만 한다.
//   사용: npm run snapshot -- [--api http://127.0.0.1:8080] [--out src/data/snapshot-cpa.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? process.argv[i + 1] : d
}
const API = arg('--api', 'http://127.0.0.1:8080')
const OUT = arg('--out', 'src/data/snapshot-cpa.json')

async function j(path, body) {
  const res = await fetch(API + '/api' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const NAMES = { A: '전업 수험', B: '근로 병행', C: '취업 전환', D: '조건부 전환' }
const inputs = await j('/cpa/defaults')
const a = await j('/cpa/analyze', inputs)
const ex = await j('/cpa/explore', inputs)
const exps = await j('/cpa/experiments')
// AI 실험 대조는 기획서·실험과 같은 "임금 미입력" 가정으로 계산한다(웹앱 PDF_BASELINE 과 동일)
const pdf = await j('/cpa/analyze', { ...inputs, jobWage: null, traineeSalary: null, cpaSalary: null })
const runs = JSON.parse(readFileSync(new URL('../../ai/evaluations/cpa_experiment_runs.json', import.meta.url), 'utf8'))

const pathOf = (an, s) => an.short.find((p) => p.strategy === s)
const cashAt = (an, s, m) => pathOf(an, s).months.find((r) => r.month === m)?.cash ?? null

// 영상에 보여 줄 대표 주장 3개: 실제 Gemini 원출력의 주장을 엔진 값과 대조
const pick = (exp, cid) => {
  const run = runs.runs.find((r) => r.experimentId === exp)
  const c = run.claims.find((x) => x.id === cid)
  return { run, c }
}
const claimRows = []
{
  const { run, c } = pick('E1', 'c1')
  const engine = cashAt(pdf, c.strategy, c.month)
  claimRows.push({ exp: 'E1', model: run.model, text: c.text, ai: c.aiValue, engine, status: Math.abs(c.aiValue - engine) <= c.tolerance ? 'match' : 'error', what: `${c.month.replace('-', '.')} 말 잔액` })
}
{
  const { run, c } = pick('E8', 'c1')
  const engine = cashAt(pdf, c.strategy, c.month)
  claimRows.push({ exp: 'E8', model: run.model, text: c.text, ai: c.aiValue, engine, status: Math.abs(c.aiValue - engine) <= c.tolerance ? 'match' : 'error', what: `${c.month.replace('-', '.')} 말 잔액` })
}
{
  const { run, c } = pick('E6', 'c1')
  const engine = inputs.cash0 - cashAt(pdf, c.strategy, c.month)
  claimRows.push({ exp: 'E6', model: run.model, text: c.text, ai: c.aiValue, engine, status: Math.abs(c.aiValue - engine) <= c.tolerance ? 'match' : 'error', what: '9개월간 줄어든 돈' })
}

const short = a.short.map((p) => ({
  id: p.strategy,
  name: NAMES[p.strategy],
  cash: p.months.map((r) => r.cash),
  tau: p.tau,
  insolvent: p.insolvent,
  minCash: p.minCash,
  endCash: p.endCash,
  pass: p.missing.length === 0 && !p.tau && !p.insolvent,
}))
const sig = (id) => a.signals.items.find((s) => s.id === id)

const snapshot = {
  meta: {
    source: 'FINOVA Rust 계산 엔진 API (/api/cpa/defaults · analyze · explore)',
    fetchedAt: new Date().toISOString(),
    aiModel: exps.ai?.model ?? null,
    note: '가상 고객 김유예는 합성 데이터. 임금 기본값은 보도·경총 조사 기반 가정, 2027년 시험 일정은 공고 전 임시.',
  },
  client: {
    name: '김유예',
    cash0: inputs.cash0,
    deposit: inputs.deposit,
    studentLoan: inputs.studentLoan,
    living: inputs.living,
    examCost: inputs.examCost,
    supportInitial: inputs.supportInitial,
    supportReduced: inputs.supportReduced,
    supportReduceFrom: inputs.supportReduceFrom,
    supportStopFrom: inputs.supportStopFrom,
    safetyMin: inputs.safetyMin,
    signal1: inputs.signal1,
    signal2: inputs.signal2,
    partTimeIncome: inputs.partTimeIncome,
    examMonth: inputs.examMonth,
    announceMonth: inputs.announceMonth,
    startMonth: inputs.startMonth,
    traineeSalary: inputs.traineeSalary,
    jobWage: inputs.jobWage,
  },
  months: a.short[0].months.map((r) => r.month),
  short,
  tolerance: a.tolerance.map((t) => ({ strategy: t.strategy, months: t.months, openEnded: t.openEnded })),
  signals: { s1: sig(1).ruleTrigger, s1Effect: sig(1).effectFrom, s2: sig(2).ruleTrigger, s2Effect: sig(2).effectFrom },
  long: a.long.available
    ? a.long.strategies.filter((v) => v.rank != null).sort((x, y) => x.rank - y.rank).map((v) => ({ id: v.strategy, name: NAMES[v.strategy], value: v.value, rank: v.rank }))
    : [],
  longAssumption: { p: inputs.pPct, q: inputs.qPct, delay: inputs.delay, r: inputs.discountBps / 100 },
  sensitivity: {
    runwayBase: ex.sensitivity.runwayBase,
    rows: ex.sensitivity.rows
      .map((r) => ({ label: r.label, low: r.lowLabel, high: r.highLabel, runwayLow: r.runwayLow, runwayHigh: r.runwayHigh }))
      .sort((x, y) => Math.abs((y.runwayHigh ?? 48) - (y.runwayLow ?? 48)) - Math.abs((x.runwayHigh ?? 48) - (x.runwayLow ?? 48))),
  },
  stress: [ex.stress.base, ...ex.stress.cases].map((c) => ({ label: c.label, pass: c.effects.map((e) => !e.missing && !e.tau && !e.insolvent) })),
  supports: ex.supports.options.map((o) => ({ name: o.name, kind: o.kind, runway: o.runway, baseRunway: ex.supports.baseRunway })),
  verification: {
    claims: claimRows,
    experiments: exps.experiments.length,
    // 웹앱 AI 검증 화면의 주장 23건 대조 결과(docs/CPA_FINAL_IDEA.md 5-1). 사람의 최종 판정은 아직 비어 있음
    totals: { claims: runs.runs.reduce((n, r) => n + (r.claims?.length ?? 0), 0), match: 6, error: 7, review: 10 },
  },
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
console.log(`스냅샷 저장: ${OUT}`)
console.log(`  A 하한 도달 ${short[0].tau} · D 최저 ${short[3].minCash} · 버팀 ${snapshot.sensitivity.runwayBase}개월 · 주장 ${snapshot.verification.totals.claims}건`)
console.log('  대표 주장:', claimRows.map((c) => `${c.exp} AI ${c.ai} / 엔진 ${c.engine} → ${c.status}`).join(' | '))
