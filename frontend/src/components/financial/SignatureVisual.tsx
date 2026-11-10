// 주제별 전용 시각화. signatureVisual id(허용 목록)로 선택되며 모두 Rust 계산 결과를 입력으로 받는다.
import { useMemo } from 'react'
import type { Comparison, SignatureVisual as Visual, TopicConfig, VerificationResponse } from '@/types/api'
import { cn, formatMetric, manwon } from '@/utils/format'
import { LinesChart } from '@/components/charts'

type Props = { topic: TopicConfig; comparison: Comparison; verification?: VerificationResponse | null }

export function SignatureVisual({ topic, comparison, verification }: Props) {
  const v: Visual = topic.signatureVisual
  if (!comparison.scenarios.length) return null
  switch (v) {
    case 'commitment_graph':
      return <CommitmentGraph comparison={comparison} />
    case 'contagion_map':
      return <ContagionMap comparison={comparison} />
    case 'care_timeline':
      return <CareTimeline comparison={comparison} topic={topic} />
    case 'goal_discovery':
      return <GoalMatrix comparison={comparison} />
    case 'verification_court':
      return <Court verification={verification} />
    default:
      return <LinesChart series={comparison.scenarios.map((s) => ({ id: s.scenarioId, name: s.name, color: s.color, values: s.projection.rows.map((r) => r.netWorth) }))} />
  }
}

