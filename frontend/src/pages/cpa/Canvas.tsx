import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, Calculator, ChevronRight, ClipboardCheck, Flag, ShieldAlert, UserRound } from 'lucide-react'
import { cn } from '@/utils/format'
import { useCpa, STATUS_META, type ExpStatus } from '@/features/cpa/store'
import { evalClaim, useExperimentStatuses } from '@/features/cpa/verify'
import { STRATEGY_META, man, ym } from '@/features/cpa/meta'
import type { Analysis } from '@/features/cpa/types'
import { PageTitle } from '@/components/cpa/Shell'
import { Help, Prov, Skel } from '@/components/cpa/ui'

type Kind = 'input' | 'engine' | 'ai' | 'check' | 'risk' | 'action'
const KIND: Record<Kind, { label: string; origin: string; icon: typeof Bot; cls: string; dot: string }> = {
  input: { label: '고객 입력', origin: '사용자 입력·팀 가정(합성 데이터)', icon: UserRound, cls: 'border-[#dcdce0] bg-white', dot: 'bg-[#a1a1aa]' },
  engine: { label: '계산 엔진', origin: 'Rust 엔진이 입력값으로 계산(결정론적)', icon: Calculator, cls: 'border-[#c8c8cc] bg-[#f7f7f8]', dot: 'bg-sky' },
  ai: { label: 'AI 제안', origin: '생성형 AI(Gemini) 원출력 — 검증 전 가설', icon: Bot, cls: 'border-[#d9d1f0] bg-[#faf8ff]', dot: 'bg-violet-ink' },
  check: { label: '검증 결과', origin: 'AI 주장 ↔ 엔진 독립 계산 대조', icon: ClipboardCheck, cls: 'border-[#cfe5dc] bg-[#f6fbf9]', dot: 'bg-good' },
  risk: { label: '위험 신호', origin: 'Rust 엔진 계산', icon: ShieldAlert, cls: 'border-[#f1d4cc] bg-[#fffaf8]', dot: 'bg-alert' },
  action: { label: '실행·전환 규칙', origin: '검증된 결과로 사람이 확정', icon: Flag, cls: 'border-[#dcdce0] bg-white', dot: 'bg-good' },
}

type D = { kind: Kind; title: string; value: string; facts: [string, string][]; link: { to: string; label: string }; status?: ExpStatus; dim?: boolean }
type FNode = Node<D, 'cpa'>

const CpaNode = memo(function CpaNode({ data, selected }: NodeProps<FNode>) {
  const k = KIND[data.kind]
  const Icon = k.icon
  return (
    <div className={cn('w-[210px] rounded-2xl border px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,.05),0_10px_24px_-16px_rgba(0,0,0,.3)] transition-[box-shadow,opacity]', k.cls, selected && 'ring-2 ring-sky/50', data.dim && 'opacity-40')}>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" id="t" position={Position.Top} className="!opacity-0" />
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-2">
        <span className={cn('h-1.5 w-1.5 rounded-full', k.dot)} />
        {k.label}
        <Icon className="ml-auto h-3.5 w-3.5 text-ink-3" />
      </div>
      <div className="mt-1 text-[13px] leading-snug font-semibold text-ink">{data.title}</div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{data.value}</div>
      {data.status && <span className={cn('mt-1.5 inline-block rounded-full px-2 py-[1px] text-[10.5px] font-semibold', STATUS_META[data.status].cls)}>{STATUS_META[data.status].label}</span>}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <Handle type="source" id="b" position={Position.Bottom} className="!opacity-0" />
      <Handle type="source" id="l" position={Position.Left} className="!opacity-0" />
      <Handle type="source" id="up" position={Position.Top} className="!opacity-0" />
      <Handle type="target" id="r" position={Position.Right} className="!opacity-0" />
      <Handle type="target" id="dn" position={Position.Bottom} className="!opacity-0" />
    </div>
  )
})

