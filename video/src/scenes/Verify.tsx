// Scene 6 — AI 검증: 실제 AI 원출력의 주장을 엔진 값과 한 줄씩 대조하고 판정 도장을 찍는다. 이어서 전체 집계와 검증 단계.
import { useCurrentFrame } from 'remotion'
import { Stage, StepList, appearStyle, countUp, prog } from '../components/motion'
import { AppWindow, Chip, EngineTag, PanelTitle } from '../components/ui'
import { man } from '../data'
import { C, FONT, SHADOW } from '../design/tokens'
import type { SceneProps } from './types'

export function Verify({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const v = snap.verification
  const rowEvery = 70
  const totalsAt = 40 + v.claims.length * rowEvery + 10
  return (
    <Stage>
      <AppWindow brand={cfg.brand} title={cfg.ideaTitle} nav={cfg.navItems} active={5} style={{ left: 160, top: 80, width: 1600, height: 760, ...appearStyle(prog(frame, 0, 16)) }}>
        <div style={{ position: 'absolute', left: 40, top: 32, right: 40 }}>
          <PanelTitle tag={<Chip tone="violet" style={{ fontSize: 13.5, padding: '4px 11px' }}>✦ 실제 AI 원출력 · {v.claims[0]?.model}</Chip>}>AI 검증 · 주장별 대조</PanelTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 170px 170px 170px', gap: 0, marginTop: 24, fontSize: 16, color: C.dim, padding: '0 20px' }}>
            <span>실험</span>
            <span>AI가 한 말</span>
            <span style={{ textAlign: 'right' }}>AI 값</span>
            <span style={{ textAlign: 'right' }}>
              엔진 계산값
            </span>
            <span style={{ textAlign: 'center' }}>판정</span>
          </div>
          {v.claims.map((c, k) => {
            const at = 40 + k * rowEvery
            const stamp = prog(frame, at + 34, 10)
            const ok = c.status === 'match'
            return (
              <div key={c.exp} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 170px 170px 170px', alignItems: 'center', marginTop: 12, padding: '18px 20px', borderRadius: 16, background: C.card, boxShadow: `${SHADOW.card}, inset 0 0 0 1px ${C.cardLine}`, ...appearStyle(prog(frame, at, 14), 0, 10) }}>
                <span style={{ fontFamily: FONT.num, fontSize: 22, fontWeight: 700 }}>{c.exp}</span>
                <span style={{ fontSize: 19, paddingRight: 20 }}>
                  “{c.text}”<span style={{ display: 'block', fontSize: 14.5, color: C.dim, marginTop: 2 }}>{c.what}</span>
                </span>
                <span style={{ textAlign: 'right', fontSize: 24, fontWeight: 600, color: ok ? C.text : C.danger, textDecoration: !ok && stamp > 0.5 ? 'line-through' : 'none' }}>{man(c.ai)}</span>
                <span style={{ textAlign: 'right', fontSize: 24, fontWeight: 700, opacity: prog(frame, at + 18, 12) }}>{man(c.engine)}</span>
                <span style={{ display: 'grid', placeItems: 'center' }}>
                  <span style={{ opacity: stamp, transform: `scale(${1.6 - 0.6 * stamp}) rotate(${-6 * (1 - stamp)}deg)` }}>
                    <Chip tone={ok ? 'ok' : 'danger'} style={{ fontSize: 18 }}>{ok ? '✓ 계산 일치' : '✕ 오류 발견'}</Chip>
                  </span>
                </span>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 40, marginTop: 34, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 14, ...appearStyle(prog(frame, totalsAt, 16)) }}>
              {[
                { label: '추출한 주장', v: v.totals.claims, tone: C.text },
                { label: '계산 일치', v: v.totals.match, tone: C.ok },
                { label: '오류 발견', v: v.totals.error, tone: C.danger },
                { label: '검토 필요', v: v.totals.review, tone: C.warn },
              ].map((t) => (
                <div key={t.label} style={{ width: 170, padding: '16px 18px', borderRadius: 16, background: C.card, boxShadow: `inset 0 0 0 1px ${C.hair}` }}>
                  <div style={{ fontSize: 15.5, color: C.muted }}>{t.label}</div>
                  <div style={{ fontSize: 44, fontWeight: 600, color: t.tone, fontFamily: FONT.num }}>{countUp(frame, totalsAt, 24, t.v)}</div>
                </div>
              ))}
            </div>
            <div style={{ ...appearStyle(prog(frame, totalsAt + 20, 14)) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 19, fontWeight: 700 }}>검증 순서</span>
                <EngineTag label="독립 계산" />
              </div>
              <StepList items={cfg.verificationProcess.steps} startAt={totalsAt + 26} every={20} doneLag={8} />
            </div>
          </div>
        </div>
      </AppWindow>
    </Stage>
  )
}
