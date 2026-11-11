// 고객 가정값·AI 실험 기록은 브라우저 저장소(이 기기)에만 둔다. 계산은 매번 Rust API 로.
import { useEffect } from 'react'
import { create } from 'zustand'
import { z } from 'zod'
import { request, errorText } from '@/services/api/client'
import { AnalysisSchema, ExperimentsSchema, RunSchema, type Analysis, type CpaInputs, type ExperimentsDoc, type IclResult, type RunResult, type Strategy, type Explore, type Checkin, type CheckinEntry } from './types'

const InputsSchema = z.object({ cash0: z.number() }).passthrough()

export const cpaApi = {
  defaults: () => request('/cpa/defaults', InputsSchema) as Promise<CpaInputs>,
  analyze: (i: CpaInputs, signal?: AbortSignal) => request('/cpa/analyze', AnalysisSchema, { method: 'POST', body: i, signal }) as Promise<Analysis>,
  experiments: () => request('/cpa/experiments', ExperimentsSchema) as Promise<ExperimentsDoc>,
  run: (experimentId: string, prompt?: string) => request('/cpa/ai/run', RunSchema, { method: 'POST', body: { experimentId, prompt } }),
  icl: (b: { grossAnnual: number; incomeYear: number; rateBps: number }) => request('/cpa/icl', z.object({ annualObligation: z.number() }).passthrough(), { method: 'POST', body: b }) as Promise<IclResult>,
  explore: (i: CpaInputs, signal?: AbortSignal) => request('/cpa/explore', z.object({ sensitivity: z.object({ rows: z.array(z.unknown()) }).passthrough(), supports: z.object({ options: z.array(z.unknown()) }).passthrough(), stress: z.object({ cases: z.array(z.unknown()) }).passthrough(), fans: z.array(z.unknown()) }).passthrough(), { method: 'POST', body: i, signal }) as unknown as Promise<Explore>,
  checkin: (inputs: CpaInputs, strategy: Strategy, entries: CheckinEntry[]) => request('/cpa/checkin', z.object({ rows: z.array(z.unknown()) }).passthrough(), { method: 'POST', body: { inputs, strategy, entries } }) as unknown as Promise<Checkin>,
  screen: (experimentId: string, output: string) => request('/cpa/ai/screen', z.object({ flags: z.array(z.string()) }), { method: 'POST', body: { experimentId, output } }),
}

const KEY = 'cpa.inputs.v2'
const LOG_KEY = 'cpa.ailog.v1'

function load<T>(k: string): T | null {
  try {
    const t = localStorage.getItem(k)
    return t ? (JSON.parse(t) as T) : null
  } catch {
    return null
  }
}
function save(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* 저장소 차단 환경 무시 */
  }
}

type State = {
  defaults: CpaInputs | null
  inputs: CpaInputs | null
  analysis: Analysis | null
  loading: boolean
  error: string | null
  focus: Strategy | null
  init: () => Promise<void>
  set: (patch: Partial<CpaInputs>) => void
  reset: () => void
  setFocus: (s: Strategy | null) => void
  setAnalysis: (a: Analysis | null, error?: string | null) => void
  setLoading: (v: boolean) => void
}

export const useCpa = create<State>((set, get) => ({
  defaults: null,
  inputs: null,
  analysis: null,
  loading: false,
  error: null,
  focus: null,
  init: async () => {
    if (get().defaults) return
    try {
      const d = await cpaApi.defaults()
      const stored = load<Partial<CpaInputs>>(KEY)
      // 저장된 값은 현재 스키마에 있는 키만 받아들인다
      const merged = { ...d }
      if (stored) for (const k of Object.keys(d) as (keyof CpaInputs)[]) if (k in stored) (merged as Record<string, unknown>)[k] = stored[k]
      set({ defaults: d, inputs: merged, error: null })
    } catch (e) {
      set({ error: errorText(e) })
    }
  },
  set: (patch) => {
    const cur = get().inputs
    if (!cur) return
    const next = { ...cur, ...patch }
    save(KEY, next)
    set({ inputs: next })
  },
  reset: () => {
    const d = get().defaults
    if (!d) return
    save(KEY, null)
    set({ inputs: { ...d } })
  },
  setFocus: (s) => set({ focus: s }),
  setAnalysis: (a, error = null) => set({ analysis: a ?? get().analysis, error, loading: false }),
  setLoading: (v) => set({ loading: v }),
}))