const nodeTypes = { cpa: CpaNode }
const EXP_IDS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']

export default function Canvas() {
  const a = useCpa((s) => s.analysis)
  const ver = useExperimentStatuses(EXP_IDS)
  const [sel, setSel] = useState<string>('n5')
  const graph = useMemo(() => (a ? build(a, ver) : null), [a, ver])
  const node = graph?.nodes.find((n) => n.id === sel)
  return (
    <div>
      <PageTitle
        eyebrow="3단계 · 재무상태 분석"
        title="AI 분석"
        lead="고객 상황에서 실행 규칙까지, 이 사례의 판단이 어떻게 이어지는지 보여 줍니다. 각 카드에는 그 결과를 누가 만들었는지(고객 입력·계산 엔진·AI·검증)를 표시했습니다."
      />
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white/80 px-2.5 py-1 text-ink-2">
            <span className={cn('h-2 w-2 rounded-full', KIND[k].dot)} />
            {KIND[k].label}
          </span>
        ))}
      </div>
      {!graph ? (
        <Skel className="h-[560px]" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
          <div className="card h-[440px] overflow-hidden p-0 sm:h-[520px]">
            <ReactFlowProvider>
              <ReactFlow
                nodes={graph.nodes.map((n) => ({ ...n, selected: n.id === sel }))}
                edges={graph.edges.map((e) => ({ ...e, animated: e.source === sel || e.target === sel, className: e.source === sel || e.target === sel ? 'highlighted' : '' }))}
                nodeTypes={nodeTypes}
                onNodeClick={(_, n) => setSel(n.id)}
                fitView
                fitViewOptions={{ padding: 0.08 }}
                minZoom={0.3}
                maxZoom={1.6}
                nodesConnectable={false}
                proOptions={{ hideAttribution: false }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dcdce0" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
          <aside className="card p-4 sm:p-5" aria-live="polite">
            {node && <Detail d={node.data} />}
          </aside>
        </div>
      )}
      <p className="mt-3 text-[12px] text-ink-3">카드를 누르면 오른쪽에 근거가 열립니다. 드래그로 이동, 휠·버튼으로 확대·축소할 수 있습니다.</p>
    </div>
  )
}

function Detail({ d }: { d: D }) {
  const k = KIND[d.kind]
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
        <span className={cn('h-2 w-2 rounded-full', k.dot)} />
        {k.label}
        {d.kind === 'ai' ? <Prov kind="ai" className="ml-auto" /> : d.kind === 'input' ? <Prov kind="assumed" className="ml-auto" /> : <Prov kind="engine" className="ml-auto" />}
      </div>
      <h2 className="mt-1.5 text-[17px] font-semibold text-navy">{d.title}</h2>
      <p className="mt-1 text-[13px] text-ink-2">{d.value}</p>
      <div className="mt-2 rounded-lg bg-[#f6f6f7] px-3 py-2 text-[12px] text-ink-2">
        <b className="text-ink">누가 만들었나</b> · {k.origin}
      </div>
      <dl className="mt-3 space-y-1.5">
        {d.facts.map(([key, v]) => (
          <div key={key} className="flex justify-between gap-3 border-b border-rule/70 pb-1.5 text-[12.5px]">
            <dt className="text-ink-3">{key}</dt>
            <dd className="t-num text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {d.status && (
        <div className="mt-3 flex items-center gap-2 text-[12.5px]">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_META[d.status].cls)}>{STATUS_META[d.status].label}</span>
          <Help>{STATUS_META[d.status].help}</Help>
        </div>
      )}
      <Link to={d.link.to} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-sky hover:underline">
        {d.link.label} <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

