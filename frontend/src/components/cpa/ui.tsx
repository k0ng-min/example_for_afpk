// 최종 제출 사이트 공통 UI(따뜻한 화이트·네이비·차분한 블루). 계산은 하지 않는다.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, CircleHelp, Loader2, Sigma } from 'lucide-react'
import { cn } from '@/utils/format'
import { PROV_META, STRATEGY_META, man, type Prov } from '@/features/cpa/meta'
import type { Strategy } from '@/features/cpa/types'

export function Prov({ kind, className }: { kind: Prov; className?: string }) {
  const m = PROV_META[kind]
  return (
    <span title={m.help} className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-[1px] text-[10.5px] font-semibold leading-[18px] whitespace-nowrap', m.cls, className)}>
      {m.label}
    </span>
  )
}

/** 물음표 도움말: 클릭·키보드로 열고 바깥 클릭·Esc 로 닫는다 */
export function Help({ children, label = '설명 보기', align = 'left', className }: { children: ReactNode; label?: string; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className={cn('grid h-5 w-5 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink', open && 'bg-paper-2 text-ink')}>
        <CircleHelp className="h-[14px] w-[14px]" />
      </button>
      {open && (
        <span id={id} role="tooltip" className={cn('absolute top-7 z-50 w-[min(300px,80vw)] rounded-xl border border-rule bg-card px-3.5 py-3 text-left text-[12.5px] leading-relaxed font-normal text-ink-2 shadow-[0_16px_40px_-18px_rgba(0,0,0,.35)]', align === 'right' ? 'right-0' : 'left-0')}>
          {children}
        </span>
      )}
    </span>
  )
}

export function SectionHead({ no, eyebrow, title, help, right, className }: { no?: string; eyebrow?: string; title: ReactNode; help?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        {(no || eyebrow) && (
          <div className="eyebrow mb-1.5">
            {no && <span>{no} / </span>}
            {eyebrow}
          </div>
        )}
        <h2 className="t-h2 flex items-center gap-1.5">
          {title}
          {help && <Help>{help}</Help>}
        </h2>
      </div>
      {right}
    </div>
  )
}

export function Stat({ label, value, sub, tone, prov, className, big }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'caution' | 'alert'; prov?: Prov; className?: string; big?: boolean }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
        {label}
        {prov && <Prov kind={prov} />}
      </div>
      <div className={cn('t-num mt-1 font-light text-navy', big ? 'text-[34px] leading-tight' : 'text-[24px] leading-tight', tone === 'good' && 'text-good', tone === 'caution' && 'text-caution', tone === 'alert' && 'text-alert')}>{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-ink-2">{sub}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items, className, fill }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; className?: string; fill?: boolean }) {
  return (
    <div role="tablist" style={fill ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined} className={cn(fill ? 'grid w-full gap-1 rounded-2xl border border-rule bg-white/70 p-1 sm:inline-flex sm:w-auto sm:rounded-full' : 'inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-rule bg-white/70 p-1', className)}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)} className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition-colors', fill ? 'rounded-xl leading-tight sm:rounded-full sm:whitespace-nowrap' : 'whitespace-nowrap', value === it.id ? 'bg-white font-semibold text-sky shadow-[0_1px_2px_rgba(0,0,0,.08),0_4px_12px_-6px_rgba(0,0,0,.25)]' : 'text-ink-2 hover:bg-white/70 hover:text-ink')}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Btn({ variant = 'line', className, loading, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'line' | 'ghost' | 'sky'; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap transition-[background,color,transform] active:scale-[.98] disabled:pointer-events-none disabled:opacity-45',
        variant === 'solid' && 'btn-primary',
        variant === 'sky' && 'bg-sky text-white hover:bg-sky-2',
        variant === 'line' && 'border border-rule-strong bg-white/80 text-ink hover:border-sky-2 hover:text-sky',
        variant === 'ghost' && 'text-ink-2 hover:bg-paper-2 hover:text-ink',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function StrategyDot({ s, dashed }: { s: Strategy; dashed?: boolean }) {
  const c = STRATEGY_META[s].color
  return dashed || s === 'D' ? (
    <svg width="18" height="8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="17" y2="4" stroke={c} strokeWidth="2.5" strokeDasharray="4 3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="18" height="8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="17" y2="4" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function StrategyBadge({ s, className }: { s: Strategy; className?: string }) {
  return (
    <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-bold text-white', className)} style={{ background: STRATEGY_META[s].color }}>
      {s}
    </span>
  )
}

/** 결과 아래에 붙는 "그래서 고객은 무엇을 하는가" 해석 */
export function Interpretation({ children, title = '고객 관점 해석', className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <div className={cn('note px-4 py-3', className)}>
      <div className="mb-1 text-[12px] font-semibold text-sky">{title}</div>
      <div className="text-[13.5px] leading-relaxed text-ink">{children}</div>
    </div>
  )
}

/** 계산식·가정 펼침 */
export function Formula({ title = '계산식과 가정', children, className }: { title?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('rounded-xl border border-rule bg-card', className)}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-ink-2 hover:text-ink">
        <Sigma className="h-4 w-4 text-sky" />
        <span className="font-medium">{title}</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-rule px-4 py-3 text-[13px] leading-relaxed text-ink-2">{children}</div>}
    </div>
  )
}

