// FINOVA Command (⌘K / Ctrl+K): 화면 이동, 고객 전환, AI 상담 질문을 키보드로.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bot, CornerDownLeft, Search, UserRound } from 'lucide-react'
import { useApp } from '@/stores/app'
import { NAV_ITEMS, STUDIO_ITEM } from './nav'
import { cn } from '@/utils/format'

type Item = { id: string; group: string; label: string; hint?: string; icon: React.ComponentType<{ className?: string }>; run: () => void }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { clients, selectClient, topic } = useApp()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      nav(to)
      onClose()
    }
    const list: Item[] = [
      ...[...NAV_ITEMS, STUDIO_ITEM].map((n) => ({ id: 'nav' + n.to, group: '화면 이동', label: n.ko, hint: n.desc, icon: n.icon, run: go(n.to) })),
      ...clients.map((c) => ({
        id: 'client' + c.id,
        group: '고객 전환',
        label: c.name,
        hint: c.id === topic?.config.primaryClientId ? '주제 대표 사례' : `${c.age}세 ${c.occupation}`,
        icon: UserRound,
        run: () => {
          selectClient(c.id)
          onClose()
        },
      })),
    ]
    const query = q.trim().toLowerCase()
    const filtered = query ? list.filter((i) => (i.label + ' ' + (i.hint ?? '')).toLowerCase().includes(query)) : list
    if (query) filtered.push({ id: 'ask', group: 'AI 재무 상담', label: `“${q.trim()}” 질문하기`, hint: 'AI 재무 상담에서 답변', icon: Bot, run: go(`/copilot?q=${encodeURIComponent(q.trim())}`) })
    return filtered
  }, [q, clients, topic, nav, onClose, selectClient])

  useEffect(() => setIdx(0), [q])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[idx]?.run()
    } else if (e.key === 'Escape') onClose()
  }

  let lastGroup = ''
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <div className="absolute inset-0 bg-[rgba(30,45,70,.22)] backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="명령 팔레트"
            initial={{ y: -8, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -6, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 420 }}
            className="glass relative w-full max-w-[560px] overflow-hidden rounded-[24px] bg-white/75"
          >
            {/* 포커스 표시: 네모 테두리 대신 돋보기 아이콘 색과 아래쪽 은은한 강조선으로 */}
            <div className="group relative flex items-center gap-3 px-4">
              <Search className="h-4 w-4 text-dim transition-colors group-focus-within:text-accent" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="화면, 고객을 찾거나 AI에게 질문하세요"
                aria-label="명령 검색"
                className="h-13 flex-1 bg-transparent text-[15px] caret-[var(--accent)] outline-none placeholder:text-dim focus-visible:outline-none"
              />
              <kbd className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-dim">Esc</kbd>
              <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-0 h-[2px] rounded-full bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] opacity-0 transition-opacity duration-300 group-focus-within:opacity-60" />
            </div>
            <div className="h-px bg-[var(--hair)]" />
            <ul className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
              {items.map((it, i) => {
                const head = it.group !== lastGroup ? it.group : null
                lastGroup = it.group
                return (
                  <li key={it.id}>
                    {head && <div className="px-3 pt-2.5 pb-1 text-[11.5px] text-dim">{head}</div>}
                    <button
                      role="option"
                      aria-selected={i === idx}
                      onMouseEnter={() => setIdx(i)}
                      onClick={it.run}
                      className={cn('flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[13.5px]', i === idx ? 'bg-white text-fg shadow-[var(--pill-shadow)]' : 'text-muted')}
                    >
                      <it.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{it.label}</span>
                      {it.hint && <span className="ml-auto truncate text-[11.5px] text-dim">{it.hint}</span>}
                      {i === idx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-dim" />}
                    </button>
                  </li>
                )
              })}
              {items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-dim">일치하는 항목이 없습니다</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
