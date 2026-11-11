// Scene 4 — AI 분석: 판단 흐름 노드가 차례로 연결되고, 아래에 네 가지 선택지의 18개월 판정 카드가 나타난다. 커서가 D 를 선택.
import { useCurrentFrame } from 'remotion'
import { Cursor, Stage, appearStyle, prog } from '../components/motion'
import { AppWindow, Chip, EngineTag, PanelTitle, StrategyBadge } from '../components/ui'
import { man, ym } from '../data'
import { C, SHADOW } from '../design/tokens'
import type { SceneProps } from './types'

const KIND: Record<string, { label: string; fg: string; bg: string }> = {
  input: { label: '고객 입력', fg: C.muted, bg: '#EFEFF1' },
  engine: { label: '계산 엔진', fg: '#fff', bg: C.ink },
  ai: { label: 'AI 제안', fg: C.violet, bg: C.violetSoft },
  check: { label: '검증', fg: C.ok, bg: C.okSoft },
  action: { label: '실행 규칙', fg: C.warn, bg: C.warnSoft },
}

export function Ai({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const nodes = cfg.aiAnalysis.nodes
  const nodeW = 170
  const gap = (1480 - nodeW * nodes.length) / (nodes.length - 1)
  const nx = (k: number) => 60 + k * (nodeW + gap)
  const every = 14
  const cardsAt = 40 + nodes.length * every + 10
  const selAt = cardsAt + 120
  return (
    <Stage>
      <AppWindow brand={cfg.brand} title={cfg.ideaTitle} nav={cfg.navItems} active={2} style={{ left: 160, top: 80, width: 1600, height: 760, ...appearStyle(prog(frame, 0, 16)) }}>
        <div style={{ position: 'absolute', left: 40, top: 32 }}>
          <PanelTitle>AI 분석 · 판단의 흐름</PanelTitle>
        </div>
        {/* 노드와 연결선 */}
        <svg style={{ position: 'absolute', left: 0, top: 0 }} width={1600} height={300}>
          {nodes.slice(1).map((_, k) => {
            const p = prog(frame, 40 + (k + 1) * every - 6, 12)
            const x1 = nx(k) + nodeW
            const x2 = nx(k + 1)
            return <line key={k} x1={x1} x2={x1 + (x2 - x1) * p} y1={165} y2={165} stroke={C.ink} strokeWidth={2} strokeDasharray="4 5" />
          })}
        </svg>
        {nodes.map((n, k) => {
          const p = prog(frame, 40 + k * every, 14)
          const kd = KIND[n.kind]
          return (
            <div key={n.title} style={{ position: 'absolute', left: nx(k), top: 118, width: nodeW, padding: '14px 14px', borderRadius: 16, background: C.card, boxShadow: `${SHADOW.card}, inset 0 0 0 1px ${C.cardLine}`, ...appearStyle(p, 0, 10) }}>
              <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: kd.bg, color: kd.fg, fontSize: 12.5, fontWeight: 600 }}>{kd.label}</span>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>{n.title}</div>
            </div>
          )
        })}
        {/* 네 가지 선택지 판정 */}
        <div style={{ position: 'absolute', left: 60, top: 300, display: 'flex', alignItems: 'center', gap: 12, ...appearStyle(prog(frame, cardsAt - 10, 14)) }}>
          <span style={{ fontSize: 22, fontWeight: 700 }}>네 가지 선택지 · 18개월을 버티나?</span>
          <EngineTag />
        </div>
        {snap.short.map((s, k) => {
          const p = prog(frame, cardsAt + k * 10, 16)
          const selected = k === 3 && frame >= selAt
          return (
            <div
              key={s.id}
              style={{
                position: 'absolute',
                left: 60 + k * 372,
                top: 360,
                width: 352,
                height: 300,
                padding: 24,
                borderRadius: 20,
                background: C.card,
                boxShadow: selected ? `0 0 0 3px ${C.ink}, ${SHADOW.lift}` : `${SHADOW.card}, inset 0 0 0 1px ${C.cardLine}`,
                ...appearStyle(p, 0, 16),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <StrategyBadge i={k} size={36} />
                <span style={{ fontSize: 24, fontWeight: 700 }}>{s.name}</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 16.5, color: C.muted }}>{cfg.scenarioExamples[k].hint}</div>
              <div style={{ marginTop: 28 }}>
                {s.pass ? <Chip tone="ok">✓ 18개월 버팀</Chip> : <Chip tone="danger">{ym(s.tau ?? s.insolvent)} 비상금 부족</Chip>}
              </div>
              <div style={{ marginTop: 18, fontSize: 16, color: C.dim }}>가장 적을 때 잔액</div>
              <div style={{ fontSize: 30, fontWeight: 600, color: s.minCash < 0 ? C.danger : C.text }}>{man(s.minCash)}</div>
            </div>
          )
        })}
      </AppWindow>
      <Cursor path={[{ f: selAt - 40, x: 1200, y: 980 }, { f: selAt - 4, x: 1470, y: 640 }, { f: selAt + 60, x: 1480, y: 650 }]} clicks={[selAt]} />
    </Stage>
  )
}
