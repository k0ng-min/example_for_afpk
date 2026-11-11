import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, ClipboardList, Scale, SearchCheck, UserRound, CheckCircle2, ChevronRight, CircleAlert, ShieldCheck, Wallet } from 'lucide-react'
import { cn } from '@/utils/format'
import { useCpa } from '@/features/cpa/store'
import { STRATEGY_META, man, monthsBetween, ym } from '@/features/cpa/meta'
import type { Analysis } from '@/features/cpa/types'
import { Help, Prov, Skel, StrategyBadge } from '@/components/cpa/ui'
import { CashChart } from '@/components/cpa/charts'

/**
 * 홈: 스크롤 없는 한 화면. 노트북(브라우저 툴바·작업표시줄 제외 약 450px)에서도 들어가도록
 * 소개 → 현재 상태 → 전략별 판정 세 덩어리만 둔다. 자세한 내용은 각 화면으로 연결한다.
 */
export default function Home() {
  const a = useCpa((s) => s.analysis)
  return (
    <div className="flex flex-col gap-2.5 lg:h-[calc(100dvh-124px)] lg:min-h-[400px]">
      <Intro a={a} />
      {a ? <StatusRow a={a} /> : <Skel className="h-[64px] shrink-0" />}
      <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-[1.45fr_1fr]">
        {a ? <StrategyTable a={a} /> : <Skel className="min-h-[200px]" />}
        {a ? <BalancePreview a={a} /> : <Skel className="min-h-[200px]" />}
      </div>
    </div>
  )
}

function Intro({ a }: { a: Analysis | null }) {
  return (
    <section className="card relative shrink-0 overflow-hidden px-4 py-3 sm:px-5">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(0,0,0,.16),transparent_65%)]" />
      <div className="relative grid gap-3 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <div className="min-w-0">
          <div className="eyebrow [@media(min-width:1024px)_and_(max-height:700px)]:hidden">CPA 2차 유예생 재무설계 · 고객 김유예</div>
          <h1 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight text-navy sm:text-[24px]">합격해도 월세는 기다려주지 않는다</h1>
          <p className="mt-1 text-[12.5px] text-ink-2">수험생 김유예 씨의 돈이 언제 바닥나는지 계산하고, 그 전에 무엇을 바꿀지 정해 주는 재무설계입니다. 합격 확률은 예측하지 않습니다.</p>
          <GuideSteps />
        </div>
        {a ? <Decision a={a} /> : <Skel className="h-[96px]" />}
      </div>
    </section>
  )
}

const GUIDE = [
  { to: '/client', icon: UserRound, t: '고객 상황', d: '돈·지출·일정 보기' },
  { to: '/simulator', icon: Scale, t: '선택지 비교', d: '버틸 수 있나' },
  { to: '/verification', icon: SearchCheck, t: 'AI 답 검증', d: '맞는지 계산' },
  { to: '/plan', icon: ClipboardList, t: '실행 계획', d: '언제 무엇을' },
]

