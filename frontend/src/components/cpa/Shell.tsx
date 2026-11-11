import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Menu, RotateCcw, X } from 'lucide-react'
import { cn } from '@/utils/format'
import { useAnalysisSync, useCpa } from '@/features/cpa/store'
import { ROUTE_STEPS, STEPS, type Step } from '@/features/cpa/process'
import { Btn, Prov } from './ui'

export const CPA_NAV = [
  { to: '/', label: '홈' },
  { to: '/client', label: '고객 정보' },
  { to: '/canvas', label: 'AI 분석' },
  { to: '/copilot', label: 'AI 상담' },
  { to: '/simulator', label: '시뮬레이션' },
  { to: '/verification', label: 'AI 검증' },
  { to: '/plan', label: '실행 계획' },
  { to: '/report', label: '보고서' },
]

function ProcessRail({ onOpen }: { onOpen: (s: Step) => void }) {
  const loc = useLocation()
  const active = ROUTE_STEPS[loc.pathname] ?? []
  return (
    <div className="border-t border-rule/70">
      <div className="mx-auto flex max-w-[1280px] items-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
        <span className="mr-1 shrink-0 text-[11.5px] text-ink-3">재무설계 6단계</span>
        {STEPS.map((s) => {
          const on = active.includes(s.n)
          return (
            <button key={s.n} onClick={() => onOpen(s)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors', on ? 'bg-sky-soft font-semibold text-sky' : 'text-ink-2 hover:bg-white hover:text-ink')}>
              <span className={cn('grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold', on ? 'bg-sky text-white' : 'bg-paper-2 text-ink-2')}>{s.n}</span>
              {s.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function StepDetail({ step, onNavigate, compact }: { step: Step; onNavigate?: () => void; compact?: boolean }) {
  const a = useCpa((s) => s.analysis)
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-soft text-[13px] font-semibold text-sky">{step.n}</span>
        <h3 className="text-[16px] font-semibold text-navy">{step.title}</h3>
        <span className="rounded-full border border-rule bg-white px-2 py-[1px] text-[11px] text-ink-2">{step.tag}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.scope}</p>
      <dl className={cn('mt-3 grid gap-2 text-[13px]', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        {[
          ['고객 정보', step.data],
          ['AI에게 맡기는 일', step.ai],
          ['사람이 책임지는 일', step.human],
          ['남기는 기록', step.record],
        ].map(([k, v]) => (
          <div key={k} className="card-soft px-3 py-2">
            <dt className="text-[11.5px] text-ink-3">{k}</dt>
            <dd className="mt-0.5 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-white px-3 py-2 text-[13px]">
        <Prov kind="engine" />
        <span className="text-ink">{a ? step.live(a) : '계산 중…'}</span>
      </div>
      {onNavigate && (
        <Link to={step.path} onClick={onNavigate} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-sky hover:underline">
          {step.pathLabel}에서 확인 <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

export function CpaShell({ children }: { children: ReactNode }) {
  useAnalysisSync()
  const loc = useLocation()
  const [step, setStep] = useState<Step | null>(null)
  const [menu, setMenu] = useState(false)
  const { error, inputs, defaults, reset } = useCpa()
  const changed = inputs && defaults && JSON.stringify(inputs) !== JSON.stringify(defaults)
  useEffect(() => {
    setMenu(false)
    setStep(null)
  }, [loc.pathname])
  useEffect(() => {
    const t = CPA_NAV.find((n) => n.to === loc.pathname)?.label
    document.title = t && loc.pathname !== '/' ? `${t} · 합격해도 끝나지 않는다` : '합격해도 끝나지 않는다 — CPA 유예생 소득 공백 재무설계'
  }, [loc.pathname])

  return (
    <div className="cpa">
      <header className="cpa-chrome glass-bar sticky top-0 z-30 border-b border-rule/70">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="홈으로">
            <span className="flex flex-col gap-[3px]" aria-hidden>
              <span className="block h-[3px] w-6 rounded-full bg-sky" />
              <span className="block h-[3px] w-4 rounded-full bg-ink-3" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[14px] font-semibold tracking-[-0.02em] text-navy">합격해도 끝나지 않는다</span>
              <span className="hidden text-[10.5px] text-ink-3 sm:block">FINOVA · AI 재무설계</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-0.5 rounded-full border border-rule/80 bg-white/60 p-1 xl:flex" aria-label="주요 화면">
            {CPA_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => cn('rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors', isActive ? 'bg-[#111113] font-semibold text-white shadow-[0_4px_12px_-6px_rgba(0,0,0,.5)]' : 'text-ink-2 hover:text-ink')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          {changed && (
            <button onClick={reset} title="기본 가상 고객 값으로 되돌리기" className="hidden shrink-0 items-center gap-1 rounded-full border border-caution/30 bg-caution-soft px-2.5 py-1 text-[11.5px] text-caution sm:flex">
              <RotateCcw className="h-3.5 w-3.5" /> 가정 변경됨 · 초기화
            </button>
          )}
          <button aria-label="메뉴" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-rule bg-white/70 sm:ml-0 xl:hidden">
            {menu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        {menu && (
          <nav className="grid grid-cols-2 gap-1 border-t border-rule bg-white/90 px-4 py-2 sm:grid-cols-4 xl:hidden" aria-label="주요 화면">
            {CPA_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => cn('block rounded-lg px-3 py-2.5 text-[14px]', isActive ? 'bg-sky-soft font-semibold text-sky' : 'text-ink')}>
                {n.label}
              </NavLink>
            ))}
            {changed && (
              <button onClick={reset} className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-left text-[13px] text-caution">
                <RotateCcw className="h-3.5 w-3.5" /> 가정 초기화
              </button>
            )}
          </nav>
        )}
        <ProcessRail onOpen={setStep} />
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-[1280px] px-4 sm:px-6" role="alert">
          <div className="rounded-xl border border-caution/30 bg-caution-soft px-4 py-3 text-[13.5px] text-ink">
            <b className="text-caution">계산 서버에 연결하지 못했습니다.</b> {error}
            <div className="mt-1 text-[12.5px] text-ink-2">backend 폴더에서 Rust 서버를 실행한 뒤 새로고침하세요(Windows: scripts\development\cargo-msvc.cmd run).</div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.main key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className={cn('mx-auto max-w-[1280px] px-4 sm:px-6', loc.pathname === '/' ? 'pt-3 pb-3' : 'pt-6 pb-16 sm:pt-8')}>
          {children}
        </motion.main>
      </AnimatePresence>

      <footer className={cn('cpa-chrome border-t border-rule/70 bg-white/40', loc.pathname === '/' && 'lg:hidden')}>
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-6 text-[12px] text-ink-3 sm:flex-row sm:items-center sm:px-6">
          <span>AFPK 영 플래너 챌린지 2026 · 가상 고객(합성 데이터) 사례 · 투자·직업 권유가 아닌 재무설계 시뮬레이션</span>
          <span className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <Prov kind="official" />
            <Prov kind="assumed" />
            <Prov kind="validate" />
            <Prov kind="engine" />
            <Prov kind="ai" />
          </span>
        </div>
      </footer>

      <AnimatePresence>
        {step && (
          <motion.div className="cpa-chrome fixed inset-0 z-50 flex items-end justify-center bg-[#111113]/20 p-3 backdrop-blur-[2px] sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setStep(null)}>
            <motion.div role="dialog" aria-modal aria-label={`${step.n}단계 ${step.title}`} initial={{ y: 16 }} animate={{ y: 0 }} exit={{ y: 16 }} className="w-full max-w-[560px] rounded-2xl border border-rule bg-white p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,.45)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex justify-end">
                <button aria-label="닫기" onClick={() => setStep(null)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-paper-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <StepDetail step={step} onNavigate={() => setStep(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function PageTitle({ eyebrow, title, lead, right }: { eyebrow: string; title: ReactNode; lead?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[780px]">
        <div className="eyebrow mb-1.5">{eyebrow}</div>
        <h1 className="t-h1">{title}</h1>
        {lead && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{lead}</p>}
      </div>
      {right}
    </div>
  )
}

export { Btn }
