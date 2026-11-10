// 목표 달성 아치 게이지(레퍼런스의 반원 게이지를 재해석).
// 채워진 호 = 기한 내 달성 가능한 목표 비율, 점 = 목표 하나(채움: 기한 내, 비움: 지연). 모두 Rust 계산 결과.
import { motion } from 'motion/react'
import type { GoalResult } from '@/types/api'

export function GoalArc({ goals }: { goals: GoalResult[] }) {
  const total = goals.length
  const ok = goals.filter((g) => g.onTrack).length
  const ratio = total ? ok / total : 0
  const W = 360
  const H = 200
  const cx = W / 2
  const cy = H - 8
  const r = 160
  const pt = (t: number) => {
    const a = Math.PI - t * Math.PI
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const
  }
  const [sx, sy] = pt(0)
  const [ex, ey] = pt(1)
  const arc = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`
  const sorted = [...goals].sort((a, b) => a.priority - b.priority)
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`목표 ${total}개 중 ${ok}개 기한 내 달성 가능`}>
        <defs>
          <linearGradient id="arcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {/* 반원 돔(유리 질감) */}
        <path d={`${arc} Z`} fill="url(#arcFill)" />
        <path d={arc} fill="none" stroke="rgba(36,56,86,.14)" strokeWidth="1.5" strokeDasharray="3 5" />
        <motion.path d={arc} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: ratio }} transition={{ duration: 1, ease: 'easeOut' }} />
        {sorted.map((g, i) => {
          const [x, y] = pt(total === 1 ? 0.5 : 0.08 + (i / Math.max(1, total - 1)) * 0.84)
          return (
            <g key={g.goalId}>
              <circle cx={x} cy={y} r="5.5" fill={g.onTrack ? 'var(--primary)' : '#fff'} stroke="var(--primary)" strokeWidth="1.5" />
              <title>{`${g.priority}순위 ${g.name}: ${g.onTrack ? `${g.achievedMonth}개월 차 달성` : g.achievedMonth ? `${g.achievedMonth}개월 차(기한 초과)` : '기간 내 미달성'}`}</title>
            </g>
          )
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-3 text-center">
        <div className="num text-[34px] leading-none font-light">
          {total ? Math.round(ratio * 100) : 0}
          <span className="unit">%</span>
        </div>
        <div className="mt-1.5 text-[12px] text-muted">{total ? `목표 ${total}개 중 ${ok}개를 기한 안에 달성할 수 있어요` : '등록된 목표가 없습니다'}</div>
      </div>
    </div>
  )
}