/** 소득이 생활비·가족 약속·부채·미래 목표로 배분되는 흐름(1개월 차, 기준 시나리오) */
function CommitmentGraph({ comparison }: { comparison: Comparison }) {
  const base = comparison.scenarios.find((s) => s.scenarioId === comparison.baselineId) ?? comparison.scenarios[0]
  const r = base.projection.rows[1]
  const parts = [
    { label: '생활비', value: r.livingExpenses, color: '#3060a8' },
    { label: '가족 지원', value: r.familySupport, color: '#7e60c6' },
    { label: '부채 상환', value: r.debtPayment, color: '#b57d22' },
    { label: '미래 목표 적립', value: Math.max(r.netCashflow, 0), color: '#20907a' },
  ].filter((p) => p.value > 0)
  const total = Math.max(r.income, parts.reduce((a, b) => a + b.value, 0), 1)
  const H = 220
  let y = 10
  const slots = parts.map((p) => {
    const h = Math.max(6, (p.value / total) * (H - 20 - parts.length * 6))
    const s = { ...p, y, h }
    y += h + 6
    return s
  })
  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
      <svg viewBox={`0 0 420 ${H}`} className="w-full" role="img" aria-label={`1개월 차 소득 ${manwon(r.income)} 배분: ${parts.map((p) => `${p.label} ${manwon(p.value)}`).join(", ")}`}>
        <rect x="8" y="10" width="26" height={H - 20} rx="5" fill="color-mix(in oklab, var(--accent) 30%, transparent)" stroke="var(--accent)" />
        <text x="21" y={H / 2} transform={`rotate(-90 21 ${H / 2})`} textAnchor="middle" fontSize="11" fill="var(--text)">
          월 소득 {manwon(r.income)}
        </text>
        {slots.map((s, i) => {
          const srcY = 10 + (slots.slice(0, i).reduce((a, b) => a + b.value, 0) / total) * (H - 20)
          const srcH = (s.value / total) * (H - 20)
          return (
            <g key={s.label}>
              <path d={`M34 ${srcY} C 180 ${srcY}, 180 ${s.y}, 300 ${s.y} L300 ${s.y + s.h} C 180 ${s.y + s.h}, 180 ${srcY + srcH}, 34 ${srcY + srcH} Z`} fill={s.color} fillOpacity="0.28" />
              <rect x="300" y={s.y} width="8" height={s.h} rx="2" fill={s.color} />
              <text x="316" y={s.y + s.h / 2 - 2} fontSize="11.5" fill="var(--text)">{s.label}</text>
              <text x="316" y={s.y + s.h / 2 + 12} fontSize="11" fill="var(--text-muted)" className="num">
                {manwon(s.value)} · {((s.value / total) * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}
      </svg>
      <div>
        <p className="mb-2 text-[13px] text-muted">시나리오별 목표 달성 시점</p>
        <div className="space-y-2">
          {comparison.scenarios.map((s) => (
            <div key={s.scenarioId} className="rounded-[10px] bg-s2 px-3 py-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted">
                {s.projection.summary.goals.map((g) => (
                  <span key={g.goalId} className={g.onTrack ? '' : 'text-warn'}>
                    {g.name}: <span className="num">{g.achievedMonth ? `${g.achievedMonth}개월` : '미달성'}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 사업 → 가계 전염 경로. 전염액이 가장 큰 시나리오를 기준으로 선 두께를 계산 */
function ContagionMap({ comparison }: { comparison: Comparison }) {
  const worst = useMemo(() => [...comparison.scenarios].sort((a, b) => b.projection.summary.totalHouseholdTransfer - a.projection.summary.totalHouseholdTransfer)[0], [comparison])
  const s = worst.projection.summary
  const transfer = s.totalHouseholdTransfer
  const w = transfer > 0 ? Math.min(14, 3 + transfer / 5_000_000) : 1.5
  const node = (x: number, y: number, title: string, value: string, tone: 'accent' | 'danger' | 'ok') => (
    <g>
      <rect x={x - 70} y={y - 30} width="140" height="60" rx="12" fill="var(--panel-solid)" stroke={tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--accent)'} strokeOpacity="0.8" />
      <text x={x} y={y - 6} textAnchor="middle" fontSize="12" fill="var(--text)">{title}</text>
      <text x={x} y={y + 13} textAnchor="middle" fontSize="12" fill="var(--text-muted)" className="num">{value}</text>
    </g>
  )
  return (
    <div>
      <svg viewBox="0 0 640 230" className="w-full" role="img" aria-label={`가계·사업 전염 경로: 가장 불리한 시나리오 ${worst.name}에서 사업 부족분이 가계로 넘어간 총액 ${manwon(transfer)}`}>
        <path d="M150 70 L250 70" stroke="var(--line-strong)" strokeWidth="2" />
        <path d="M390 70 C 450 70, 430 160, 490 160" stroke={transfer > 0 ? 'var(--danger)' : 'var(--line-strong)'} strokeWidth={w} fill="none" className={transfer > 0 ? 'thread-flow' : ''} />
        <path d="M150 160 L490 160" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="3 6" />
        {node(80, 70, '사업 매출 충격', worst.name, 'accent')}
        {node(320, 70, '사업 운영자금', s.businessCashDepletedMonth ? `${s.businessCashDepletedMonth}개월 차 소진` : '소진 없음', s.businessCashDepletedMonth ? 'danger' : 'ok')}
        {node(80, 160, '가계 소득', manwon(worst.projection.rows[1]?.income ?? 0), 'accent')}
        {node(560, 160, '가계 현금(최저)', manwon(s.minCash), s.minCash < 0 ? 'danger' : 'ok')}
        <text x="455" y="105" fontSize="12" fill={transfer > 0 ? 'var(--danger)' : 'var(--text-muted)'}>{transfer > 0 ? `전염 ${manwon(transfer)}` : '전염 없음'}</text>
      </svg>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {comparison.scenarios.map((sc) => (
          <div key={sc.scenarioId} className="rounded-[10px] bg-s2 px-3 py-2 text-[12px]">
            <div className="flex items-center gap-1.5 text-[13px] text-fg">
              <span className="h-2 w-2 rounded-sm" style={{ background: sc.color }} />
              {sc.name}
            </div>
            <div className="mt-1 text-muted">가계→사업 이전 <span className="num text-fg">{manwon(sc.projection.summary.totalHouseholdTransfer)}</span></div>
            <div className="text-muted">가계 최저 현금 <span className={cn('num', sc.projection.summary.minCash < 0 ? 'text-danger' : 'text-fg')}>{manwon(sc.projection.summary.minCash)}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 위기 발생 구간을 표시한 현금 잔액 타임라인 */
function CareTimeline({ comparison, topic }: { comparison: Comparison; topic: TopicConfig }) {
  const preset = topic.scenarioPresets.find((p) => p.adjustments.events.length > 0)
  const start = preset ? Math.min(...preset.adjustments.events.map((e) => e.startMonth)) : null
  const series = comparison.scenarios.map((s) => ({ id: s.scenarioId, name: s.name, color: s.color, values: s.projection.rows.map((r) => r.cash) }))
  const reserve = comparison.scenarios[0].projection.summary.emergencyReserve
  return (
    <div>
      <LinesChart series={series} height={250} refY={reserve} refLabel={`비상예비자금 목표 ${manwon(reserve)}`} bands={start ? [{ from: start, to: Math.min(start + 3, comparison.scenarios[0].projection.summary.horizonMonths), label: '위기 초기 대응 구간' }] : undefined} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {comparison.scenarios.map((s) => (
          <div key={s.scenarioId} className="rounded-[10px] bg-s2 px-3 py-2 text-[12px] text-muted">
            <div className="text-[13px] text-fg">{s.name}</div>
            최저 현금 <span className="num text-fg">{manwon(s.projection.summary.minCash)}</span> ({s.projection.summary.minCashMonth}개월 차)
            <br />월 순현금흐름(말기) <span className="num text-fg">{manwon(s.projection.rows[s.projection.rows.length - 1].netCashflow)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 목표 × 시나리오 달성 시점 행렬 */
function GoalMatrix({ comparison }: { comparison: Comparison }) {
  const goalNames = Array.from(new Set(comparison.scenarios.flatMap((s) => s.projection.summary.goals.map((g) => g.name))))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px]">
        <thead>
          <tr>
            <th className="py-2 pr-3 text-left font-medium text-muted">목표 \ 우선순위 시나리오</th>
            {comparison.scenarios.map((s) => (
              <th key={s.scenarioId} className="px-2 py-2 text-left font-medium">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goalNames.map((name) => (
            <tr key={name} className="border-t border-line">
              <td className="py-2.5 pr-3 text-fg">{name}</td>
              {comparison.scenarios.map((s) => {
                const g = s.projection.summary.goals.find((x) => x.name === name)
                if (!g) return <td key={s.scenarioId} className="px-2 text-dim">제외</td>
                return (
                  <td key={s.scenarioId} className="px-2">
                    <div className={cn('inline-flex flex-col rounded-md border px-2 py-1', g.onTrack ? 'border-[color-mix(in_oklab,var(--ok)_40%,transparent)]' : 'border-[color-mix(in_oklab,var(--warn)_40%,transparent)]')}>
                      <span className={cn('num', g.onTrack ? 'text-ok' : 'text-warn')}>{g.achievedMonth ? `${g.achievedMonth}개월` : '미달성'}</span>
                      <span className="text-[11px] text-dim">{g.priority}순위 · 목표 {g.targetMonth}개월</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** AI 주장 심리 흐름: 주장 → 계산 검증 → 근거 검토 → 판결 */
function Court({ verification }: { verification?: VerificationResponse | null }) {
  if (!verification) return <p className="text-sm text-muted">검증 결과를 불러오는 중입니다.</p>
  const r = verification.results
  const cols = [
    { title: 'AI 주장', count: r.length, desc: '초안에 포함된 주장', tone: 'var(--violet)' },
    { title: '계산 검증', count: r.filter((x) => x.metric).length, desc: '지표가 연결되어 재계산', tone: 'var(--blue)' },
    { title: '오류 발견', count: verification.summary.errorFound, desc: '독립 계산과 불일치', tone: 'var(--danger)' },
    { title: '근거 부족', count: verification.summary.insufficientEvidence + verification.summary.needsReview, desc: '사람의 검토 필요', tone: 'var(--warn)' },
    { title: '판결', count: verification.summary.verified + verification.summary.corrected, desc: '검증 완료 + 수정 완료', tone: 'var(--ok)' },
  ]
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {cols.map((c, i) => (
          <div key={c.title} className="relative rounded-[12px] bg-s2 px-3 py-3">
            <div className="text-[12px] text-muted">{c.title}</div>
            <div className="num mt-1 text-2xl font-medium" style={{ color: c.tone }}>{c.count}</div>
            <div className="text-[11px] text-dim">{c.desc}</div>
            {i < cols.length - 1 && <span className="absolute top-1/2 -right-2 hidden h-px w-2 bg-line-strong md:block" />}
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-[12.5px]">
        {r.slice(0, 5).map((c) => (
          <li key={c.claimId} className="flex items-start justify-between gap-3 border-b border-line pb-1.5">
            <span className="text-muted">{c.statement}</span>
            <span className="num shrink-0 text-dim">{formatMetric(c.unit, c.computedValue)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
