// 영상용 제품 UI 조각: 앱 창(웹앱 헤더 재구성), 전략 배지, 상태 칩, 잔액 선 그래프(그려지는 애니메이션).
import type { CSSProperties, ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { C, FONT, SHADOW } from '../design/tokens'
import { prog, EASE_IN_OUT } from './motion'

export const STRAT = ['A', 'B', 'C', 'D'] as const

export function StrategyBadge({ i, size = 30 }: { i: number; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.24, background: C.series[i], color: '#fff', display: 'inline-grid', placeItems: 'center', fontFamily: FONT.num, fontWeight: 700, fontSize: size * 0.5, flexShrink: 0 }}>{STRAT[i]}</span>
  )
}

export type Tone = 'ok' | 'warn' | 'danger' | 'ink' | 'muted' | 'violet'
const TONE: Record<Tone, [string, string]> = {
  ok: [C.ok, C.okSoft],
  warn: [C.warn, C.warnSoft],
  danger: [C.danger, C.dangerSoft],
  ink: ['#fff', C.ink],
  muted: [C.muted, '#EFEFF1'],
  violet: [C.violet, C.violetSoft],
}
export function Chip({ tone, children, style }: { tone: Tone; children: ReactNode; style?: CSSProperties }) {
  const [fg, bg] = TONE[tone]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, background: bg, color: fg, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', ...style }}>{children}</span>
}

/** 웹앱 헤더를 재구성한 앱 창. active = 선택된 메뉴 인덱스 */
export function AppWindow({ brand, title, nav, active, children, style, reveal = 1 }: { brand: string; title: string; nav: string[]; active: number; children?: ReactNode; style?: CSSProperties; reveal?: number }) {
  return (
    <div style={{ position: 'absolute', background: 'rgba(255,255,255,0.96)', borderRadius: 24, boxShadow: `${SHADOW.lift}, inset 0 0 0 1px ${C.cardLine}`, overflow: 'hidden', ...style }}>
      <div style={{ height: 70, display: 'flex', alignItems: 'center', gap: 18, padding: '0 28px', borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ width: 28, height: 4, borderRadius: 4, background: C.ink }} />
          <span style={{ width: 18, height: 4, borderRadius: 4, background: C.dim }} />
        </div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
          <div style={{ fontSize: 12, color: C.dim, fontFamily: FONT.num, letterSpacing: '0.04em' }}>{brand} · AI 재무설계</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, padding: 4, borderRadius: 999, boxShadow: `inset 0 0 0 1px ${C.hair}`, opacity: reveal }}>
          {nav.map((n, k) => (
            <span key={n} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 14.5, background: k === active ? C.ink : 'transparent', color: k === active ? '#fff' : C.muted, fontWeight: k === active ? 600 : 400, whiteSpace: 'nowrap' }}>
              {n}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: 'calc(100% - 70px)' }}>{children}</div>
    </div>
  )
}

/** 섹션 제목 + 엔진 배지 */
export function PanelTitle({ children, tag, style }: { children: ReactNode; tag?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>
      <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{children}</span>
      {tag}
    </div>
  )
}

export function EngineTag({ label = '엔진 계산' }: { label?: string }) {
  return <span style={{ padding: '4px 11px', borderRadius: 999, background: C.ink, color: '#fff', fontSize: 13.5, fontWeight: 600 }}>∑ {label}</span>
}

/**
 * 잔액 선 그래프. series 값(원)을 그리는 애니메이션(drawStart~drawStart+drawDur).
 * floor = 안전자금 하한(점선), marker = 강조할 지점.
 */
