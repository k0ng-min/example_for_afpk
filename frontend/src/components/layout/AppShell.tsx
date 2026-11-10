import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, LayoutGrid, Search, Settings2, X } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { cn } from '@/utils/format'
import { NAV_ITEMS, STUDIO_ITEM } from './nav'
import { CommandPalette } from './CommandPalette'
import { DemoGuide } from './DemoGuide'
import { useDemo } from '@/features/journey/journey'
import { HelpTip, IconCircle } from '@/components/ui'

function Logo() {
  return (
    <NavLink to="/" className="flex shrink-0 items-center gap-2" aria-label="FINOVA 홈">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8aa0bd" />
            <stop offset="1" stopColor="#3d5c88" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="16" r="8.5" fill="url(#lg)" opacity="0.85" />
        <circle cx="20" cy="16" r="8.5" fill="url(#lg)" opacity="0.55" />
      </svg>
      <span className="font-display text-[19px] font-normal tracking-[-0.01em]">FINOVA</span>
    </NavLink>
  )
}

function avatarLetter(name?: string) {
  if (!name) return '·'
  return name.startsWith('고객 ') ? name[3] : name[0]
}

export function AppShell({ children }: { children: ReactNode }) {
  const topic = useApp((s) => s.topic)
  const health = useApp((s) => s.health)
  const client = useCurrentClient()
  const [menu, setMenu] = useState(false)
  const [cmd, setCmd] = useState(false)
  const loc = useLocation()
  const demoOn = useDemo((d) => d.step != null)

  useEffect(() => {
    document.documentElement.dataset.accent = topic?.config.accent ?? 'blue'
  }, [topic?.config.accent])
  useEffect(() => setMenu(false), [loc.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmd((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-root h-full p-0 sm:p-3 lg:p-5 [@media(max-height:760px)]:lg:p-2.5">
      {/* 레퍼런스처럼 배경 위에 떠 있는 큰 유리 틀 */}
      <div className="app-frame glass flex h-full flex-col overflow-hidden sm:rounded-[28px]">
        <header className="no-print flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 [@media(max-height:760px)]:py-2">
          <IconCircle className="xl:hidden" onClick={() => setMenu(true)} aria-label="메뉴 열기">
            <LayoutGrid className="h-4 w-4" />
          </IconCircle>
          <Logo />
          <nav className="mx-auto hidden items-center gap-0.5 rounded-full bg-white/35 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.7)] xl:flex" aria-label="주요 메뉴">
            {NAV_ITEMS.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => cn('relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors', isActive ? 'text-fg' : 'text-muted hover:text-fg')}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-white shadow-[var(--pill-shadow)]" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                    <span className="relative">{n.ko}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 xl:ml-0">
            <IconCircle onClick={() => setCmd(true)} aria-label="검색·질문 (Ctrl K)" title="검색·질문 (Ctrl K)">
              <Search className="h-4 w-4" />
            </IconCircle>
            <NavLink to="/studio" aria-label="아이디어 설정(관리자)" title="아이디어 설정(관리자)">
              {({ isActive }) => (
                <span className={cn('grid h-9 w-9 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(36,56,86,.14)] transition-colors', isActive ? 'bg-white text-fg' : 'bg-white/40 text-muted hover:bg-white/80')}>
                  <Settings2 className="h-4 w-4" />
                </span>
              )}
            </NavLink>
            <button onClick={() => setCmd(true)} className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 hover:bg-white/50" aria-label="고객 전환">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,#a9bad0,#6d84a6)] text-[13px] font-medium text-white">{avatarLetter(client?.name)}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-[140px] truncate text-[13px] font-medium">{client?.name ?? '고객 없음'}</span>
                <span className="block max-w-[140px] truncate text-[11px] text-dim">{topic?.config.name}</span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-dim sm:block" />
            </button>
          </div>
        </header>
        <main className={cn('min-h-0 flex-1 overflow-y-auto', demoOn && 'pb-44 sm:pb-36', demoOn && loc.pathname === '/' && 'lg:pb-0')}>
          {/* 이전 화면이 사라질 때까지 기다리지 않는다(전환 지연 제거). 새 화면만 짧게 떠오른다 */}
          <motion.div key={loc.pathname + (topic?.version.id ?? '')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className={loc.pathname === '/' ? 'lg:h-full' : 'min-h-full'}>
            {children}
          </motion.div>
          <footer className={cn('no-print px-6 pt-2 pb-6 text-center text-[11px] text-dim lg:px-10', loc.pathname === '/' && 'lg:hidden')}>
            {health?.ai.llmCallsEnabled ? `AI 재무 상담 답변만 Gemini API 호출(${health.ai.model ?? '모델 미상'}) · 분석·검증·캔버스는 규칙 엔진` : 'LLM 미호출 · 모든 분석은 규칙 엔진'} · 모든 수치는 Rust 계산 엔진 결과 · 고객은 합성 데이터입니다
          </footer>
        </main>
      </div>

      {/* 모바일·태블릿 메뉴 */}
      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-40 xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(30,45,70,.25)] backdrop-blur-[3px]" onClick={() => setMenu(false)} />
            <motion.nav initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} className="glass absolute top-3 right-3 left-3 rounded-[24px] p-3 sm:right-auto sm:w-[340px]" aria-label="주요 메뉴">
              <div className="mb-1 flex items-center justify-between px-2 py-1">
                <span className="text-[12px] text-dim">메뉴</span>
                <IconCircle onClick={() => setMenu(false)} aria-label="메뉴 닫기" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </IconCircle>
              </div>
              {[...NAV_ITEMS, STUDIO_ITEM].map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex items-center gap-3 rounded-[16px] px-3 py-2.5', isActive ? 'bg-white/80 shadow-[var(--pill-shadow)]' : 'hover:bg-white/50')}>
                  <n.icon className="h-4 w-4 text-muted" />
                  <span className="text-[14px]">{n.ko}</span>
                  <span className="ml-auto text-[11.5px] text-dim">{n.desc}</span>
                </NavLink>
              ))}
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
      <DemoGuide />
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </div>
  )
}

/** 화면 머리말: 작은 경로 표시 + 얇은 제목 + 짧은 설명 */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  const loc = useLocation()
  const stage = NAV_ITEMS.find((n) => n.to === loc.pathname)?.stage
  return (
    <div className="page-header flex flex-wrap items-end justify-between gap-4 px-5 pt-5 pb-5 sm:px-8 lg:px-10">
      <div className="min-w-0 max-w-3xl">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-dim">
          <span>재무설계</span>
          <span aria-hidden>›</span>
          <span>{eyebrow ?? stage ?? title}</span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="t-page">{title}</h1>
          {subtitle && <HelpTip label={`${title} 화면 설명`}>{subtitle}</HelpTip>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
