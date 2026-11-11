// 공통 UI 모션 컴포넌트: 격자 무대, 카메라, 알약→카드 변형, 커서, 단계 목록, 선택 목록, 자막, 출처 배지.
import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, FONT, RADIUS, SHADOW } from '../design/tokens'

export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1)
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1)

/** frame 이 start 부터 dur 프레임 동안 0→1 (부드러운 감속) */
export function prog(frame: number, start: number, dur: number, easing = EASE) {
  return interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })
}

/** 스프링 등장(0→1). 과한 튕김 없이 살짝만 */
export function useAppear(delay: number, damping = 18) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 140, mass: 0.7 } })
}

/** 등장/퇴장 스타일: 아래에서 살짝 떠오르며 흐림이 걷힘. out 은 퇴장 진행(0→1) */
export function appearStyle(p: number, out = 0, dy = 14): CSSProperties {
  const o = Math.min(p, 1 - out)
  return {
    opacity: Math.max(0, o),
    transform: `translateY(${(1 - p) * dy - out * 8}px) scale(${0.985 + 0.015 * p - out * 0.02})`,
    filter: `blur(${(1 - p) * 6 + out * 8}px)`,
  }
}

/** 은은한 격자 바탕(레퍼런스의 노트 격자를 연한 블루그레이로) */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT.sans, color: C.text }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          backgroundPosition: '-1px -1px',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(1200px 700px at 50% 45%, rgba(255,255,255,0.8), rgba(246,246,247,0) 70%)' }} />
      {children}
    </AbsoluteFill>
  )
}

export type CamKey = { f: number; scale?: number; x?: number; y?: number }
/** 카메라: 키프레임 사이를 부드럽게 확대·이동(화면 중심 기준) */
export function Camera({ keys, children }: { keys: CamKey[]; children: ReactNode }) {
  const frame = useCurrentFrame()
  const fs = keys.map((k) => k.f)
  const val = (k: 'scale' | 'x' | 'y', d: number) => {
    if (keys.length === 1) return keys[0][k] ?? d
    return interpolate(frame, fs, keys.map((x) => x[k] ?? d), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  }
  return (
    <AbsoluteFill style={{ transform: `translate(${val('x', 0)}px, ${val('y', 0)}px) scale(${val('scale', 1)})`, transformOrigin: '50% 50%' }}>{children}</AbsoluteFill>
  )
}

export function Card({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ background: C.card, borderRadius: RADIUS.card, boxShadow: `${SHADOW.card}, inset 0 0 0 1px ${C.cardLine}`, position: 'absolute', overflow: 'hidden', ...style }}>{children}</div>
  )
}

/**
 * 레퍼런스의 핵심 동작: 작은 알약(제목)이 카드로 펼쳐지고 내용이 차례로 나타난다.
 * at = 펼치기 시작 프레임. 퇴장(outAt)에서는 흐려지며 사라진다.
 */
