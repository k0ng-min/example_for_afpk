// 모든 서버 통신은 Rust API(/api)로만 한다. 프론트엔드는 LLM API를 직접 호출하지 않는다.
import type { z } from 'zod'
import { ApiErrorSchema } from '@/types/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

const ADMIN_KEY = 'finova.adminToken'

export const adminToken = {
  get(): string | null {
    try {
      return sessionStorage.getItem(ADMIN_KEY)
    } catch {
      return null
    }
  },
  set(v: string | null) {
    try {
      if (v) sessionStorage.setItem(ADMIN_KEY, v)
      else sessionStorage.removeItem(ADMIN_KEY)
    } catch {
      /* 저장소 차단 환경 무시 */
    }
  },
}

type Opts = { method?: string; body?: unknown; admin?: boolean; signal?: AbortSignal }

export async function request<S extends z.ZodTypeAny>(path: string, schema: S, opts: Opts = {}): Promise<z.infer<S>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.admin) {
    const t = adminToken.get()
    if (t) headers['x-admin-token'] = t
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK', 'Rust API 서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요 (기본 포트 8080).')
  }
  const text = await res.text()
  const json = text ? safeJson(text) : null
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json)
    if (parsed.success) throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details)
    throw new ApiError(res.status, 'HTTP_' + res.status, `요청이 실패했습니다 (${res.status})`)
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    console.error('API schema mismatch', path, parsed.error.issues)
    throw new ApiError(res.status, 'SCHEMA_MISMATCH', `API 응답 형식이 프론트엔드 타입과 다릅니다: ${path}`, parsed.error.issues)
  }
  return parsed.data
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
      const items = (e.details as { field: string; message: string }[]).slice(0, 4).map((d) => `${d.field}: ${d.message}`)
      return `${e.message} — ${items.join(', ')}`
    }
    return e.message
  }
  return (e as Error)?.message ?? '알 수 없는 오류'
}
