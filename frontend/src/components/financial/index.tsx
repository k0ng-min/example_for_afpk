import { AlertTriangle, Info, OctagonAlert } from 'lucide-react'
import { motion } from 'motion/react'
import type { EngineWarning, Insight, Metric } from '@/types/api'
import { HelpTip, Readout } from '@/components/ui'
import { cn, formatMetric, shortMetric } from '@/utils/format'

/** KPI 줄: 카드 대신 하나의 면 위에 수치를 나열 */
export function KpiStrip({ metrics, keys }: { metrics: Metric[]; keys: string[] }) {
  const items = keys.map((k) => metrics.find((m) => m.key === k)).filter((m): m is Metric => !!m)
  return (
    <div className="surface grid grid-cols-2 gap-x-6 gap-y-5 rounded-[14px] px-5 py-4 lg:grid-cols-4">
      {items.map((m) => (
        <motion.div key={m.key + (m.value ?? 'na')} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} title={m.formula}>
          <Readout label={m.label} value={shortMetric(m.unit, m.value)} sub={m.formula} tone={m.unit === 'won' && (m.value ?? 0) < 0 ? 'danger' : undefined} />
        </motion.div>
      ))}
    </div>
  )
}

const sevMeta = {
  critical: { icon: OctagonAlert, cls: 'text-danger', bar: 'bg-danger', label: '심각' },
  warning: { icon: AlertTriangle, cls: 'text-warn', bar: 'bg-warn', label: '주의' },
  info: { icon: Info, cls: 'text-cyan', bar: 'bg-cyan', label: '참고' },
} as const

/** 인사이트: 심각도 막대 + 제목 + 근거 수식. 테두리 카드 없이 행으로 나열 */
export function InsightList({ insights, empty = '현재 규칙 기준으로 탐지된 위험이 없습니다.' }: { insights: Insight[]; empty?: string }) {
  if (!insights.length) return <p className="text-[13px] text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-[var(--hair)]">
      {insights.map((i) => {
        const m = sevMeta[i.severity]
        return (
          <li key={i.id} className="relative flex gap-3 py-3 pl-3.5 first:pt-1">
            <span className={cn('absolute top-3.5 bottom-3 left-0 w-[2px] rounded-full first:top-1.5', m.bar)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-medium">
                <m.icon className={cn('h-3.5 w-3.5', m.cls)} aria-label={m.label} />
                {i.title}
                <HelpTip label="계산 근거">
                  근거 · {i.formula}
                  <span className="mt-1 block text-dim">{i.source === 'rule_engine' ? '규칙 엔진' : i.source}</span>
                </HelpTip>
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{i.message}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function WarningList({ warnings }: { warnings: EngineWarning[] }) {
  if (!warnings.length) return null
  return (
    <ul className="space-y-1.5">
      {warnings.map((w, i) => (
        <li key={w.code + i} className={cn('flex items-start gap-2 text-[12.5px]', w.severity === 'critical' ? 'text-danger' : 'text-warn')}>
          {w.severity === 'critical' ? <OctagonAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="심각" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="주의" />}
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function MetricLine({ m }: { m: Metric | undefined }) {
  if (!m) return null
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hair)] py-2 text-[13px] last:border-0">
      <span className="text-muted">{m.label}</span>
      <span className="num text-fg">{formatMetric(m.unit, m.value)}</span>
    </div>
  )
}
