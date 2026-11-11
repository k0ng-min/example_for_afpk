// Scene 1 — 문제 제기: 고객의 돈·일정 카드가 흩어져 떠다니고, 한 줄 문제 제기가 떠오른다.
import { interpolate, useCurrentFrame } from 'remotion'
import { Stage, appearStyle, prog, useAppear } from '../components/motion'
import { Chip } from '../components/ui'
import { cardValue } from '../data'
import { C, FONT, SHADOW } from '../design/tokens'
import type { SceneProps } from './types'

// 카드 자리(1920×1080 기준). 가운데는 제목 자리로 비워 둔다
const SPOTS = [
  [170, 150, -3],
  [720, 110, 2],
  [1290, 160, -2],
  [1510, 400, 3],
  [1330, 650, -2],
  [760, 700, 2],
  [200, 640, 3],
  [110, 390, -2],
] as const

export function Problem({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const titleIn = prog(frame, 150, 26)
  const dim = interpolate(frame, [150, 190], [1, 0.42], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Stage>
      <div style={{ position: 'absolute', left: 80, top: 60, ...appearStyle(prog(frame, 4, 16)) }}>
        <Chip tone="muted">{cfg.targetCustomer}</Chip>
      </div>
      {cfg.problemCards.map((c, k) => (
        <FloatCard key={c.label} k={k} label={c.label} value={cardValue(snap, c)} tag={c.tag} dim={dim} />
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 410, textAlign: 'center', ...appearStyle(titleIn, 0, 18) }}>
        <div style={{ fontSize: 22, color: C.muted, marginBottom: 14, letterSpacing: '0.02em' }}>{cfg.financialChallenge}</div>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: '-0.035em', color: C.ink }}>{cfg.hook}</div>
      </div>
    </Stage>
  )
}

function FloatCard({ k, label, value, tag, dim }: { k: number; label: string; value: string; tag?: string; dim: number }) {
  const frame = useCurrentFrame()
  const [x, y, rot] = SPOTS[k % SPOTS.length]
  const a = useAppear(10 + k * 9)
  const drift = Math.sin((frame + k * 23) / 38) * 6
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + drift,
        minWidth: 300,
        whiteSpace: 'nowrap',
        padding: '20px 24px',
        borderRadius: 20,
        background: C.card,
        boxShadow: `${SHADOW.card}, inset 0 0 0 1px ${C.cardLine}`,
        transform: `rotate(${rot * (1 - a * 0.5)}deg) scale(${0.92 + 0.08 * a})`,
        opacity: Math.min(1, a) * dim,
        filter: `blur(${(1 - Math.min(1, a)) * 8}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, color: C.muted }}>{label}</span>
        {tag && <Chip tone="warn" style={{ fontSize: 13, padding: '3px 10px' }}>{tag}</Chip>}
      </div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em', fontFamily: FONT.num }}>{value}</div>
    </div>
  )
}
