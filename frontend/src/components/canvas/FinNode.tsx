import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { motion } from 'motion/react'
import { NODE_META, NODE_ORIGIN } from '@/services/adapters/topic'
import { SOURCE_META } from '@/components/ui'
import type { NodeKind } from '@/types/api'
import { cn } from '@/utils/format'

export type FinNodeData = {
  kind: NodeKind
  label: string
  detail: string
  value?: string
  dim?: boolean
  live?: boolean
  /** 추론 재생 중 현재 단계 */
  active?: boolean
  /** 추론 재생에서 이미 지나간 단계 */
  visited?: boolean
}
export type FinFlowNode = Node<FinNodeData, 'fin'>

function FinNodeImpl({ data, selected }: NodeProps<FinFlowNode>) {
  const meta = NODE_META[data.kind]
  const origin = NODE_ORIGIN[data.kind]
  const src = SOURCE_META[data.live ? 'rule' : origin.source]
  const Icon = meta.icon
  const lit = selected || data.active
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: data.dim ? 0.3 : 1, y: 0, scale: data.active ? 1.04 : 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 300 }}
      className={cn('relative w-[228px] overflow-hidden rounded-[18px] bg-white/85 text-left backdrop-blur-md transition-shadow', lit ? 'shadow-[0_0_0_1.5px_var(--accent),0_14px_30px_-14px_rgba(36,56,86,.45)]' : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,.9),0_10px_24px_-14px_rgba(36,56,86,.35)]')}
    >
      <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full" style={{ background: meta.color, opacity: data.visited || lit ? 1 : 0.5 }} />
      <Handle type="target" position={Position.Left} />
      <div className="px-3.5 py-3 pl-4">
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} aria-hidden />
          <span>{meta.label}</span>
          {data.live ? (
            <span className="ml-auto rounded-full bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] px-1.5 py-px text-[10px] text-danger">규칙 탐지</span>
          ) : (
            <span className="ml-auto flex items-center gap-0.5 rounded-full bg-white/80 px-1.5 py-px text-[10px] text-dim shadow-[inset_0_0_0_1px_var(--hair)]" title={src.help}>
              <src.icon className="h-2.5 w-2.5" aria-hidden />
              {origin.short}
            </span>
          )}
        </div>
        <div className="mt-1 text-[13.5px] leading-snug text-fg">{data.label}</div>
        {data.value && <div className="num mt-1.5 text-[19px] font-light text-fg">{data.value}</div>}
      </div>
      <Handle type="source" position={Position.Right} />
    </motion.div>
  )
}

export const FinNode = memo(FinNodeImpl)
