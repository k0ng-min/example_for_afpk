import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyNodeChanges, type Edge, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AnimatePresence, motion } from 'motion/react'
import { LayoutGrid, Pause, Play, RefreshCw, X } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { useAnalysis } from '@/features/topics/useTopicData'
import { api } from '@/services/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { STATUS_META } from '@/features/verification/status'
import { FinNode, type FinFlowNode } from '@/components/canvas/FinNode'
import { NODE_META, NODE_ORIGIN } from '@/services/adapters/topic'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, HelpTip, Skeleton, SourceBadge } from '@/components/ui'
import { cn, formatMetric, manwon, shortMetric } from '@/utils/format'
import type { Metric, NodeKind } from '@/types/api'

const nodeTypes = { fin: FinNode }
const LINK: Partial<Record<NodeKind, { to: string; label: string }>> = {
  client: { to: '/client', label: '고객 정보에서 수정' },
  goal: { to: '/client', label: '목표 수정' },
  scenario: { to: '/scenarios', label: '미래 시뮬레이션에서 비교' },
  ai_proposal: { to: '/verification', label: 'AI 검증에서 판정 확인' },
  evidence: { to: '/verification', label: 'AI 검증에서 확인' },
  action: { to: '/actions', label: '실행 계획에서 관리' },
  risk: { to: '/scenarios', label: '위험 시나리오 확인' },
  analysis: { to: '/scenarios', label: '계산 근거 확인' },
}

function posKey(versionId: string) {
  return `finova.canvas.${versionId}`
}

function Section({ title, source, children }: { title: string; source?: Parameters<typeof SourceBadge>[0]['kind']; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted">
        <span className="font-medium text-fg">{title}</span>
        {source && <SourceBadge kind={source} />}
      </div>
      <div className="rounded-[16px] bg-white/70 p-3.5 text-[12.5px] shadow-[var(--pill-shadow)]">{children}</div>
    </section>
  )
}