/** 입력이 바뀌면 짧게 기다렸다가 다시 계산(이전 요청은 취소) */
export function useAnalysisSync() {
  const inputs = useCpa((s) => s.inputs)
  const init = useCpa((s) => s.init)
  useEffect(() => {
    void init()
  }, [init])
  useEffect(() => {
    if (!inputs) return
    const ctl = new AbortController()
    const t = window.setTimeout(() => {
      useCpa.getState().setLoading(true)
      cpaApi
        .analyze(inputs, ctl.signal)
        .then((a) => useCpa.getState().setAnalysis(a))
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') useCpa.getState().setAnalysis(null, errorText(e))
        })
    }, 120)
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [inputs])
}

/** 기본값과 다른 입력 키 */
export function changedKeys(i: CpaInputs | null, d: CpaInputs | null): (keyof CpaInputs)[] {
  if (!i || !d) return []
  return (Object.keys(d) as (keyof CpaInputs)[]).filter((k) => i[k] !== d[k])
}

// ── AI 실험 기록 ──
export type Verdict = 'unset' | 'match' | 'review' | 'insufficient' | 'error' | 'fixed'
export type RunLog = RunResult & { source: 'server' | 'manual'; tool: string; id: string }
export type ExpLog = { runs: RunLog[]; verdict: Verdict; reason: string; correction: string; reviewer: string; reviewedAt: string | null }
export const emptyLog = (): ExpLog => ({ runs: [], verdict: 'unset', reason: '', correction: '', reviewer: '', reviewedAt: null })

type LogState = {
  logs: Record<string, ExpLog>
  addRun: (exp: string, r: RunLog) => void
  removeRun: (exp: string, id: string) => void
  review: (exp: string, patch: Partial<Pick<ExpLog, 'verdict' | 'reason' | 'correction' | 'reviewer'>>) => void
  clear: () => void
}

export const useAiLog = create<LogState>((set, get) => ({
  logs: load<Record<string, ExpLog>>(LOG_KEY) ?? {},
  addRun: (exp, r) => {
    const cur = get().logs[exp] ?? emptyLog()
    const logs = { ...get().logs, [exp]: { ...cur, runs: [r, ...cur.runs].slice(0, 12) } }
    save(LOG_KEY, logs)
    set({ logs })
  },
  removeRun: (exp, id) => {
    const cur = get().logs[exp] ?? emptyLog()
    const logs = { ...get().logs, [exp]: { ...cur, runs: cur.runs.filter((r) => r.id !== id) } }
    save(LOG_KEY, logs)
    set({ logs })
  },
  review: (exp, patch) => {
    const cur = get().logs[exp] ?? emptyLog()
    const logs = { ...get().logs, [exp]: { ...cur, ...patch, reviewedAt: new Date().toISOString() } }
    save(LOG_KEY, logs)
    set({ logs })
  },
  clear: () => {
    save(LOG_KEY, null)
    set({ logs: {} })
  },
}))

/** 검증 상태(공통): 계산 일치는 독립 계산·신뢰할 근거와 연결될 때만 */
export type ExpStatus = 'notRun' | 'match' | 'review' | 'insufficient' | 'error' | 'fixed'
export const STATUS_META: Record<ExpStatus, { label: string; cls: string; help: string }> = {
  notRun: { label: '아직 실행하지 않음', cls: 'bg-paper-2 text-ink-3', help: '기록된 AI 원출력이 없습니다.' },
  match: { label: '계산 일치', cls: 'bg-good-soft text-good', help: 'AI 주장이 엔진의 독립 계산값과 허용 오차 안에서 일치합니다.' },
  review: { label: '검토 필요', cls: 'bg-caution-soft text-caution', help: '계산으로 판정할 수 없거나 사람의 확인이 남아 있습니다.' },
  insufficient: { label: '근거 부족', cls: 'bg-[#eef1f5] text-ink-2', help: '공식 자료·계산으로 뒷받침되지 않는 가정입니다.' },
  error: { label: '오류 발견', cls: 'bg-alert-soft text-alert', help: '엔진 계산 또는 공식 자료와 어긋나 권고를 바꿔야 합니다.' },
  fixed: { label: '수정 완료', cls: 'bg-sky-soft text-sky', help: '오류를 반영해 고객 권고를 고쳐 기록했습니다.' },
}
/** 이전 저장값 호환 */
export function normalizeVerdict(v: string): Verdict {
  if (v === 'verified') return 'match'
  if (v === 'partial' || v === 'needs') return 'review'
  return (['unset', 'match', 'review', 'insufficient', 'error', 'fixed'].includes(v) ? v : 'unset') as Verdict
}
