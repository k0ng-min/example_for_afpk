// Scene 3 — 고객 재무정보: 왼쪽에 고객 숫자가 차례로 채워지고, 오른쪽에 공부만 할 때(A)의 잔액이 그려지며 하한 도달 지점이 표시된다.
import { useCurrentFrame } from 'remotion'
import { Stage, appearStyle, countUp, prog } from '../components/motion'
import { AppWindow, EngineTag, LineChart, PanelTitle, Chip } from '../components/ui'
import { man, ym } from '../data'
import { C, FONT } from '../design/tokens'
import type { SceneProps } from './types'

export function Client({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const c = snap.client
  const A = snap.short[0]
  const tauI = A.tau ? snap.months.indexOf(A.tau) : -1
  const rows: { label: string; value: number; note?: string }[] = [
    { label: '보유 현금', value: c.cash0, note: `보증금 ${man(c.deposit)} 제외` },
    { label: '월 필수 생활비', value: c.living },
    { label: '가족 지원(월)', value: c.supportInitial, note: `${ym(c.supportReduceFrom)} 절반 · ${ym(c.supportStopFrom)} 종료` },
    { label: '월 수험비', value: c.examCost },
    { label: '비상금 하한', value: c.safetyMin, note: '필수 생활비 3개월분' },
  ]
  return (
    <Stage>
      <AppWindow brand={cfg.brand} title={cfg.ideaTitle} nav={cfg.navItems} active={1} style={{ left: 160, top: 80, width: 1600, height: 760, ...appearStyle(prog(frame, 0, 16)) }}>
        <div style={{ position: 'absolute', left: 40, top: 36, width: 500 }}>
          <PanelTitle tag={<Chip tone="muted" style={{ fontSize: 13.5, padding: '4px 11px' }}>✐ 고객 입력</Chip>}>고객 정보 · {c.name}</PanelTitle>
          <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r, k) => {
              const at = 14 + k * 12
              return (
                <div key={r.label} style={{ padding: '16px 20px', borderRadius: 16, background: C.card, boxShadow: `inset 0 0 0 1px ${C.hair}`, ...appearStyle(prog(frame, at, 14), 0, 10) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 18, color: C.muted }}>{r.label}</span>
                    <span style={{ fontSize: 28, fontWeight: 600, fontFamily: FONT.num }}>{man(countUp(frame, at, 24, r.value))}</span>
                  </div>
                  {r.note && <div style={{ fontSize: 14.5, color: C.dim, marginTop: 2, textAlign: 'right' }}>{r.note}</div>}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 600, top: 36, width: 960 }}>
          <PanelTitle tag={<EngineTag />}>공부만 계속하면 통장 잔액은</PanelTitle>
          <div style={{ marginTop: 18 }}>
            <LineChart
              uid="client"
              width={960}
              height={500}
              months={snap.months}
              series={[{ values: A.cash, color: C.series[0], label: '' }]}
              floor={{ value: c.safetyMin, label: `비상금 하한 ${man(c.safetyMin)}` }}
              drawStart={90}
              drawDur={120}
              endLabels={false}
              marker={tauI >= 0 ? { index: tauI, value: A.cash[tauI], label: `${ym(A.tau)} 비상금 부족`, at: 220 } : undefined}
            />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, ...appearStyle(prog(frame, 250, 16)) }}>
            <Chip tone="danger">버틸 수 있는 기간 {snap.sensitivity.runwayBase ?? '48+'}개월</Chip>
            <Chip tone="muted">18개월 뒤 잔액 {man(A.endCash)}</Chip>
          </div>
        </div>
      </AppWindow>
    </Stage>
  )
}