export function MorphCard({
  x,
  y,
  width,
  height,
  title,
  at,
  outAt,
  right,
  children,
  pillWidth,
}: {
  x: number
  y: number
  width: number
  height: number
  title: ReactNode
  at: number
  outAt?: number
  right?: ReactNode
  children?: ReactNode
  pillWidth?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pillIn = spring({ frame: frame - at, fps, config: { damping: 20, stiffness: 160 } })
  const grow = spring({ frame: frame - at - 12, fps, config: { damping: 22, stiffness: 110 } })
  const out = outAt != null ? prog(frame, outAt, 14, EASE_IN_OUT) : 0
  const pw = pillWidth ?? Math.min(width, 380)
  const w = interpolate(grow, [0, 1], [pw, width])
  const h = interpolate(grow, [0, 1], [64, height])
  const r = interpolate(grow, [0, 1], [32, RADIUS.card])
  if (frame < at) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x + (width - w) / 2,
        top: y,
        width: w,
        height: h,
        borderRadius: r,
        background: C.card,
        boxShadow: `${grow > 0.5 ? SHADOW.card : SHADOW.pill}, inset 0 0 0 1px ${C.cardLine}`,
        overflow: 'hidden',
        opacity: Math.min(pillIn * 1.4, 1) * (1 - out),
        transform: `translateY(${(1 - pillIn) * 10 - out * 6}px) scale(${0.96 + 0.04 * pillIn - out * 0.03})`,
        filter: `blur(${out * 10}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 28px', gap: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{title}</div>
        {right && <div style={{ opacity: grow }}>{right}</div>}
      </div>
      <div style={{ opacity: interpolate(grow, [0.55, 1], [0, 1], { extrapolateLeft: 'clamp' }), padding: '0 28px 24px' }}>{children}</div>
    </div>
  )
}

/** 화살표 커서. path 키프레임을 따라 움직이고 clicks 프레임에서 눌림 효과 */
export function Cursor({ path, clicks = [] }: { path: { f: number; x: number; y: number }[]; clicks?: number[] }) {
  const frame = useCurrentFrame()
  if (frame < path[0].f - 6) return null
  const fs = path.map((p) => p.f)
  const x = interpolate(frame, fs, path.map((p) => p.x), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const y = interpolate(frame, fs, path.map((p) => p.y), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT })
  const press = Math.max(0, ...clicks.map((c) => 1 - Math.abs(frame - c) / 5))
  const ring = Math.max(0, ...clicks.map((c) => (frame >= c && frame < c + 16 ? (frame - c) / 16 : 0)))
  const fadeIn = prog(frame, path[0].f - 6, 8)
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 50, opacity: fadeIn, pointerEvents: 'none' }}>
      {ring > 0 && <div style={{ position: 'absolute', left: -18 * ring - 4, top: -18 * ring - 4, width: 8 + 36 * ring, height: 8 + 36 * ring, borderRadius: '50%', border: `2px solid ${C.accent}`, opacity: 1 - ring }} />}
      <svg width="28" height="28" viewBox="0 0 24 24" style={{ transform: `scale(${1 - press * 0.12})`, transformOrigin: '4px 3px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }}>
        <path d="M4 2.5 L4 19 L8.6 14.9 L11.4 21.2 L14.2 20 L11.5 13.8 L17.6 13.6 Z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** 단계 목록(레퍼런스의 Progress 카드): 진행 중 = 파란 테두리, 완료 = 파란 원 + 체크 */
export function StepList({ items, startAt, every, doneLag = 18, size = 'md' }: { items: string[]; startAt: number; every: number; doneLag?: number; size?: 'md' | 'lg' }) {
  const frame = useCurrentFrame()
  const fz = size === 'lg' ? 22 : 19
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: size === 'lg' ? 18 : 14 }}>
      {items.map((t, i) => {
        const shownAt = startAt + i * every
        const p = prog(frame, shownAt, 12)
        const done = frame >= shownAt + every + doneLag - 6 && i < items.length
        const active = frame >= shownAt && !done
        const check = prog(frame, shownAt + every + doneLag - 6, 8)
        return (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, ...appearStyle(p, 0, 8) }}>
            <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1.6px solid ${active || done ? C.accent : C.dim}`, display: 'grid', placeItems: 'center', fontSize: 12, color: active ? C.accent : C.dim, fontFamily: FONT.num }}>{i + 1}</div>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.accent, transform: `scale(${check})`, display: 'grid', placeItems: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M5 12.5 L10 17 L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" strokeDashoffset={24 * (1 - check)} />
                </svg>
              </div>
            </div>
            <span style={{ fontSize: fz, color: done ? C.text : active ? C.text : C.muted }}>{t}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 선택 목록(레퍼런스의 선택지 카드): 번호 키캡 + 마우스 올림 강조 */