export function Callout({ tone = 'navy', title, children, className }: { tone?: 'navy' | 'alert' | 'caution' | 'good'; title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl px-5 py-4',
        tone === 'navy' && 'border border-sky/20 bg-sky-soft text-ink',
        tone === 'alert' && 'border border-alert/30 bg-alert-soft text-ink',
        tone === 'caution' && 'border border-caution/30 bg-caution-soft text-ink',
        tone === 'good' && 'border border-good/30 bg-good-soft text-ink',
        className,
      )}
    >
      {title && <div className={cn('mb-1 text-[12px] font-semibold', tone === 'navy' ? 'text-sky' : tone === 'alert' ? 'text-alert' : tone === 'caution' ? 'text-caution' : 'text-good')}>{title}</div>}
      <div className="text-[14px] leading-relaxed">{children}</div>
    </div>
  )
}

/** 원 단위 값을 만 원 단위로 입력 */
export function WonInput({ value, onChange, id, optional, disabled, className }: { value: number | null; onChange: (v: number | null) => void; id?: string; optional?: boolean; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(value == null ? '' : String(Math.round(value / 10_000)))
  useEffect(() => {
    setText(value == null ? '' : String(Math.round(value / 10_000)))
  }, [value])
  const commit = (t: string) => {
    const s = t.replace(/[^\d]/g, '')
    if (s === '') {
      if (optional) onChange(null)
      else setText(value == null ? '' : String(Math.round(value / 10_000)))
      return
    }
    onChange(Math.min(Number(s), 1_000_000) * 10_000)
  }
  return (
    <span className={cn('inline-flex h-9 items-center rounded-lg border border-rule-strong bg-card pr-2.5 focus-within:border-sky', disabled && 'opacity-50', className)}>
      <input
        id={id}
        inputMode="numeric"
        disabled={disabled}
        value={text}
        placeholder={optional ? '미입력' : ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
        className="t-num h-full w-full min-w-0 bg-transparent px-2.5 text-right text-[14px] outline-none placeholder:text-ink-3"
      />
      <span className="shrink-0 text-[12px] text-ink-3">만 원</span>
    </span>
  )
}

export function MonthInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return <input id={id} type="month" value={value} min="2026-01" max="2032-12" onChange={(e) => e.target.value && onChange(e.target.value)} className="t-num h-9 rounded-lg border border-rule-strong bg-card px-2.5 text-[14px] outline-none focus:border-sky" />
}

export function Slider({ label, value, min, max, step, onChange, format, help, prov }: { label: ReactNode; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; help?: ReactNode; prov?: Prov }) {
  const id = useId()
  const p = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-[12.5px] text-ink-2">
          {label}
        </label>
        {help && <Help>{help}</Help>}
        {prov && <Prov kind={prov} />}
        <span className="t-num ml-auto text-[13.5px] font-semibold text-navy">{format(value)}</span>
      </div>
      <input id={id} type="range" className="instrument" min={min} max={max} step={step} value={value} style={{ ['--p' as string]: `${Math.max(0, Math.min(100, p))}%` }} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border border-rule bg-card px-2.5 py-0.5 text-[11.5px] text-ink-2', className)}>{children}</span>
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-paper-2', className)} />
}

export const manShort = (v: number) => man(v, false)
