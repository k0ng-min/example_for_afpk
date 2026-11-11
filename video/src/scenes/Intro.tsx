// Scene 2 — 소개: 브랜드가 떠오르고, 하나의 워크스페이스 창이 펼쳐지며 "두 번의 소득 공백" 타임라인이 그려진다.
import { interpolate, useCurrentFrame } from 'remotion'
import { EASE_IN_OUT, Stage, appearStyle, prog } from '../components/motion'
import { AppWindow } from '../components/ui'
import { ym } from '../data'
import { C, FONT } from '../design/tokens'
import type { SceneProps } from './types'

export function Intro({ cfg, snap }: SceneProps) {
  const frame = useCurrentFrame()
  const brandIn = prog(frame, 0, 24)
  const toWin = prog(frame, 70, 34, EASE_IN_OUT)
  const winW = interpolate(toWin, [0, 1], [520, 1600])
  const winH = interpolate(toWin, [0, 1], [150, 620])
  const months = snap.months
  // 타임라인: 시작 ~ 발표 + 9개월
  const startI = 0
  const annI = months.indexOf(snap.client.announceMonth)
  const total = annI + 10
  const W = 1360
  const xAt = (i: number) => (i / total) * W
  const draw = prog(frame, 140, 50, EASE_IN_OUT)
  const g1 = prog(frame, 175, 22)
  const g2 = prog(frame, 200, 22)
  return (
    <Stage>
      <div style={{ position: 'absolute', left: 0, right: 0, top: interpolate(toWin, [0, 1], [430, 90]), textAlign: 'center', ...appearStyle(brandIn) }}>
        <div style={{ fontFamily: FONT.num, fontSize: interpolate(toWin, [0, 1], [30, 22]), letterSpacing: '0.32em', color: C.muted, fontWeight: 500 }}>{cfg.brand}</div>
        <div style={{ fontSize: interpolate(toWin, [0, 1], [84, 44]), fontWeight: 700, letterSpacing: '-0.035em', marginTop: 6 }}>{cfg.ideaTitle}</div>
      </div>
      {toWin > 0 && (
        <AppWindow brand={cfg.brand} title={cfg.ideaTitle} nav={cfg.navItems} active={0} reveal={prog(frame, 100, 20)} style={{ left: (1920 - winW) / 2, top: interpolate(toWin, [0, 1], [560, 250]), width: winW, height: winH, opacity: toWin }}>
          <div style={{ position: 'absolute', left: 120, top: 70, width: W }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', ...appearStyle(prog(frame, 120, 18)) }}>한 번의 합격, 두 번의 소득 공백</div>
            <div style={{ position: 'relative', height: 300, marginTop: 50 }}>
              {/* 기준선 */}
              <div style={{ position: 'absolute', left: 0, top: 150, height: 4, width: W * draw, background: C.ink, borderRadius: 4 }} />
              {/* 공백 ① */}
              <Gap x={xAt(startI)} w={xAt(annI + 1) - xAt(startI)} p={g1} label={cfg.gaps[0].label} sub={cfg.gaps[0].sub} tone="warn" />
              {/* 공백 ② */}
              <Gap x={xAt(annI + 1)} w={xAt(total) - xAt(annI + 1)} p={g2} label={cfg.gaps[1].label} sub={cfg.gaps[1].sub} tone="danger" />
              {[
                { i: startI, t: `분석 시작 ${ym(snap.client.startMonth)}` },
                { i: months.indexOf(snap.client.examMonth), t: `제2차 시험 ${ym(snap.client.examMonth)}*` },
                { i: annI, t: `합격 발표 ${ym(snap.client.announceMonth)}*` },
              ].map((m, k) => (
                <div key={m.t} style={{ position: 'absolute', left: xAt(m.i) - 8, top: 142, ...appearStyle(prog(frame, 150 + k * 10, 14)) }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', border: `4px solid ${C.ink}` }} />
                  <div style={{ position: 'absolute', top: 34, left: -10, fontSize: 18, color: C.text, whiteSpace: 'nowrap', fontWeight: 600 }}>{m.t}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 15, color: C.dim, ...appearStyle(prog(frame, 220, 14)) }}>* 2027년 일정은 시행계획 공고 전 임시(2026년 일정 기준)</div>
          </div>
        </AppWindow>
      )}
    </Stage>
  )
}

function Gap({ x, w, p, label, sub, tone }: { x: number; w: number; p: number; label: string; sub: string; tone: 'warn' | 'danger' }) {
  const fg = tone === 'warn' ? C.warn : C.danger
  const bg = tone === 'warn' ? C.warnSoft : C.dangerSoft
  return (
    <div style={{ position: 'absolute', left: x, top: 20, width: w * p, height: 100, borderRadius: 16, background: bg, boxShadow: `inset 0 0 0 1.5px ${fg}55`, overflow: 'hidden', opacity: Math.min(1, p * 2) }}>
      <div style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: fg }}>{label}</div>
        <div style={{ fontSize: 16, color: C.muted, marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  )
}
