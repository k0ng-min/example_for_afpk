// 3분 데모 안내 막대: 데모를 시작하면 화면 아래에 현재 단계·볼 것·다음 이동을 보여준다.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react'
import { JOURNEY, useDemo } from '@/features/journey/journey'
import { Button } from '@/components/ui'
import { cn } from '@/utils/format'

export function DemoGuide() {
  const { step, go, stop } = useDemo()
  const nav = useNavigate()
  const loc = useLocation()
  const [folded, setFolded] = useState(false)
  useEffect(() => setFolded(false), [step])
  if (step == null) return null
  const cur = JOURNEY[step]
  const here = loc.pathname === cur.path
  const elapsed = JOURNEY.slice(0, step).reduce((a, j) => a + j.seconds, 0)
  const move = (i: number) => {
    go(i)
    nav(JOURNEY[Math.max(0, Math.min(JOURNEY.length - 1, i))].path)
  }
  return (
    <AnimatePresence>
      <motion.div
        key="demo"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        className="no-print fixed right-3 bottom-3 left-3 z-30 sm:left-1/2 sm:w-[min(680px,calc(100%-48px))] sm:-translate-x-1/2"
        role="region"
        aria-label="3분 데모 안내"
      >
        <div className="glass rounded-[22px] bg-white/85 px-4 py-3 shadow-[0_24px_50px_-24px_rgba(36,56,86,.55)]">
          <div className="flex items-center gap-2">
            <span className="num rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">데모 {step + 1}/{JOURNEY.length}</span>
            <span className="truncate text-[13.5px] font-medium">{cur.label}</span>
            <span className="hidden text-[11.5px] text-dim sm:inline">{cur.stage} · 약 {cur.seconds}초 · 누적 {Math.round(elapsed / 6) / 10}분</span>
            <div className="ml-auto flex items-center gap-0.5">
              <button className="grid h-7 w-7 place-items-center rounded-full text-dim hover:bg-white hover:text-fg" onClick={() => setFolded((v) => !v)} aria-label={folded ? '안내 펼치기' : '안내 접기'} aria-expanded={!folded}>
                <ChevronUp className={cn('h-4 w-4 transition-transform', folded && 'rotate-180')} />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-full text-dim hover:bg-white hover:text-fg" onClick={stop} aria-label="데모 종료">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {!folded && (
            <>
              <ol className="mt-2 flex gap-1" aria-label="데모 단계">
                {JOURNEY.map((j, i) => (
                  <li key={j.key} className="flex-1">
                    <button onClick={() => move(i)} className="block w-full" aria-label={`${i + 1}단계 ${j.label}로 이동`} aria-current={i === step ? 'step' : undefined}>
                      <span className={cn('block h-1 rounded-full', i < step ? 'bg-accent' : i === step ? 'bg-accent/60' : 'bg-[var(--hair-strong)]')} />
                      <span className={cn('mt-1 hidden truncate text-[10.5px] sm:block', i === step ? 'text-fg' : 'text-dim')}>{j.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{cur.look}</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                {!here && (
                  <Button size="sm" variant="secondary" onClick={() => nav(cur.path)} className="mr-auto">
                    이 단계 화면으로 이동
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => move(step - 1)} disabled={step === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" /> 이전
                </Button>
                {step < JOURNEY.length - 1 ? (
                  <Button size="sm" variant="primary" onClick={() => move(step + 1)}>
                    다음 · {JOURNEY[step + 1].label} <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={stop}>
                    데모 마치기
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
