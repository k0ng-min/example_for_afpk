// Scene 5 — 시뮬레이션: 네 전략의 18개월 잔액이 함께 그려지고(1단계), 스트레스 테스트 표가 행마다 채워진다(2단계).
import { interpolate, useCurrentFrame } from 'remotion'
import { EASE_IN_OUT, Stage, appearStyle, prog } from '../components/motion'
import { AppWindow, Chip, EngineTag, LineChart, PanelTitle, StrategyBadge } from '../components/ui'
import { man } from '../data'
import { C } from '../design/tokens'
import type { SceneProps } from './types'

export function Simulate({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const swap = prog(frame, 270, 26, EASE_IN_OUT)
  const c = snap.client
  const worst = snap.stress[snap.stress.length - 1]
  const survivors = worst.pass.map((ok, k) => (ok ? snap.short[k].name : null)).filter(Boolean)
  return (
    <Stage>
      <AppWindow brand={cfg.brand} title={cfg.ideaTitle} nav={cfg.navItems} active={4} style={{ left: 160, top: 80, width: 1600, height: 760, ...appearStyle(prog(frame, 0, 16)) }}>
        {/* 1단계: 전략 비교 그래프 */}
        <div style={{ position: 'absolute', left: 40, top: 32, width: 1520, opacity: 1 - swap, transform: `translateX(${-swap * 60}px)`, filter: `blur(${swap * 6}px)` }}>
          <PanelTitle tag={<EngineTag />}>전략 비교 · 18개월 월말 잔액</PanelTitle>
          <div style={{ display: 'flex', gap: 22, marginTop: 14 }}>
            {snap.short.map((s, k) => (
              <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, ...appearStyle(prog(frame, 14 + k * 6, 12)) }}>
                <StrategyBadge i={k} size={24} /> {s.name}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <LineChart
              uid="sim"
              width={1500}
              height={520}
              months={snap.months}
              series={snap.short.map((s, k) => ({ values: s.cash, color: C.series[k], dashed: k === 3, label: `${s.id} ${man(s.endCash)}` }))}
              floor={{ value: c.safetyMin, label: `비상금 하한 ${man(c.safetyMin)}` }}
              drawStart={40}
              drawDur={150}
            />
          </div>
        </div>
        {/* 2단계: 스트레스 테스트 */}
        {swap > 0 && (
          <div style={{ position: 'absolute', left: 40, top: 32, width: 1520, opacity: swap, transform: `translateX(${(1 - swap) * 60}px)` }}>
            <PanelTitle tag={<EngineTag />}>나쁜 일이 생기면 어느 선택지가 버티나</PanelTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '430px repeat(4, 1fr)', gap: 8, marginTop: 22 }}>
              <div />
              {snap.short.map((s, k) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 17, color: C.muted }}>
                  <StrategyBadge i={k} size={24} /> {s.name}
                </div>
              ))}
              {snap.stress.map((row, r) => {
                const at = 300 + r * 22
                const isBase = r === 0
                const isAll = r === snap.stress.length - 1
                return [
                  <div key={`l${r}`} style={{ padding: '19px 20px', borderRadius: 12, background: isBase ? C.ink : isAll ? '#EFEFF1' : 'transparent', color: isBase ? '#fff' : C.text, fontSize: 21, fontWeight: isAll || isBase ? 700 : 500, ...appearStyle(prog(frame, at, 12), 0, 8) }}>
                    {row.label}
                  </div>,
                  ...row.pass.map((ok, k) => {
                    const p = prog(frame, at + 6 + k * 3, 10)
                    return (
                      <div key={`c${r}${k}`} style={{ display: 'grid', placeItems: 'center', borderRadius: 12, background: ok ? C.okSoft : C.warnSoft, color: ok ? C.ok : C.warn, fontSize: 20, fontWeight: 700, opacity: p, transform: `scale(${0.9 + 0.1 * p})` }}>
                        {ok ? '버팀' : '부족'}
                      </div>
                    )
                  }),
                ]
              })}
            </div>
            <div style={{ marginTop: 22, ...appearStyle(prog(frame, 300 + snap.stress.length * 22 + 10, 16)) }}>
              <Chip tone="ink" style={{ fontSize: 19, padding: '9px 18px' }}>
                모든 충격이 한꺼번에 오면 → {survivors.length ? `${survivors.join('·')}만 18개월 버팀` : '버티는 선택지 없음'}
              </Chip>
            </div>
          </div>
        )}
      </AppWindow>
      <div style={{ position: 'absolute', right: 180, top: 120, opacity: interpolate(frame, [200, 215, 262, 272], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <Chip tone="ok" style={{ fontSize: 18 }}>B·C·D는 18개월 동안 하한 위</Chip>
      </div>
    </Stage>
  )
}