function CanvasInner() {
  const topic = useApp((s) => s.topic)!
  const revision = useApp((s) => s.revision)
  const client = useCurrentClient()
  const analysis = useAnalysis(client)
  const verification = useAsync(() => api.verification({ clientId: client!.id }), [client?.id, topic.version.id, revision], { enabled: !!client })
  const [selected, setSelected] = useState<string | null>(null)
  const [nodes, setNodes] = useState<FinFlowNode[]>([])
  const [trace, setTrace] = useState<{ order: string[]; step: number } | null>(null)
  const [ranAt, setRanAt] = useState<number | null>(null)
  // 좁은 화면에서는 전체를 한 번에 맞추면 글자가 읽히지 않으므로 읽을 수 있는 배율로 시작하고 끌어서 이동한다
  const small = useMediaQuery('(max-width: 767px)')
  const cfg = topic.config
  const metrics: Metric[] = analysis.data?.metrics ?? []

  // 기본 배치(주제 구성) + 저장된 사용자 배치 + 분석에서 실시간 탐지된 위험 노드
  const baseNodes = useMemo<FinFlowNode[]>(() => {
    let saved: Record<string, { x: number; y: number }> = {}
    try {
      saved = JSON.parse(localStorage.getItem(posKey(topic.version.id)) ?? '{}')
    } catch {
      saved = {}
    }
    const fromConfig: FinFlowNode[] = cfg.canvas.nodes.map((n) => {
      const m = n.metric ? metrics.find((x) => x.key === n.metric) : undefined
      return {
        id: n.id,
        type: 'fin',
        position: saved[n.id] ?? { x: n.x, y: n.y },
        data: { kind: n.kind, label: n.kind === 'client' && client ? `${client.name} · ${client.age}세` : n.label, detail: n.detail, value: m ? shortMetric(m.unit, m.value) : undefined },
      }
    })
    const live: FinFlowNode[] = (analysis.data?.insights ?? [])
      .filter((i) => i.severity === 'critical')
      .slice(0, 3)
      .map((i, idx) => ({
        id: `live_${i.id}`,
        type: 'fin',
        position: saved[`live_${i.id}`] ?? { x: 160 + idx * 260, y: -170 },
        data: { kind: 'risk', label: i.title, detail: `${i.message}\n근거: ${i.formula}`, value: shortMetric(metrics.find((m) => m.key === i.metric)?.unit, i.value), live: true },
      }))
    return [...fromConfig, ...live]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, analysis.data, client?.id, topic.version.id])

  useEffect(() => setNodes(baseNodes), [baseNodes])
  useEffect(() => {
    if (analysis.data && !analysis.loading) setRanAt(Date.now())
  }, [analysis.data, analysis.loading])

  const clientNode = cfg.canvas.nodes.find((n) => n.kind === 'client')?.id
  const edges: Edge[] = useMemo(() => {
    const e: Edge[] = cfg.canvas.edges.map((x) => ({ id: x.id, source: x.source, target: x.target, label: x.label || undefined, animated: false }))
    for (const n of nodes) if (n.data.live && clientNode) e.push({ id: `e_${n.id}`, source: clientNode, target: n.id, label: '탐지', style: { strokeDasharray: '4 4' } })
    return e.map((x) => {
      if (trace) {
        const a = trace.order.indexOf(x.source)
        const b = trace.order.indexOf(x.target)
        const on = a >= 0 && b >= 0 && a < b && b <= trace.step
        return { ...x, className: on ? 'traced' : undefined, animated: on }
      }
      const hit = !!selected && (x.source === selected || x.target === selected)
      return { ...x, className: hit ? 'highlighted' : undefined, animated: hit }
    })
  }, [cfg.canvas.edges, nodes, selected, clientNode, trace])

  const neighbors = useMemo(() => {
    if (!selected) return null
    const s = new Set([selected])
    for (const e of edges) {
      if (e.source === selected) s.add(e.target)
      if (e.target === selected) s.add(e.source)
    }
    return s
  }, [edges, selected])

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (trace) {
          const i = trace.order.indexOf(n.id)
          return { ...n, selected: false, data: { ...n.data, active: i === trace.step, visited: i >= 0 && i < trace.step, dim: i < 0 || i > trace.step } }
        }
        return { ...n, selected: n.id === selected, data: { ...n.data, active: false, visited: false, dim: !!neighbors && !neighbors.has(n.id) } }
      }),
    [nodes, neighbors, selected, trace],
  )

  // 근거 경로 재생: 고객 노드에서 시작해 연결을 따라 너비 우선으로 한 단계씩 밝힌다(새 계산·AI 호출 없음)
  const traceOrder = useMemo(() => {
    if (!clientNode) return []
    const order = [clientNode]
    const seen = new Set(order)
    for (let i = 0; i < order.length; i++) {
      for (const e of edges) {
        if (e.source === order[i] && !seen.has(e.target)) {
          seen.add(e.target)
          order.push(e.target)
        }
      }
    }
    return order
  }, [edges, clientNode])
  useEffect(() => {
    if (!trace || trace.step >= trace.order.length - 1) return
    const t = window.setTimeout(() => setTrace((tr) => (tr ? { ...tr, step: tr.step + 1 } : tr)), 1100)
    return () => window.clearTimeout(t)
  }, [trace])
  const traceNode = trace ? nodes.find((n) => n.id === trace.order[trace.step]) : null

  const onNodesChange = useCallback(
    (changes: NodeChange<FinFlowNode>[]) => {
      setNodes((ns) => {
        const next = applyNodeChanges(changes, ns)
        if (changes.some((c) => c.type === 'position' && !c.dragging)) {
          try {
            localStorage.setItem(posKey(topic.version.id), JSON.stringify(Object.fromEntries(next.map((n) => [n.id, n.position]))))
          } catch {
            /* 무시 */
          }
        }
        return next
      })
    },
    [topic.version.id],
  )

  const resetLayout = () => {
    try {
      localStorage.removeItem(posKey(topic.version.id))
    } catch {
      /* 무시 */
    }
    setNodes(
      baseNodes.map((n) => {
        const c = cfg.canvas.nodes.find((x) => x.id === n.id)
        return c ? { ...n, position: { x: c.x, y: c.y } } : n
      }),
    )
  }

  const rerun = () => {
    analysis.reload()
    verification.reload()
  }

  const sel = nodes.find((n) => n.id === selected)
  const selCfg = cfg.canvas.nodes.find((n) => n.id === selected)
  const liveInsight = sel?.data.live ? analysis.data?.insights.find((i) => `live_${i.id}` === sel.id) : undefined
  const metricKey = selCfg?.metric ?? liveInsight?.metric
  const selMetric = metricKey ? metrics.find((m) => m.key === metricKey) : undefined
  const connected = edges.filter((e) => e.source === selected || e.target === selected)
  const critical = analysis.data?.insights.filter((i) => i.severity === 'critical') ?? []
  const insights = analysis.data?.insights ?? []
  // 핵심 결론: 규칙 엔진 위험 + 계산 엔진 경고(홈 화면 '지금 확인할 위험'과 같은 기준)
  const findings = [
    ...insights.map((i) => ({ id: i.id, title: i.title, message: i.message, severity: i.severity as string, node: `live_${i.id}` })),
    ...(analysis.data?.projection.warnings ?? []).map((w, k) => ({ id: `${w.code}_${k}`, title: w.message, message: `Rust 엔진 경고 ${w.code}${w.month != null ? ` · ${w.month}개월 차` : ''}`, severity: w.severity, node: '' })),
  ]
  const claims = verification.data?.results ?? []

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="AI 분석 캔버스"
        subtitle="고객·목표·위험·분석·검증 근거가 어떻게 이어지는지 살펴보세요. 노드마다 출처(사용자 입력 / Rust 계산 / 규칙 판정 / AI 초안 / 사람 실행)를 글자로 표시합니다. 노드를 누르면 입력·가정·계산·AI 초안·검증 결과가 열립니다."
        actions={
          <>
            <Button variant="ghost" onClick={resetLayout}>
              <LayoutGrid className="h-4 w-4" /> 기본 배치
            </Button>
            <span className="inline-flex items-center gap-1">
              <Button variant="ghost" onClick={rerun} loading={analysis.loading}>
                <RefreshCw className="h-4 w-4" /> 규칙 분석 다시 실행
              </Button>
              <HelpTip label="규칙 분석 실행이 하는 일" align="right">
                현재 고객 데이터로 Rust 계산 엔진과 규칙 엔진을 다시 실행해 지표·위험 노드·검증 판정을 새로 받아옵니다(POST /api/analysis, /api/verification). LLM은 호출하지 않습니다.
              </HelpTip>
            </span>
            <span className="inline-flex items-center gap-1">
              <Button variant="primary" onClick={() => (trace ? setTrace(null) : (setSelected(null), setTrace({ order: traceOrder, step: 0 })))} disabled={!analysis.data || traceOrder.length < 2}>
                {trace ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {trace ? '재생 종료' : '근거 경로 재생'}
              </Button>
              <HelpTip label="근거 경로 재생이 하는 일" align="right">
                주제 구성에 정의된 연결을 고객 노드부터 한 단계씩 강조해 보여주는 설명용 애니메이션입니다. 새 계산이나 AI 호출은 하지 않습니다.
              </HelpTip>
            </span>
          </>
        }
      />
      {/* 핵심 결론: 캔버스를 살피기 전에 읽을 한 줄 */}
      <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 sm:mx-8 lg:mx-10" aria-live="polite">
        {analysis.error ? (
          <div className="w-full">
            <ErrorNote message={`규칙 분석 실패: ${analysis.error}`} onRetry={rerun} />
          </div>
        ) : !analysis.data ? (
          <Skeleton className="h-8 w-full max-w-xl rounded-full" label="분석 결과 계산 중" />
        ) : (
          <>
            <span className="text-[12px] text-dim">핵심 결론</span>
            {findings.length === 0 && <span className="text-[13px]">규칙·계산 기준으로 탐지된 위험이 없습니다.</span>}
            {findings.slice(0, 3).map((i) => {
              const live = nodes.find((n) => n.id === i.node)
              return (
                <button
                  key={i.id}
                  onClick={() => live && (setTrace(null), setSelected(live.id))}
                  disabled={!live}
                  className={cn('flex max-w-full items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[12.5px] shadow-[var(--pill-shadow)]', live ? 'hover:bg-white' : 'cursor-default')}
                  title={i.message}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', i.severity === 'critical' ? 'bg-danger' : i.severity === 'warning' ? 'bg-warn' : 'bg-cyan')} />
                  <span className="max-w-[420px] truncate">{i.title}</span>
                </button>
              )
            })}
            <span className="ml-auto text-[11.5px] text-dim">
              {analysis.loading ? '다시 계산 중…' : ranAt ? `규칙 분석 ${new Date(ranAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · 규칙 위험 ${insights.length}건(심각 ${critical.length}) · 계산 경고 ${findings.length - insights.length}건` : ''}
            </span>
          </>
        )}
      </div>
      <div className="glass relative mx-5 mb-4 h-[calc(100vh-300px)] min-h-[520px] overflow-hidden rounded-[24px] sm:mx-8 lg:mx-10">
        {!analysis.data && !analysis.error && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <Skeleton className="h-40 w-[min(520px,80%)] rounded-[24px]" />
          </div>
        )}
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) => {
            setTrace(null)
            setSelected(n.id)
          }}
          onPaneClick={() => setSelected(null)}
          fitView
          fitViewOptions={small ? { padding: 0.1, minZoom: 0.75, maxZoom: 0.9, nodes: clientNode ? [{ id: clientNode }] : undefined } : { padding: 0.15 }}
          minZoom={0.25}
          maxZoom={1.8}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="rgba(36,56,86,.14)" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap pannable zoomable nodeColor={(n) => NODE_META[(n.data as { kind: NodeKind }).kind]?.color ?? 'var(--accent)'} maskColor="rgba(220, 228, 238, 0.6)" className={sel ? "!hidden" : "!hidden md:!block"} />
        </ReactFlow>
        <div className="pointer-events-none absolute top-3 left-3 hidden flex-wrap gap-1.5 sm:flex">
          {Object.entries(NODE_META).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] text-muted shadow-[var(--pill-shadow)]">
              <m.icon className="h-3 w-3" style={{ color: m.color }} aria-hidden />
              {m.label}
            </span>
          ))}
        </div>

        <AnimatePresence>
          {traceNode && (
            <motion.div key={traceNode.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass absolute bottom-4 left-1/2 z-20 w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-[22px] bg-white/85 px-5 py-4" aria-live="polite">
              <div className="flex items-center gap-2 text-[11.5px] text-dim">
                <span className="num">
                  {trace!.step + 1} / {trace!.order.length}
                </span>
                <span style={{ color: NODE_META[traceNode.data.kind].color }}>{NODE_META[traceNode.data.kind].label}</span>
                <span>· {traceNode.data.live ? '규칙 탐지' : NODE_ORIGIN[traceNode.data.kind].short}</span>
                <div className="ml-auto h-1 w-28 overflow-hidden rounded-full bg-s4">
                  <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${((trace!.step + 1) / trace!.order.length) * 100}%` }} />
                </div>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[14.5px] font-medium">{traceNode.data.label}</span>
                {traceNode.data.value && <span className="num text-[15px] text-accent">{traceNode.data.value}</span>}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12.5px] whitespace-pre-line text-muted">{traceNode.data.detail}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {sel && (
            <motion.aside
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="glass absolute inset-y-3 right-3 z-20 w-[min(380px,calc(100%-24px))] overflow-y-auto rounded-[22px] bg-white/85 p-5"
              aria-label="노드 상세"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="accent">{NODE_META[sel.data.kind].label}</Badge>
                  <SourceBadge kind={sel.data.live ? 'rule' : NODE_ORIGIN[sel.data.kind].source}>{sel.data.live ? '규칙 엔진 실시간 탐지' : NODE_ORIGIN[sel.data.kind].short}</SourceBadge>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted hover:text-fg" aria-label="상세 패널 닫기">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <h2 className="mt-3 text-[17px] font-medium">{sel.data.label}</h2>
              <p className="mt-1.5 text-[13px] whitespace-pre-line text-muted">{sel.data.detail}</p>

              {(sel.data.kind === 'client' || sel.data.kind === 'goal') && client && (
                <Section title="입력" source="input">
                  {sel.data.kind === 'client' ? (
                    <ul className="space-y-0.5">
                      {[
                        ['월 세후 소득', client.monthlyIncome],
                        ['월 고정지출', client.fixedExpenses],
                        ['월 변동지출', client.variableExpenses],
                        ['월 가족 지원', client.familySupport],
                        ['현금성 자산', client.cashAssets],
                        ['부채 잔액 합계', client.liabilities.reduce((a, l) => a + l.balance, 0)],
                      ].map(([k, v]) => (
                        <li key={k as string} className="flex justify-between text-muted">
                          <span>{k}</span>
                          <span className="num text-fg">{manwon(v as number)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-0.5">
                      {[...client.goals]
                        .sort((a, b) => a.priority - b.priority)
                        .map((g) => (
                          <li key={g.id} className="flex justify-between gap-2 text-muted">
                            <span className="truncate">
                              {g.priority}. {g.name}
                            </span>
                            <span className="num shrink-0 text-fg">
                              {manwon(g.targetAmount)} · {g.targetMonth}개월
                            </span>
                          </li>
                        ))}
                      {!client.goals.length && <li>등록된 목표가 없습니다.</li>}
                    </ul>
                  )}
                </Section>
              )}

              {client && (sel.data.kind === 'client' || sel.data.kind === 'analysis' || sel.data.kind === 'scenario' || sel.data.kind === 'risk') && client.assumptions.length > 0 && (
                <Section title="가정">
                  <ul className="list-disc space-y-0.5 pl-4 text-muted">
                    {client.assumptions.slice(0, 4).map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                  {client.assumptions.length > 4 && <div className="mt-1 text-[11px] text-dim">외 {client.assumptions.length - 4}개 · 고객 정보에서 확인</div>}
                </Section>
              )}

              {selMetric && (
                <Section title="계산" source="engine">
                  <div className="text-[12px] text-muted">{selMetric.label}</div>
                  <div className="num mt-0.5 text-[22px] font-light text-accent">{formatMetric(selMetric.unit, selMetric.value)}</div>
                  <div className="mt-2 text-[12px] text-dim">계산식 · {selMetric.formula}</div>
                  {selMetric.inputs.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[12px]">
                      {selMetric.inputs.map((i) => (
                        <li key={i.label} className="flex justify-between text-muted">
                          <span>{i.label}</span>
                          <span className="num">{new Intl.NumberFormat('ko-KR').format(i.value)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {(sel.data.kind === 'ai_proposal' || sel.data.kind === 'evidence' || sel.data.kind === 'action') && (
                <Section title="AI 초안 주장과 검증 결과" source="draft">
                  {verification.error && <ErrorNote message={verification.error} onRetry={verification.reload} />}
                  {!verification.data && !verification.error && <Skeleton className="h-16" label="검증 결과 불러오는 중" />}
                  <ul className="space-y-2">
                    {claims.map((c) => (
                      <li key={c.claimId} className="border-b border-[var(--hair)] pb-2 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-fg">“{c.statement}”</span>
                          <Badge tone={STATUS_META[c.displayStatus].tone} className="shrink-0">
                            {STATUS_META[c.displayStatus].label}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-dim">
                          {c.computedValue != null ? `독립 계산 ${formatMetric(c.unit, c.computedValue)}` : '독립 계산 불가'}
                          {c.claimedValue != null ? ` · 주장 ${formatMetric(c.unit, c.claimedValue)}` : ''}
                          {c.review && c.review.decision !== 'pending' ? ' · 사람 판단 기록됨' : ' · 사람 판단 전'}
                        </div>
                      </li>
                    ))}
                    {verification.data && claims.length === 0 && <li className="text-muted">이 주제에 등록된 AI 초안 주장이 없습니다.</li>}
                  </ul>
                  <p className="mt-2 text-[11px] text-dim">AI 초안은 주제 구성에 미리 작성된 예시 주장이며, 판정은 Rust 독립 계산과의 수치 대조입니다.</p>
                </Section>
              )}

              {connected.length > 0 && (
                <Section title="연결 관계">
                  <ul className="space-y-1 text-[13px]">
                    {connected.map((e) => {
                      const other = e.source === selected ? e.target : e.source
                      const on = nodes.find((n) => n.id === other)
                      return (
                        <li key={e.id}>
                          <button className="text-left text-fg hover:text-accent" onClick={() => setSelected(other)}>
                            {e.source === selected ? '→ ' : '← '}
                            {on?.data.label}
                            {e.label ? <span className="text-dim"> ({String(e.label)})</span> : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )}
              {LINK[sel.data.kind] && (
                <Link to={LINK[sel.data.kind]!.to} className="mt-5 inline-block text-[13px] text-accent hover:underline">
                  {LINK[sel.data.kind]!.label} →
                </Link>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function ReasoningCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