export function LineChart({
  width,
  height,
  months,
  series,
  floor,
  drawStart,
  drawDur,
  marker,
  yMin,
  yMax,
  endLabels = true,
  uid = 'chart',
}: {
  width: number
  height: number
  months: string[]
  series: { values: number[]; color: string; dashed?: boolean; label?: string; dim?: boolean }[]
  floor?: { value: number; label: string }
  drawStart: number
  drawDur: number
  marker?: { index: number; value: number; label: string; at: number }
  yMin?: number
  yMax?: number
  endLabels?: boolean
  uid?: string
}) {
  const frame = useCurrentFrame()
  const padL = 70
  const padR = endLabels ? 120 : 20
  const padT = 20
  const padB = 40
  const all = series.flatMap((s) => s.values).concat(floor ? [floor.value] : [])
  // 보기 좋은 눈금: 100·200·250·500·1000만 원 단위 중 4~5칸이 되는 간격
  const rawLo = yMin ?? Math.min(0, ...all)
  const rawHi = yMax ?? Math.max(...all)
  const unit = [1_000_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000, 20_000_000].find((u) => (rawHi - rawLo) / u <= 5) ?? 50_000_000
  const lo = Math.floor(rawLo / unit) * unit
  const hi = Math.ceil(rawHi / unit) * unit
  const n = months.length
  const x = (i: number) => padL + (i / (n - 1)) * (width - padL - padR)
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * (height - padT - padB)
  const p = interpolate(frame, [drawStart, drawStart + drawDur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const step = unit
  const ticks = Math.round((hi - lo) / unit)
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {Array.from({ length: ticks + 1 }, (_, k) => lo + k * step).map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke={C.hair} />
          <text x={padL - 12} y={y(v) + 5} textAnchor="end" fontSize={14} fill={C.dim} fontFamily={FONT.num}>
            {Math.round(v / 10_000).toLocaleString('ko-KR')}
          </text>
        </g>
      ))}
      {lo < 0 && <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke={C.dim} />}
      {months.map((m, i) =>
        i % 3 === 0 ? (
          <text key={m} x={x(i)} y={height - 10} textAnchor="middle" fontSize={14} fill={C.dim} fontFamily={FONT.num}>
            {m.slice(2).replace('-', '.')}
          </text>
        ) : null,
      )}
      {floor && (
        <g opacity={prog(frame, drawStart - 10, 14)}>
          <line x1={padL} x2={width - padR} y1={y(floor.value)} y2={y(floor.value)} stroke={C.warn} strokeWidth={2} strokeDasharray="8 6" />
          <text x={padL + 10} y={y(floor.value) - 9} fontSize={15} fontWeight={600} fill={C.warn}>
            {floor.label}
          </text>
        </g>
      )}
      <defs>
        <clipPath id={`draw-${uid}`}>
          <rect x={0} y={0} width={padL + p * (width - padL - padR) + 8} height={height} />
        </clipPath>
      </defs>
      {series.map((s, k) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
        const fi = p * (n - 1)
        const i0 = Math.min(n - 1, Math.floor(fi))
        const i1 = Math.min(n - 1, i0 + 1)
        const headY = y(s.values[i0] + (s.values[i1] - s.values[i0]) * (fi - i0))
        return (
          <g key={k} opacity={s.dim ? 0.25 : 1}>
            <polyline points={pts} clipPath={`url(#draw-${uid})`} fill="none" stroke={s.color} strokeWidth={s.dim ? 2.5 : 3.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '10 8' : undefined} />
            {endLabels && s.label && p > 0.98 && (
              <text x={x(n - 1) + 12} y={y(s.values[n - 1]) + 5} fontSize={16} fontWeight={700} fill={s.color} fontFamily={FONT.sans} opacity={prog(frame, drawStart + drawDur - 4, 10)}>
                {s.label}
              </text>
            )}
            {p < 1 && p > 0 && !s.dim && <circle cx={padL + p * (width - padL - padR)} cy={headY} r={5} fill={s.color} />}
          </g>
        )
      })}
      {marker && frame >= marker.at && (
        <g opacity={prog(frame, marker.at, 10)}>
          <circle cx={x(marker.index)} cy={y(marker.value)} r={9 + 4 * Math.max(0, 1 - (frame - marker.at) / 20)} fill={C.danger} stroke="#fff" strokeWidth={3} />
          <g transform={`translate(${x(marker.index)}, ${y(marker.value) + 30})`}>
            <rect x={-118} y={0} width={236} height={40} rx={20} fill={C.danger} />
            <text x={0} y={26} textAnchor="middle" fontSize={18} fontWeight={700} fill="#fff">
              {marker.label}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}
