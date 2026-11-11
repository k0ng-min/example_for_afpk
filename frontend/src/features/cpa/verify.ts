// AI 실험 기록(서버 파일·이 브라우저)과 주장별 독립 계산 대조. 계산값은 Rust 엔진 응답에서만 가져온다.
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { request } from '@/services/api/client'
import { cpaApi, normalizeVerdict, useAiLog, type ExpLog, type ExpStatus, type RunLog } from './store'
import { PDF_BASELINE, man, ym } from './meta'
import type { Analysis, CpaInputs, Strategy } from './types'

export type Claim = {
  id: string
  text: string
  kind: 'cash' | 'drawdown' | 'safe' | 'assumption'
  strategy?: Strategy
  month?: string
  aiValue?: number | boolean
  tolerance?: number
  sources?: string[]
  note?: string
  patch?: Partial<CpaInputs>
}

export type ServerRun = RunLog & { claims: Claim[]; aiReview?: { author: string; suggested: string; note: string; disclaimer: string } }

const RunsSchema = z.object({ note: z.string().optional(), runs: z.array(z.object({ id: z.string(), experimentId: z.string(), output: z.string() }).passthrough()) }).passthrough()

export type ClaimResult = { status: ExpStatus; engine: string; ai: string; diff?: string }

/** 주장 하나를 엔진 결과와 대조 */
export function evalClaim(c: Claim, a: Analysis | undefined): ClaimResult {
  const ai = typeof c.aiValue === 'boolean' ? (c.aiValue ? '유지된다' : '깨진다') : c.aiValue != null ? man(c.aiValue) : '—'
  if (c.kind === 'assumption') return { status: c.sources?.length ? 'review' : 'insufficient', engine: c.sources?.length ? `공식 자료 대조 필요 ${c.sources.map((x) => `[${x}]`).join(' ')}` : '대조할 공식 근거·계산 없음', ai: '—' }
  if (!a) return { status: 'review', engine: '계산 중…', ai }
  const p = a.short.find((x) => x.strategy === c.strategy)
  if (!p) return { status: 'review', engine: '—', ai }
  if (c.kind === 'safe') {
    const ok = p.tau == null && p.insolvent == null
    return { status: ok === c.aiValue ? 'match' : 'error', engine: ok ? '18개월 안전자금 유지' : `${ym(p.tau)} 안전자금 위반`, ai }
  }
  const row = p.months.find((m) => m.month === c.month)
  if (!row) return { status: 'review', engine: '해당 월 없음', ai }
  const engineVal = c.kind === 'cash' ? row.cash : a.inputs.cash0 - row.cash
  const d = (c.aiValue as number) - engineVal
  return { status: Math.abs(d) <= (c.tolerance ?? 0) ? 'match' : 'error', engine: man(engineVal), ai, diff: d === 0 ? '0' : `${d > 0 ? '+' : '−'}${man(Math.abs(d))}` }
}

/** 기록의 계산 상태(사람 판정 전) */
export function computedStatus(results: ClaimResult[]): ExpStatus {
  if (results.length === 0) return 'review'
  if (results.some((r) => r.status === 'error')) return 'error'
  if (results.some((r) => r.status === 'review' || r.status === 'insufficient')) return 'review'
  return 'match'
}

/** 최종 상태: 사람 판정 > 계산 상태 > 실행 여부 */
export function finalStatus(log: ExpLog | undefined, runs: ServerRun[], computed: ExpStatus | null): ExpStatus {
  const v = log ? normalizeVerdict(log.verdict) : 'unset'
  const hasRun = runs.length > 0 || (log?.runs.length ?? 0) > 0
  if (!hasRun) return 'notRun'
  if (v !== 'unset') return v
  return computed ?? 'review'
}

/** 서버 기록 + 기본값 분석 + 주장에 딸린 가정 변경 분석 */
export function useVerificationData() {
  const [runs, setRuns] = useState<ServerRun[] | null>(null)
  const [note, setNote] = useState('')
  const [base, setBase] = useState<Analysis | null>(null)
  const [patched, setPatched] = useState<Record<string, Analysis>>({})
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    request('/cpa/runs', RunsSchema)
      .then((d) => {
        setRuns(d.runs as unknown as ServerRun[])
        setNote(d.note ?? '')
      })
      .catch((e) => setErr(String(e?.message ?? e)))
    cpaApi.defaults().then((d) => cpaApi.analyze({ ...d, ...PDF_BASELINE }).then(setBase)).catch(() => undefined)
  }, [])
  const patches = useMemo(() => {
    const m = new Map<string, Partial<CpaInputs>>()
    for (const r of runs ?? []) for (const c of r.claims ?? []) if (c.patch) m.set(JSON.stringify(c.patch), c.patch)
    return m
  }, [runs])
  useEffect(() => {
    if (!patches.size) return
    cpaApi.defaults().then((d) => {
      for (const [k, p] of patches) cpaApi.analyze({ ...d, ...PDF_BASELINE, ...p }).then((a) => setPatched((x) => ({ ...x, [k]: a }))).catch(() => undefined)
    })
  }, [patches])
  const analysisFor = (c: Claim) => (c.patch ? patched[JSON.stringify(c.patch)] : (base ?? undefined))
  return { runs, note, base, err, analysisFor }
}

/** 실험별 요약 상태(화면 공통) */
export function useExperimentStatuses(ids: string[]) {
  const { runs, analysisFor, base, note, err } = useVerificationData()
  const logs = useAiLog((s) => s.logs)
  const byExp = (() => {
    const out: Record<string, { status: ExpStatus; computed: ExpStatus | null; runs: ServerRun[] }> = {}
    for (const id of ids) {
      const rs = (runs ?? []).filter((r) => r.experimentId === id)
      const results = rs.flatMap((r) => (r.claims ?? []).map((c) => evalClaim(c, analysisFor(c))))
      const computed = rs.length ? computedStatus(results) : null
      out[id] = { status: finalStatus(logs[id], rs, computed), computed, runs: rs }
    }
    return out
  })()
  return { byExp, runs, analysisFor, base, note, err }
}
