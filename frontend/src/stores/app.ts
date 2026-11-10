import { create } from 'zustand'
import { api } from '@/services/api/endpoints'
import { errorText } from '@/services/api/client'
import type { ActiveTopic, Client, Health } from '@/types/api'

type Theme = 'dark' | 'light'

const pref = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* 무시 */
    }
  },
}

type AppState = {
  ready: boolean
  bootError: string | null
  health: Health | null
  topic: ActiveTopic | null
  clients: Client[]
  clientId: string | null
  theme: Theme
  /** 고객 데이터 변경 시 증가 → 의존 화면 재조회 */
  revision: number
  boot: () => Promise<void>
  reloadTopic: () => Promise<void>
  reloadClients: () => Promise<void>
  selectClient: (id: string) => void
  replaceClient: (c: Client) => void
  setTheme: (t: Theme) => void
  bump: () => void
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,
  health: null,
  topic: null,
  clients: [],
  clientId: pref.get('finova.clientId'),
  theme: (pref.get('finova.theme') as Theme) || 'dark',
  revision: 0,

  boot: async () => {
    try {
      const [health, topic, clients] = await Promise.all([api.health(), api.activeTopic(), api.clients()])
      const stored = get().clientId
      const clientId = clients.some((c) => c.id === stored) ? stored : (clients.find((c) => c.id === topic.config.primaryClientId)?.id ?? clients[0]?.id ?? null)
      set({ health, topic, clients, clientId, ready: true, bootError: null })
    } catch (e) {
      set({ bootError: errorText(e), ready: false })
    }
  },
  reloadTopic: async () => {
    const [topic, clients, health] = await Promise.all([api.activeTopic(), api.clients(), api.health()])
    // 주제 전환 시 대표 고객으로 이동(고객 데이터는 유지)
    const primary = clients.find((c) => c.id === topic.config.primaryClientId)
    set({ topic, clients, health, clientId: primary?.id ?? get().clientId, revision: get().revision + 1 })
    if (primary) pref.set('finova.clientId', primary.id)
  },
  reloadClients: async () => {
    const clients = await api.clients()
    const id = get().clientId
    set({ clients, clientId: clients.some((c) => c.id === id) ? id : (clients[0]?.id ?? null), revision: get().revision + 1 })
  },
  selectClient: (id) => {
    pref.set('finova.clientId', id)
    set({ clientId: id })
  },
  replaceClient: (c) => set({ clients: get().clients.map((x) => (x.id === c.id ? c : x)), revision: get().revision + 1 }),
  setTheme: (t) => {
    pref.set('finova.theme', t)
    set({ theme: t })
  },
  bump: () => set({ revision: get().revision + 1 }),
}))

export function useCurrentClient(): Client | null {
  return useApp((s) => s.clients.find((c) => c.id === s.clientId) ?? null)
}
