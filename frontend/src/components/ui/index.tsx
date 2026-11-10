// 공통 UI — "Mist" 디자인 시스템(레퍼런스: Wirely My Portfolio).
// 알약형 버튼, 원형 아이콘 버튼, 유리 패널, 얇은 숫자와 작은 단위. shadcn/ui 패턴(cva)으로 직접 구현.
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Bot, Calculator, CircleHelp, FileQuestion, Loader2, PencilLine, ScrollText, UserCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/format'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-[background,color,box-shadow,transform,opacity] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-ring',
  {
    variants: {
      variant: {
        primary: 'bg-[linear-gradient(135deg,#6d84a6,#3d5c88)] text-white shadow-[0_1px_0_rgba(255,255,255,.35)_inset,0_8px_20px_-10px_rgba(36,56,86,.55)] hover:brightness-110',
        accent: 'bg-accent text-white hover:brightness-110',
        secondary: 'bg-white/70 text-fg shadow-[var(--pill-shadow)] hover:bg-white/90',
        ghost: 'text-muted hover:text-fg hover:bg-white/50',
        danger: 'text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]',
      },
      size: { sm: 'h-8 px-3.5 text-[12.5px]', md: 'h-9 px-4', lg: 'h-11 px-6 text-[14px]', icon: 'h-9 w-9 shadow-[inset_0_0_0_1px_var(--hair-strong)]' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
))
Button.displayName = 'Button'

/** 원형 아이콘 버튼(레퍼런스의 테두리 원형 버튼) */
export function IconCircle({ className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/40 text-muted shadow-[inset_0_0_0_1px_rgba(36,56,86,.14)] transition-colors hover:bg-white/80 hover:text-fg disabled:opacity-40 focus-ring', className)} {...p}>
      {children}
    </button>
  )
}

/** 유리 패널 */
export function Panel({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-[24px]', className)} {...p} />
}

/** 물음표 도움말: 설명 글은 화면에 늘어놓지 않고 필요할 때만 연다(클릭·키보드, 바깥 클릭·Esc로 닫힘) */
export function HelpTip({ children, label = '도움말', className, align = 'left' }: { children: ReactNode; label?: string; className?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className={cn('grid h-5 w-5 place-items-center rounded-full text-dim transition-colors hover:bg-white/70 hover:text-fg focus-ring', open && 'bg-white text-fg shadow-[var(--pill-shadow)]')}>
        <CircleHelp className="h-[15px] w-[15px]" />
      </button>
      {open && (
        <span id={id} role="tooltip" className={cn('absolute top-7 z-50 w-[min(300px,80vw)] rounded-[16px] bg-white/95 px-4 py-3 text-left text-[12.5px] leading-relaxed font-normal tracking-normal text-muted shadow-[0_18px_40px_-18px_rgba(36,56,86,.45),inset_0_0_0_1px_rgba(36,56,86,.08)] backdrop-blur', align === 'right' ? 'right-0' : 'left-0')}>
          {children}
        </span>
      )}
    </span>
  )
}

export function PanelHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-3', className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
        {description && <HelpTip label={`${typeof title === 'string' ? title : ''} 설명`}>{description}</HelpTip>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[15px] font-medium">{children}</h2>
      {aside && <div className="text-[12px] text-dim">{aside}</div>}
    </div>
  )
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium leading-none', {
  variants: {
    tone: {
      neutral: 'bg-white/60 text-muted shadow-[inset_0_0_0_1px_var(--hair)]',
      accent: 'bg-accent-soft text-accent',
      ok: 'bg-[color-mix(in_oklab,var(--ok)_12%,transparent)] text-ok',
      warn: 'bg-[color-mix(in_oklab,var(--warn)_13%,transparent)] text-warn',
      danger: 'bg-[color-mix(in_oklab,var(--danger)_11%,transparent)] text-danger',
      violet: 'bg-[color-mix(in_oklab,var(--violet)_12%,transparent)] text-violet',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ tone, className, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />
}

export type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

export const inputClass =
  'h-10 w-full rounded-[14px] bg-white/65 px-3.5 text-[13.5px] text-fg placeholder:text-dim shadow-[inset_0_0_0_1px_rgba(36,56,86,.1),0_1px_0_rgba(255,255,255,.8)] hover:bg-white/80 focus:bg-white focus:shadow-[inset_0_0_0_1px_var(--accent-line)] outline-none transition'

export const selectClass = 'h-9 rounded-full bg-white/65 px-3.5 text-[13px] text-fg shadow-[inset_0_0_0_1px_rgba(36,56,86,.1)] hover:bg-white/85 outline-none focus-visible:bg-white focus-visible:shadow-[inset_0_0_0_1.5px_var(--accent-line)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...p} />
))
Input.displayName = 'Input'

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-[84px] py-2.5 leading-relaxed', className)} {...p} />
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 px-1 text-[12px] text-muted">
      <span>{children}</span>
      {hint && <span className="text-[11px] text-dim">{hint}</span>}
    </label>
  )
}

/** 정수 금액 입력(천 단위 구분 표시). 포커스 중에는 원문 숫자를 편집한다. */
export function NumberField({ value, onChange, suffix = '원', min, max, step, id, className, ariaLabel }: { value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; step?: number; id?: string; className?: string; ariaLabel?: string }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])
  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^\d-]/g, ''))
    if (Number.isFinite(n)) {
      let v = Math.trunc(n)
      if (min != null) v = Math.max(min, v)
      if (max != null) v = Math.min(max, v)
      onChange(v)
    }
  }
  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        className={cn(inputClass, 'num pr-11 text-right text-[14px] font-light')}
        value={focused ? draft : new Intl.NumberFormat('ko-KR').format(value)}
        step={step}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false)
          commit(e.target.value)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          commit(e.target.value)
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[11px] text-dim">{suffix}</span>
    </div>
  )
}