/** 처음 온 사람도 무엇을 할지 알 수 있도록 순서대로 누르는 4단계 */
function GuideSteps() {
  return (
    <div className="mt-2.5">
      <div className="mb-1 text-[11.5px] font-medium text-ink-3 [@media(min-width:1024px)_and_(max-height:700px)]:hidden">처음이라면 ①부터 순서대로 눌러 보세요</div>
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {GUIDE.map((g, k) => (
          <li key={g.to}>
            <Link
              to={g.to}
              className={cn(
                'group flex h-full items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,.5)]',
                k === 0 ? 'btn-primary border-transparent text-white' : 'border-rule bg-white/90 hover:border-sky-2',
              )}
            >
              <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold', k === 0 ? 'bg-white/20 text-white' : 'bg-sky-soft text-sky')}>{k + 1}</span>
              <span className="min-w-0 leading-tight">
                <span className={cn('flex items-center gap-1 text-[13px] font-semibold', k === 0 ? 'text-white' : 'text-ink')}>
                  <g.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{g.t}</span>
                </span>
                <span className={cn('block truncate text-[11px]', k === 0 ? 'text-white/80' : 'text-ink-3')}>{g.d}</span>
              </span>
              {k < GUIDE.length - 1 && <ArrowRight className={cn('ml-auto hidden h-3.5 w-3.5 shrink-0 sm:block', k === 0 ? 'text-white/70' : 'text-ink-3')} />}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Decision({ a }: { a: Analysis }) {
  const i = a.inputs
  const A = a.short.find((p) => p.strategy === 'A')!
  const s1 = a.signals.items.find((s) => s.id === 1)!
  const monthsToTau = A.tau ? monthsBetween(i.startMonth, A.tau) : null
  let tone: 'good' | 'caution' | 'alert' = 'good'
  let title = '지금은 공부에 집중해도 됩니다'
  let body = `잔액이 첫 번째 점검선(${man(i.signal1)})까지 ${man(i.cash0 - i.signal1)} 남았습니다. 공부만 계속하면 ${ym(s1.ifNoAction)}에 닿고, 그때 아르바이트를 시작합니다.`
  if (i.cash0 <= i.signal1) {
    tone = 'caution'
    title = '근로 병행 시작 검토 필요'
    body = `잔액이 첫 번째 점검선(${man(i.signal1)}) 아래입니다. 첫 소득까지 ${i.partTimeLead}개월 걸리므로 지금 근로처를 찾습니다.`
  } else if (monthsToTau != null && monthsToTau <= 3) {
    tone = 'alert'
    title = '3개월 내 지출 조정 검토 필요'
    body = `전업을 유지하면 ${ym(A.tau)}에 안전자금 아래로 내려갑니다.`
  }
  return (
    <div className="rounded-xl border border-rule bg-white/90 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-ink-2">지금 필요한 판단</span>
        <Prov kind="engine" />
        <Link to="/plan" className="ml-auto flex items-center text-[12px] text-sky hover:underline">
          실행 계획 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className={cn('mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold', tone === 'good' && 'bg-good-soft text-good', tone === 'caution' && 'bg-caution-soft text-caution', tone === 'alert' && 'bg-alert-soft text-alert')}>
        {tone === 'good' ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        {title}
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{body}</p>
    </div>
  )
}

function StatusRow({ a }: { a: Analysis }) {
  const i = a.inputs
  const A = a.short.find((p) => p.strategy === 'A')!
  const D = a.short.find((p) => p.strategy === 'D')!
  const upcoming = a.markers.filter((m) => m.month > i.startMonth).sort((x, y) => (x.month < y.month ? -1 : 1))[0]
  const items = [
    { icon: <Wallet className="h-3.5 w-3.5" />, label: '현재 가용현금', value: man(i.cash0), sub: `보증금 ${man(i.deposit)} 제외`, prov: 'assumed' as const },
    { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: '비상금 하한', value: man(i.safetyMin), sub: `여유 ${man(i.cash0 - i.safetyMin)}`, prov: 'assumed' as const },
    { icon: <CircleAlert className="h-3.5 w-3.5" />, label: '비상금 부족 시점(공부만 할 때)', value: A.tau ? ym(A.tau) : '18개월 내 없음', sub: A.tau ? `${monthsBetween(i.startMonth, A.tau)}개월 뒤 · 규칙대로 전환하면 ${D.tau ? ym(D.tau) : '부족 없음'}` : '', prov: 'engine' as const, tone: A.tau ? 'caution' : 'good' },
    { icon: <CalendarClock className="h-3.5 w-3.5" />, label: '다음 중요한 일정', value: upcoming ? ym(upcoming.month) : '—', sub: upcoming?.label.replace('*', ' (공고 전)') ?? '', prov: (upcoming && (upcoming.kind === 'exam' || upcoming.kind === 'announce') ? 'validate' : 'assumed') as 'validate' | 'assumed' },
  ]
  return (
    <section className="grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-4" aria-label="현재 상태 요약">
      {items.map((it) => (
        <div key={it.label} className="card min-w-0 px-3.5 py-2">
          <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-soft text-sky">{it.icon}</span>
            <span className="truncate">{it.label}</span>
            <Prov kind={it.prov} className="ml-auto hidden sm:inline-flex" />
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <span className={cn('t-num shrink-0 text-[19px] leading-tight text-navy', it.tone === 'caution' && 'text-caution')}>{it.value}</span>
            <span className="truncate text-[11.5px] text-ink-3" title={it.sub}>
              {it.sub}
            </span>
          </div>
        </div>
      ))}
    </section>
  )
}

/** 18개월 판정과 60개월 가치를 전략별 한 줄로 합친 표 */
function StrategyTable({ a }: { a: Analysis }) {
  const L = a.long
  const longOf = (s: string) => L.strategies.find((v) => v.strategy === s)
  return (
    <section className="card flex min-h-0 flex-1 flex-col px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-navy">4가지 선택지, 버틸 수 있을까?</span>
        <Prov kind="engine" />
        <Help>18개월: 월말 잔액이 최소 안전자금 이상이고 월중에 생활비를 낼 수 있으면 통과(합격 이후 소득 미반영). 60개월: 18개월을 통과한 전략끼리만 기대 현재가치로 순위를 매깁니다. p·q는 예측이 아닌 시나리오 조건입니다.</Help>
        <span className="ml-auto flex gap-3 text-[12px]">
          <Link to="/simulator" className="flex items-center text-sky hover:underline">
            18개월 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link to="/simulator?tab=long" className="flex items-center text-sky hover:underline">
            60개월 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-rule pb-1 text-[11.5px] text-ink-3 sm:grid-cols-[1fr_110px_150px_130px]">
        <span>전략</span>
        <span className="hidden text-right sm:block">가장 적을 때 잔액</span>
        <span className="text-center">앞으로 18개월</span>
        <span className="text-right">5년 기대 가치</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-around">
        {a.short.map((p) => {
          const missing = p.missing.length > 0
          const ok = !missing && p.tau == null && p.insolvent == null
          const v = longOf(p.strategy)
          return (
            <div key={p.strategy} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-b border-rule/60 py-1 last:border-0 sm:grid-cols-[1fr_110px_150px_130px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <StrategyBadge s={p.strategy} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{STRATEGY_META[p.strategy].name}</span>
                  <span className="hidden truncate text-[12px] text-ink-3 [@media(min-height:860px)]:block">{STRATEGY_META[p.strategy].desc}</span>
                </span>
              </div>
              <span className="t-num hidden text-right text-[12.5px] text-ink-2 sm:block">{missing ? '—' : man(p.minCash)}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-center text-[12px] font-semibold', missing ? 'bg-paper-2 text-ink-3' : ok ? 'bg-good-soft text-good' : 'bg-caution-soft text-caution')}>{missing ? '임금 입력 필요' : ok ? '버틸 수 있음' : `${ym(p.tau ?? p.insolvent)} 비상금 부족`}</span>
              <span className="t-num text-right text-[13px]">
                {!L.available || v?.value == null ? (
                  <span className="text-ink-3">—</span>
                ) : v.rank != null ? (
                  <>
                    <span className="mr-1.5 rounded-full bg-sky-soft px-1.5 py-[1px] text-[11px] font-semibold text-sky">{v.rank}위</span>
                    <b className="font-semibold text-ink">{man(v.value)}</b>
                  </>
                ) : (
                  <span className="text-ink-3" title={`18개월을 버티지 못해 순위에서 제외 (계산값 ${man(v.value)})`}>
                    제외
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function useViewportHeight() {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}

/** 비전공자도 한눈에: 공부만 할 때(A)와 규칙대로 전환할 때(D)의 잔액 비교 */
function BalancePreview({ a }: { a: Analysis }) {
  const vh = useViewportHeight()
  const height = Math.max(150, Math.min(420, vh - 460))
  const A = a.short.find((p) => p.strategy === 'A')!
  const D = a.short.find((p) => p.strategy === 'D')!
  return (
    <section className="card flex min-h-0 flex-col px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold text-navy">통장 잔액은 이렇게 변해요</span>
        <Prov kind="engine" />
        <Link to="/simulator" className="ml-auto flex items-center text-[12px] text-sky hover:underline">
          자세히 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <p className="text-[11.5px] text-ink-3">
        점선 = 비상금 하한 {man(a.inputs.safetyMin)} · 공부만 하면 {A.tau ? `${ym(A.tau)}에 아래로` : '하한 유지'} · 규칙대로 전환하면 {D.tau ? `${ym(D.tau)}에 아래로` : '18개월 내내 위'}
      </p>
      <div className="min-h-0 flex-1">
        <CashChart a={a} focus={null} visible={['A', 'D']} height={height} showMarkers={false} />
      </div>
    </section>
  )
}
