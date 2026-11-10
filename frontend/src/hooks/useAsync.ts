import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '@/services/api/client'

/** 의존값이 바뀌면 다시 요청하는 비동기 훅. delay 가 있으면 디바운스(슬라이더 조작용). */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[], opts: { delay?: number; enabled?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const enabled = opts.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(() => {
      fnRef
        .current(ctrl.signal)
        .then((d) => {
          if (!ctrl.signal.aborted) {
            setData(d)
            setError(null)
          }
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError' && !ctrl.signal.aborted) setError(errorText(e))
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false)
        })
    }, opts.delay ?? 0)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled])

  const reload = useCallback(() => setTick((x) => x + 1), [])
  return { data, error, loading, reload, setData }
}
