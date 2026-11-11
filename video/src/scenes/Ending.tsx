// Scene 8 — 엔딩: 브랜드와 핵심 메시지, 기대 효과 알약, 하단 출처 표기.
import { useCurrentFrame } from 'remotion'
import { Stage, appearStyle, prog } from '../components/motion'
import { Chip } from '../components/ui'
import { C, FONT } from '../design/tokens'
import type { SceneProps } from './types'

export function Ending({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  return (
    <Stage>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, ...appearStyle(prog(frame, 0, 18)) }}>
          <span style={{ width: 64, height: 7, borderRadius: 7, background: C.ink, margin: '0 auto' }} />
          <span style={{ width: 40, height: 7, borderRadius: 7, background: C.dim, margin: '0 auto' }} />
        </div>
        <div style={{ fontFamily: FONT.num, fontSize: 26, letterSpacing: '0.34em', color: C.muted, marginTop: 26, ...appearStyle(prog(frame, 6, 18)) }}>{cfg.brand}</div>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.035em', marginTop: 10, ...appearStyle(prog(frame, 14, 22)) }}>{cfg.endingMessage}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 34 }}>
          {cfg.expectedBenefits.map((b, k) => (
            <span key={b} style={appearStyle(prog(frame, 40 + k * 8, 14), 0, 8)}>
              <Chip tone="muted" style={{ fontSize: 19, padding: '9px 18px' }}>{b}</Chip>
            </span>
          ))}
        </div>
        <div style={{ fontSize: 19, color: C.muted, marginTop: 34, ...appearStyle(prog(frame, 70, 16)) }}>{cfg.endingSub}</div>
      </div>
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 30, textAlign: 'center', fontSize: 14, color: C.dim, opacity: prog(frame, 80, 16) }}>
        화면의 수치는 FINOVA Rust 계산 엔진 결과 · {snap.meta.note}
      </div>
    </Stage>
  )
}
