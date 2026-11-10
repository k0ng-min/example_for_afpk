import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { errorText } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import type { ActionItem } from '@/types/api'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, Input, NumberField, Panel, Segmented, Skeleton, selectClass } from '@/components/ui'
import { cn, won } from '@/utils/format'

const STATUS: { value: ActionItem['status']; label: string }[] = [
  { value: 'todo', label: '할 일' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'done', label: '완료' },
  { value: 'blocked', label: '보류' },
]

export default function ActionPlanner() {
  const client = useCurrentClient()
  const revision = useApp((s) => s.revision)
  const bump = useApp((s) => s.bump)
  const topicVersion = useApp((s) => s.topic?.version.id)
  const data = useAsync(() => api.actions(client!.id), [client?.id, revision, topicVersion], { enabled: !!client })
  const [items, setItems] = useState<ActionItem[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ActionItem['status']>('all')
  useEffect(() => {
    if (data.data) setItems(data.data.items)
  }, [data.data])

  if (!client) return <div className="p-8 text-muted">고객을 선택하세요.</div>
  const dirty = !!data.data && (JSON.stringify(items) !== JSON.stringify(data.data.items) || !data.data.saved)
  const set = (i: number, patch: Partial<ActionItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const save = async (list = items) => {
    setSaving(true)
    setErr(null)
    try {
      const saved = await api.saveActions(client.id, list)
      data.setData({ items: saved, saved: true })
      setMsg('실행계획을 저장했습니다.')
      bump()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  const done = items.filter((i) => i.status === 'done').length
  const visible = items.map((it, i) => ({ it, i })).filter(({ it }) => filter === 'all' || it.status === filter)

  return (
    <div className="pb-12">
      <PageHeader
        title="실행 계획"
        subtitle="할 일의 우선순위·날짜·금액·진행 상태를 관리합니다."
        actions={
          <>
            <Button
              onClick={() => {
                const d = new Date()
                d.setMonth(d.getMonth() + 1)
                setItems([...items, { id: `act_${Date.now().toString(36)}`, title: '새 실행 항목', priority: 2, targetDate: d.toISOString().slice(0, 10), amount: 0, status: 'todo', reviewCondition: '', notes: '', templateId: null }])
              }}
            >
              <Plus className="h-4 w-4" /> 항목 추가
            </Button>
            <Button variant="primary" onClick={() => save()} disabled={!dirty} loading={saving}>
              <Save className="h-4 w-4" /> 저장
            </Button>
          </>
        }
      />
      <div className="space-y-4 px-5 sm:px-8 lg:px-10">
        {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
        {err && <ErrorNote message={err} />}
        {msg && !dirty && <p className="text-[13px] text-ok">{msg}</p>}
        {data.data && !data.data.saved && <p className="text-[13px] text-warn">저장 전 초안입니다.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `전체 ${items.length}` }, ...STATUS.map((s) => ({ value: s.value, label: `${s.label} ${items.filter((x) => x.status === s.value).length}` }))]} />
          <div className="flex min-w-[220px] items-center gap-3 text-[13px] text-muted">
            진행률
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
            </div>
            <span className="num text-fg">
              {done}/{items.length}
            </span>
          </div>
        </div>
        {!data.data && !data.error && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-[24px]" label={i === 0 ? '실행 계획 불러오는 중' : undefined} />)}
        <div className="space-y-2.5">
          {visible.map(({ it, i }) => (
            <Panel key={it.id} className={cn('p-4', it.status === 'done' && 'opacity-70')}>
              <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto]">
                <div className="flex items-center gap-3">
                  <Badge tone={it.priority === 1 ? 'danger' : it.priority === 2 ? 'warn' : 'neutral'} className="shrink-0">
                    P{it.priority}
                  </Badge>
                  <Input value={it.title} maxLength={120} onChange={(e) => set(i, { title: e.target.value })} aria-label="실행 항목" className={cn(it.status === 'done' && 'line-through')} />
                </div>
                <Segmented size="sm" value={it.status} onChange={(v) => set(i, { status: v })} options={STATUS} />
              </div>
              <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[90px_150px_170px_1fr_auto]">
                <label className="text-[12px] text-dim">
                  우선순위
                  <select aria-label="우선순위" className={cn(selectClass, "mt-1 w-full")} value={it.priority} onChange={(e) => set(i, { priority: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[12px] text-dim">
                  목표 날짜
                  <Input type="date" className="mt-1" value={it.targetDate} onChange={(e) => set(i, { targetDate: e.target.value })} />
                </label>
                <label className="text-[12px] text-dim">
                  예상 금액
                  <NumberField className="mt-1" value={it.amount} min={0} onChange={(v) => set(i, { amount: v })} />
                </label>
                <label className="text-[12px] text-dim">
                  재점검 조건
                  <Input className="mt-1" value={it.reviewCondition} maxLength={300} onChange={(e) => set(i, { reviewCondition: e.target.value })} />
                </label>
                <Button size="icon" variant="ghost" aria-label="항목 삭제" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {it.templateId && <div className="mt-2 text-[11px] text-dim">주제 템플릿 {it.templateId}에서 생성 · {won(it.amount)}</div>}
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}