function build(a: Analysis, ver: ReturnType<typeof useExperimentStatuses>): { nodes: FNode[]; edges: Edge[] } {
  const i = a.inputs
  const P = (s: string) => a.short.find((p) => p.strategy === s)!
  const A = P('A'),
    B = P('B'),
    D = P('D')
  const pass = a.short.filter((p) => p.missing.length === 0 && p.tau == null && p.insolvent == null).map((p) => p.strategy)
  const fail = a.short.filter((p) => p.missing.length === 0 && (p.tau || p.insolvent))
  const s1 = a.signals.items.find((s) => s.id === 1)!
  const L = a.long
  const top = L.strategies.filter((v) => v.rank === 1)[0]
  // AI 제안·검증 요약(서버 실험 기록 기준)
  const runs = ver.runs ?? []
  const results = runs.flatMap((r) => (r.claims ?? []).map((c) => evalClaim(c, ver.analysisFor(c))))
  const nMatch = results.filter((r) => r.status === 'match').length
  const nErr = results.filter((r) => r.status === 'error').length
  const nRev = results.length - nMatch - nErr
  const checkStatus: ExpStatus = runs.length === 0 ? 'notRun' : nErr ? 'error' : nRev ? 'review' : 'match'

  const spec: [string, Kind, string, string, [string, string][], { to: string; label: string }, ExpStatus?][] = [
    ['n1', 'input', '고객 상황', `가용현금 ${man(i.cash0)} · ${i.currentIncome ? `소득 월 ${man(i.currentIncome)}` : '정기 소득 없음'}`, [['나이', '27세(가상)'], ['상황', 'CPA 2차 마지막 유예'], ['보증금(비유동)', man(i.deposit)], ['학자금(ICL)', man(i.studentLoan)]], { to: '/client', label: '고객 정보에서 수정' }],
    ['n2', 'input', '소득 공백 일정', `공백① ${ym(i.startMonth)}~${ym(i.announceMonth)}* · 공백② 발표 후 L개월`, [['가족 지원 감소', ym(i.supportReduceFrom)], ['시험(임시)', ym(i.examMonth)], ['발표·지원 0원(임시)', ym(i.announceMonth)], ['가장 빠른 첫 급여', ym(a.tolerance[0].earliestPay)]], { to: '/client?g=schedule', label: '일정과 소득 공백 보기' }],
    ['n3', 'input', '월별 필수지출·부채', `월 ${man(i.living + i.examCost)} → ${man(i.living + i.examCostAfter)}`, [['생활비(월세 포함)', man(i.living)], ['수험비', `${man(i.examCost)} → ${man(i.examCostAfter)}`], ['학자금 월 상환', i.iclMonthly ? man(i.iclMonthly) : '0원(소득 전)'], ['그 밖의 채무', man(i.otherDebtPayment)]], { to: '/client?g=flow', label: '18개월 현금흐름 보기' }],
    ['n4', 'input', '최소 안전자금 하한', `${man(i.safetyMin)} · 생활비 3개월분`, [['신호 1', man(i.signal1)], ['신호 2', man(i.signal2)]], { to: '/client?g=basis', label: '계산 기준 보기' }],
    ['n5', 'engine', '18개월 지급능력 판정', pass.length ? `통과 ${pass.join('·')} · 탈락 ${fail.map((p) => p.strategy).join('·') || '없음'}` : '통과 전략 없음', a.short.map((p) => [STRATEGY_META[p.strategy].name, p.missing.length ? '입력 필요' : p.tau ? `하한 도달 ${ym(p.tau)}` : '통과']), { to: '/simulator', label: '시뮬레이션에서 비교' }],
    ['n6', 'engine', '조건부 전략 비교', s1.ruleTrigger ? `신호 1 ${ym(s1.ruleTrigger)} → 근로 시작` : '신호 발동 없음', [['전업(A) 위반', ym(A.tau)], ['조건부(D) 위반', ym(D.tau)], ['병행(B) 18개월 말', man(B.endCash)], ['D 지연 내성', `${a.tolerance.find((t) => t.strategy === 'D')?.months ?? 0}개월`]], { to: '/simulator?tab=uncertainty', label: '합격 후 지연 보기' }],
    ['n7', 'engine', '60개월 가치 비교', L.available ? `1위 ${top ? STRATEGY_META[top.strategy].name : '—'} (통과 전략 중)` : '임금 가정 입력 전 — 계산 보류', L.available ? L.strategies.map((v) => [STRATEGY_META[v.strategy].name, v.feasible ? man(v.value) : '순위 제외']) : [['필요한 가정', '수습·취업 임금']], { to: '/simulator?tab=long', label: '장기 가치 보기' }],
    ['n8', 'ai', 'AI 제안', runs.length ? `실험 ${runs.length}건의 실제 원출력` : '기록된 원출력 없음', runs.slice(0, 5).map((r) => [r.experimentId, `${r.model} · ${new Date(r.ranAt).toLocaleDateString('ko-KR')}`]), { to: '/verification', label: 'AI 원출력 보기' }],
    ['n9', 'check', 'Rust 엔진 검증', results.length ? `주장 ${results.length}건 · 일치 ${nMatch} · 오류 ${nErr} · 검토 ${nRev}` : '대조할 주장 없음', [['계산 일치', `${nMatch}건`], ['오류 발견', `${nErr}건`], ['검토 필요·근거 부족', `${nRev}건`]], { to: '/verification', label: 'AI 검증에서 확인' }, checkStatus],
    ['n10', 'action', '실행 및 전환 규칙', `신호 1~4 · ${a.signals.ruleBreach ? `규칙 실행 시에도 ${ym(a.signals.ruleBreach)} 재상담` : '규칙 실행 시 18개월 유지'}`, [['신호 1', s1.ruleTrigger ? `${ym(s1.ruleTrigger)} 예상` : '없음'], ['신호 2', a.signals.items[1].ruleTrigger ? `${ym(a.signals.items[1].ruleTrigger)} 예상` : '없음'], ['신호 3·4', `${ym(i.announceMonth)}* 발표 시`]], { to: '/plan', label: '실행 계획 보기' }],
    ['r1', 'risk', '위험 신호', A.tau ? `전업 유지 시 ${ym(A.tau)} 하한 도달` : '18개월 내 하한 도달 없음', [['하한 도달(A)', ym(A.tau)], ['월중 지급 불가(A)', ym(A.insolvent)], ['하한 도달(D)', ym(D.tau)]], { to: '/simulator', label: '그래프로 확인' }],
  ]
  // 3행 지그재그: 1행 왼→오, 2행 오→왼, 3행 왼→오. 위험 신호는 판정 아래
  const pos: Record<string, [number, number]> = { n1: [0, 0], n2: [240, 0], n3: [480, 0], n4: [720, 0], n5: [720, 170], n6: [480, 170], n7: [240, 170], n8: [0, 170], n9: [0, 340], n10: [240, 340], r1: [720, 340] }
  const nodes: FNode[] = spec.map(([id, kind, title, value, facts, link, status]) => ({ id, type: 'cpa', position: { x: pos[id][0], y: pos[id][1] }, data: { kind, title, value, facts, link, status } }))
  const E = (s: string, t: string, label?: string, sh?: string, th?: string): Edge => ({ id: `${s}-${t}`, source: s, target: t, label, sourceHandle: sh, targetHandle: th, type: 'smoothstep' })
  const edges = [E('n1', 'n2'), E('n2', 'n3'), E('n3', 'n4'), E('n4', 'n5', '하한 비교', 'b', 't'), E('n5', 'r1', '위반 시', 'b', 't'), E('n5', 'n6', '통과·탈락', 'l', 'r'), E('n6', 'n7', '통과 전략만', 'l', 'r'), E('n7', 'n8', '초안 요청', 'l', 'r'), E('n8', 'n9', '주장 대조', 'b', 't'), E('n9', 'n10', '사람이 확정')]
  return { nodes, edges }
}