/** 얇은 트랙 슬라이더: 기본값에서 바뀌면 값이 주제색으로 표시된다 */
export function Slider({ label, value, min, max, step, onChange, format, neutral = 0 }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; neutral?: number }) {
  const p = ((value - min) / (max - min)) * 100
  const changed = value !== neutral
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        <span className={cn('num text-[13.5px] transition-colors', changed ? 'text-accent' : 'text-fg')}>{format(value)}</span>
      </div>
      <input type="range" aria-label={label} className="instrument" style={{ ['--p' as string]: `${p}%` }} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-dim', className)} aria-label="불러오는 중" />
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-[color-mix(in_oklab,var(--danger)_9%,rgba(255,255,255,.6))] px-4 py-3 text-[13px] text-danger">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="danger" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  )
}

export function Notice({ tone = 'ok', children }: { tone?: 'ok' | 'warn'; children: ReactNode }) {
  return <div className={cn('rounded-[16px] px-4 py-2.5 text-[13px]', tone === 'ok' ? 'bg-[color-mix(in_oklab,var(--ok)_10%,rgba(255,255,255,.6))] text-ok' : 'bg-[color-mix(in_oklab,var(--warn)_10%,rgba(255,255,255,.6))] text-warn')}>{children}</div>
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass-soft rounded-[20px] px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-fg">{title}</p>
      {children && <div className="mt-2 text-[13px] text-muted">{children}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className="inline-flex rounded-full bg-white/40 p-1 shadow-[inset_0_0_0_1px_rgba(36,56,86,.08)]">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-full px-3.5 font-medium transition-all', size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[12.5px]', value === o.value ? 'bg-white text-fg shadow-[var(--pill-shadow)]' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 금액·수치 표시: 단위(원, 만, 개월, %)는 작고 흐리게 */
export function Num({ text, className }: { text: string; className?: string }) {
  const m = text.match(/^(.*?)([가-힣%]+.*)?$/)
  const head = m?.[1] ?? text
  const tail = m?.[2] ?? ''
  if (!/\d/.test(head)) return <span className={cn('num', className)}>{text}</span>
  return (
    <span className={cn('num', className)}>
      {head}
      {tail && <span className="unit">{tail}</span>}
    </span>
  )
}

/** 라벨 + 수치(카드 없이) — 레퍼런스 상단 통계 줄 스타일 */
export function Readout({ label, value, sub, tone, className, size = 'md' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'ok' | 'accent'; className?: string; size?: 'md' | 'lg' }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate text-[11.5px] text-dim">{label}</div>
      <div className={cn('mt-1 truncate leading-tight font-light', size === 'lg' ? 'text-[26px]' : 'text-[19px]', tone === 'danger' && 'text-danger', tone === 'ok' && 'text-ok', tone === 'accent' && 'text-accent')}>
        {typeof value === 'string' ? <Num text={value} /> : <span className="num">{value}</span>}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-dim">{sub}</div>}
    </div>
  )
}

/** 로딩 자리 표시: 레이아웃을 유지한 채 회색 막대로 표시(전역 스피너로 빈 화면을 만들지 않는다) */
export function Skeleton({ className, label }: { className?: string; label?: string }) {
  return <div role={label ? 'status' : undefined} aria-label={label} aria-busy={label ? true : undefined} className={cn('skeleton rounded-[14px]', className)} />
}

/** 화면 본문 로딩 자리 표시(머리말은 페이지가 직접 그린다) */
export function PageSkeleton({ rows = 2, label = '화면을 불러오는 중' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-4 px-5 sm:px-8 lg:px-10" role="status" aria-label={label} aria-busy>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-56 rounded-[24px]" />
      ))}
    </div>
  )
}

/** 결과의 출처 라벨. 색만이 아니라 아이콘과 글자로 구분한다. */
export type SourceKind = 'llm' | 'engine' | 'rule' | 'input' | 'human' | 'draft'
export const SOURCE_META: Record<SourceKind, { label: string; icon: LucideIcon; tone: Tone; help: string }> = {
  llm: { label: 'AI 생성 문장', icon: Bot, tone: 'violet', help: '외부 LLM(Gemini)이 작성한 문장입니다. 수치는 계산값과 대조해야 합니다.' },
  engine: { label: 'Rust 계산', icon: Calculator, tone: 'accent', help: 'Rust 계산 엔진이 입력값으로 결정적으로 계산한 값입니다.' },
  rule: { label: '규칙 엔진', icon: ScrollText, tone: 'neutral', help: '사전에 정의한 규칙(임계값)으로 판정한 결과입니다. LLM을 호출하지 않습니다.' },
  input: { label: '사용자 입력', icon: PencilLine, tone: 'neutral', help: '고객 정보 화면에서 입력한 합성 데이터입니다.' },
  human: { label: '사람 판단', icon: UserCheck, tone: 'ok', help: '검토자가 직접 기록한 판단입니다.' },
  draft: { label: 'AI 초안(예시)', icon: FileQuestion, tone: 'warn', help: '주제 구성에 미리 작성된 AI 초안 주장입니다. 실시간 LLM 호출 결과가 아니며 검증 대상입니다.' },
}

export function SourceBadge({ kind, className, children }: { kind: SourceKind; className?: string; children?: ReactNode }) {
  const m = SOURCE_META[kind]
  return (
    <Badge tone={m.tone} className={className} title={m.help}>
      <m.icon className="h-3 w-3" aria-hidden />
      {children ?? m.label}
    </Badge>
  )
}