export function OptionList({ options, startAt, every = 5, hover, selected }: { options: { title: string; sub?: string; right?: ReactNode }[]; startAt: number; every?: number; hover?: number | null; selected?: number | null }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {options.map((o, i) => {
        const p = prog(frame, startAt + i * every, 12)
        const on = hover === i || selected === i
        return (
          <div
            key={o.title + i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 14px',
              margin: '0 -14px',
              borderRadius: 12,
              background: selected === i ? C.accentSoft : on ? C.rowHover : 'transparent',
              boxShadow: selected === i ? `inset 0 0 0 1.5px ${C.accent}55` : 'none',
              ...appearStyle(p, 0, 8),
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 500 }}>{o.title}</div>
              {o.sub && <div style={{ fontSize: 15, color: C.dim, marginTop: 2 }}>{o.sub}</div>}
            </div>
            {o.right}
            <div style={{ width: 28, height: 28, borderRadius: 7, background: selected === i ? C.accent : '#EFEFF1', color: selected === i ? '#fff' : C.muted, display: 'grid', placeItems: 'center', fontSize: 14, fontFamily: FONT.num }}>{i + 1}</div>
          </div>
        )
      })}
    </div>
  )
}

export type SourceKind = 'engine' | 'rule' | 'draft' | 'llm' | 'human' | 'input'
const SRC: Record<SourceKind, { label: string; fg: string; bg: string; glyph: string }> = {
  engine: { label: '엔진 계산', fg: '#FFFFFF', bg: C.ink, glyph: '∑' },
  rule: { label: '규칙 기반', fg: C.muted, bg: '#EFEFF1', glyph: '≡' },
  draft: { label: 'AI 초안(예시)', fg: C.warn, bg: C.warnSoft, glyph: '✎' },
  llm: { label: 'AI 생성', fg: C.violet, bg: C.violetSoft, glyph: '✦' },
  human: { label: '사람 판단', fg: C.ok, bg: C.okSoft, glyph: '✓' },
  input: { label: '고객 입력', fg: C.muted, bg: '#EFEFF1', glyph: '✐' },
}
/** 출처 배지: 색만이 아니라 기호와 글자로 구분(웹앱의 SourceBadge 와 같은 규칙) */
export function SourceTag({ kind, label, style }: { kind: SourceKind; label?: string; style?: CSSProperties }) {
  const s = SRC[kind]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', ...style }}>
      <span style={{ fontFamily: FONT.num, fontSize: 13 }}>{s.glyph}</span>
      {label ?? s.label}
    </span>
  )
}

export function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: '#EFEFF1', color: C.muted, fontSize: 14, whiteSpace: 'nowrap', ...style }}>{children}</span>
  )
}

/** 자막: 하단 중앙의 차분한 알약. 문장이 바뀔 때 짧게 교차 */
export function Captions({ cues }: { cues: { from: number; to: number; text: string }[] }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const cue = cues.find((c) => t >= c.from && t <= c.to)
  if (!cue) return null
  const p = Math.min(prog(frame, cue.from * fps, 8), 1 - prog(frame, cue.to * fps - 6, 6))
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', zIndex: 80 }}>
      <div
        style={{
          maxWidth: 1400,
          padding: '14px 30px',
          borderRadius: 18,
          background: 'rgba(14, 14, 16, 0.82)',
          color: '#fff',
          fontSize: 34,
          fontFamily: FONT.sans,
          lineHeight: 1.35,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          textAlign: 'center',
          wordBreak: 'keep-all',
          opacity: p,
          transform: `translateY(${(1 - p) * 6}px)`,
        }}
      >
        {cue.text}
      </div>
    </div>
  )
}

/** 숫자 카운트업(정수 원 단위 값의 표시만 변화. 최종값은 엔진 값 그대로) */
export function countUp(frame: number, start: number, dur: number, value: number) {
  const p = prog(frame, start, dur)
  return Math.round(value * p)
}
