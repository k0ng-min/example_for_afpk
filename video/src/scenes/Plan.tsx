// Scene 7 — 실행 계획과 보고서: 잔액 점검선 규칙 카드가 놓이고, 오른쪽에서 보고서가 섹션별로 조립된다.
import { useCurrentFrame } from 'remotion'
import { Stage, appearStyle, prog } from '../components/motion'
import { AppWindow, Chip, PanelTitle } from '../components/ui'
import { cardValue } from '../data'
import { C, FONT, SHADOW } from '../design/tokens'
import type { SceneProps } from './types'

export function Plan({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const repAt = 140
  const swapNav = frame >= repAt ? 7 : 6
  return (
    <Stage>
      <AppWindow brand={cfg.brand} title={cfg.ideaTitle} nav={cfg.navItems} active={swapNav} style={{ left: 160, top: 80, width: 1600, height: 760, ...appearStyle(prog(frame, 0, 16)) }}>
        <div style={{ position: 'absolute', left: 40, top: 32, width: 700 }}>
          <PanelTitle>실행 계획 · 언제 무엇을 바꾸나</PanelTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 26 }}>
            {cfg.planRules.map((r, k) => {
              const at = 20 + k * 22
              const when = r.from ? cardValue(snap, r) : null
              return (
                <div key={r.when} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '22px 24px', borderRadius: 18, background: C.card, boxShadow: `${SHADOW.card}, inset 0 0 0 1px ${C.cardLine}`, ...appearStyle(prog(frame, at, 14), 0, 12) }}>
                  <span style={{ width: 44, height: 44, borderRadius: 22, background: C.ink, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FONT.num, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>{k + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, color: C.muted }}>{r.when}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>→ {r.action}</div>
                  </div>
                  {when && <Chip tone="warn">예상 {when}</Chip>}
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 22, fontSize: 17, color: C.muted, ...appearStyle(prog(frame, 100, 14)) }}>매달 말 실제 잔액을 기록하면 계획과 비교하고, 그 잔액에서 다시 계산합니다.</div>
        </div>
        {/* 보고서 조립 */}
        <div style={{ position: 'absolute', left: 820, top: 30, width: 720, height: 640 }}>
          {[2, 1].map((d) => (
            <div key={d} style={{ position: 'absolute', left: d * 14, top: d * 12, width: 640, height: 600, borderRadius: 14, background: '#fff', boxShadow: `inset 0 0 0 1px ${C.hair}`, opacity: prog(frame, repAt - 10 + d * 4, 14) * 0.9 }} />
          ))}
          <div style={{ position: 'absolute', left: 0, top: 0, width: 640, height: 600, borderRadius: 14, background: '#fff', boxShadow: `${SHADOW.lift}, inset 0 0 0 1px ${C.cardLine}`, padding: '34px 40px', ...appearStyle(prog(frame, repAt, 18), 0, 20) }}>
            <div style={{ fontSize: 13, letterSpacing: '0.2em', color: C.dim, fontFamily: FONT.num }}>{cfg.brand} REPORT</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em' }}>{cfg.ideaTitle}</div>
            <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>재무설계 보고서 · {snap.client.name}(가상)</div>
            <div style={{ height: 1, background: C.hair, margin: '20px 0 14px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 22px' }}>
              {cfg.reportSections.map((t, k) => {
                const at = repAt + 22 + k * 9
                const done = prog(frame, at + 8, 8)
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, ...appearStyle(prog(frame, at, 10), 0, 6) }}>
                    <span style={{ width: 24, height: 24, borderRadius: 12, background: done > 0.5 ? C.ink : '#EFEFF1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13 }}>{done > 0.5 ? '✓' : ''}</span>
                    <span style={{ fontSize: 18 }}>
                      <span style={{ color: C.dim, fontFamily: FONT.num, marginRight: 6 }}>{k + 1}</span>
                      {t}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 9, opacity: prog(frame, repAt + 120, 16) }}>
              {[0.95, 0.82, 0.9, 0.6].map((w, k) => (
                <div key={k} style={{ height: 10, width: `${w * 100}%`, borderRadius: 5, background: '#EFEFF1' }} />
              ))}
            </div>
            <div style={{ position: 'absolute', right: 32, bottom: 26, opacity: prog(frame, repAt + 140, 14) }}>
              <Chip tone="ink">인쇄 · PDF 저장</Chip>
            </div>
          </div>
        </div>
      </AppWindow>
    </Stage>
  )
}
