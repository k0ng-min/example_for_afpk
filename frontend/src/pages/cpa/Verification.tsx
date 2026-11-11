import { useEffect, useMemo, useState } from 'react'
import { Bot, Calculator, ClipboardPaste, Download, FileSearch, Play, ShieldCheck, Trash2, UserCheck } from 'lucide-react'
import { cn } from '@/utils/format'
import { errorText } from '@/services/api/client'
import { STATUS_META, cpaApi, emptyLog, normalizeVerdict, useAiLog, useCpa, type ExpLog, type ExpStatus, type RunLog, type Verdict } from '@/features/cpa/store'
import { evalClaim, useExperimentStatuses, type Claim, type ServerRun } from '@/features/cpa/verify'
import { STEPS } from '@/features/cpa/process'
import { STRATEGY_META, man, ym } from '@/features/cpa/meta'
import type { Analysis, CpaInputs, Experiment, ExperimentsDoc, Strategy } from '@/features/cpa/types'
import { PageTitle } from '@/components/cpa/Shell'
import { Btn, Help, Prov, SectionHead, Skel, StrategyBadge, WonInput } from '@/components/cpa/ui'

const IDS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']

function StatusChip({ s, className }: { s: ExpStatus; className?: string }) {
  return (
    <span title={STATUS_META[s].help} className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-[1px] text-[11px] font-semibold whitespace-nowrap', STATUS_META[s].cls, className)}>
      {STATUS_META[s].label}
    </span>
  )
}

export default function Verification() {
  const [doc, setDoc] = useState<ExperimentsDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState('E2')
  const logs = useAiLog((s) => s.logs)
  const ver = useExperimentStatuses(IDS)
  useEffect(() => {
    cpaApi
      .experiments()
      .then(setDoc)
      .catch((e) => setErr(errorText(e)))
  }, [])
  const exp = doc?.experiments.find((e) => e.id === sel)
  const counts = IDS.reduce<Record<string, number>>((m, id) => ({ ...m, [ver.byExp[id]?.status ?? 'notRun']: (m[ver.byExp[id]?.status ?? 'notRun'] ?? 0) + 1 }), {})

  const exportAll = () => {
    if (!doc) return
    const payload = {
      exportedAt: new Date().toISOString(),
      note: '가상 고객(합성 데이터) 사례의 AI 활용·검증 기록. 원출력은 편집하지 않았고, 계산 판정은 Rust 엔진 기본값 계산과의 대조, 최종 판정은 사람이 기록한 것만 포함한다.',
      serverRunsNote: ver.note,
      systemPrompt: doc.systemPrompt,
      experiments: doc.experiments.map((e) => ({
        id: e.id,
        title: e.title,
        method: e.method,
        sources: e.sources,
        status: STATUS_META[ver.byExp[e.id]?.status ?? 'notRun'].label,
        computedStatus: ver.byExp[e.id]?.computed ? STATUS_META[ver.byExp[e.id].computed!].label : null,
        serverRuns: (ver.byExp[e.id]?.runs ?? []).map((r) => ({ ...r, claimResults: (r.claims ?? []).map((c) => ({ claim: c.text, ...evalClaim(c, ver.analysisFor(c)) })) })),
        human: logs[e.id] ?? emptyLog(),
      })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-verification-log-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageTitle
        eyebrow="4단계 · 설계안 검증 · AI 비판적 검증"
        title="AI 검증"
        lead="AI의 답은 정답이 아니라 검증할 가설입니다. 실제 AI 원출력의 주장을 하나씩 떼어 Rust 엔진의 독립 계산·공식 자료와 대조하고, 최종 판정과 수정은 사람이 기록합니다."
        right={
          <Btn variant="line" onClick={exportAll} disabled={!doc}>
            <Download className="h-4 w-4" /> 기록 내보내기(JSON)
          </Btn>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(['notRun', 'match', 'review', 'insufficient', 'error', 'fixed'] as ExpStatus[]).map((s) => (
          <div key={s} className="card px-3 py-2.5">
            <StatusChip s={s} />
            <div className="t-num mt-1 text-[22px] font-light text-navy">{counts[s] ?? 0}<span className="ml-0.5 text-[12px] text-ink-3">건</span></div>
            <div className="text-[11px] leading-snug text-ink-3">{STATUS_META[s].help}</div>
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-3 md:grid-cols-3">
        <ModeCard icon={<Calculator className="h-4 w-4" />} title="계산 엔진(결정론적)" prov="engine" body="잔액·위반월·지연 내성·현재가치는 Rust 엔진이 입력값으로 계산합니다. AI가 만든 숫자를 그대로 쓰지 않습니다." />
        <ModeCard icon={<Bot className="h-4 w-4" />} title="생성형 AI" prov="ai" body={doc ? (doc.ai.configured ? `서버에서 ${doc.ai.model ?? 'Gemini'}를 호출할 수 있습니다(요청 시에만). 키는 서버 환경변수에만 있습니다.` : '서버에 AI 키가 없어 이 화면에서 AI를 실행하지 않습니다. 다른 AI 도구의 원출력을 붙여 넣어 기록할 수 있습니다.') : '상태 확인 중…'} />
        <ModeCard icon={<UserCheck className="h-4 w-4" />} title="사람의 판정" prov="input" body="계산 판정은 자동이지만 최종 판정·수정 내용은 사람이 근거를 적어 기록할 때만 바뀝니다. 아래 ‘AI 1차 검토 의견’은 판정이 아닙니다." />
      </div>

      <section>
        <SectionHead eyebrow="비판적 검증 실험 E1~E8" title="AI가 고객에게 해로운 권고를 내릴 수 있는 지점" help={ver.note || '실험 기록이 없으면 아직 실행하지 않은 것입니다.'} />
        {(err || ver.err) && <div className="mb-3 rounded-lg bg-caution-soft px-4 py-3 text-[13px] text-caution">{err ?? ver.err}</div>}
        {!doc ? (
          <Skel className="h-96" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[290px_1fr]">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {doc.experiments.map((e) => (
                <button key={e.id} onClick={() => setSel(e.id)} aria-pressed={sel === e.id} className={cn('w-[220px] shrink-0 rounded-2xl border p-3 text-left transition-colors lg:w-full', sel === e.id ? 'border-sky/50 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]' : 'border-rule bg-white/70 hover:border-sky-2')}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-sky-soft px-1.5 text-[12px] font-bold text-sky">{e.id}</span>
                    <StatusChip s={ver.byExp[e.id]?.status ?? 'notRun'} className="ml-auto" />
                  </div>
                  <div className="mt-1.5 text-[13px] leading-snug text-ink">{e.title}</div>
                </button>
              ))}
            </div>
            {exp && <ExperimentPanel key={exp.id} doc={doc} exp={exp} serverRuns={ver.byExp[exp.id]?.runs ?? []} analysisFor={ver.analysisFor} status={ver.byExp[exp.id]?.status ?? 'notRun'} computed={ver.byExp[exp.id]?.computed ?? null} />}
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionHead eyebrow="AI 활용 구조" title="AI는 초안을 쓰고, 사람은 검증하고 결정한다" />
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="bg-[#f4f4f5] text-left text-ink-2">
              <tr>
                {['재무설계 단계', 'AI에게 맡기는 일', '사람이 책임지는 일', '남기는 기록'].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STEPS.map((s) => (
                <tr key={s.n} className="border-t border-rule">
                  <td className="px-4 py-2.5 font-medium text-navy">
                    {s.n} {s.title}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{s.ai}</td>
                  <td className="px-4 py-2.5">{s.human}</td>
                  <td className="px-4 py-2.5 text-ink-2">{s.record}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function ModeCard({ icon, title, body, prov }: { icon: React.ReactNode; title: string; body: string; prov: 'engine' | 'ai' | 'input' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-navy">
        {icon} {title} <Prov kind={prov} className="ml-auto" />
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{body}</p>
    </div>
  )
}

function ExperimentPanel({ doc, exp, serverRuns, analysisFor, status, computed }: { doc: ExperimentsDoc; exp: Experiment; serverRuns: ServerRun[]; analysisFor: (c: Claim) => Analysis | undefined; status: ExpStatus; computed: ExpStatus | null }) {
  const log = useAiLog((s) => s.logs[exp.id]) ?? emptyLog()
  const { addRun, removeRun, review } = useAiLog()
  const [prompt, setPrompt] = useState(exp.prompt.replace('{{clientBrief}}', doc.clientBrief))
  const [running, setRunning] = useState(false)
  const [runErr, setRunErr] = useState<string | null>(null)
  const [paste, setPaste] = useState(false)
  const run = async () => {
    setRunning(true)
    setRunErr(null)
    try {
      const r = await cpaApi.run(exp.id, prompt)
      addRun(exp.id, { ...r, source: 'server', tool: 'FINOVA 서버 → Gemini API', id: crypto.randomUUID() })
    } catch (e) {
      setRunErr(errorText(e))
    } finally {
      setRunning(false)
    }
  }
  const claims = serverRuns.flatMap((r) => (r.claims ?? []).map((c) => ({ c, res: evalClaim(c, analysisFor(c)) })))

  return (
    <div className="min-w-0 space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-sky-soft px-2 py-0.5 text-[13px] font-bold text-sky">{exp.id}</span>
          <h3 className="text-[16px] font-semibold text-navy">{exp.title}</h3>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
            {computed && status !== computed && <>계산 판정 <StatusChip s={computed} /> → 사람 판정</>}
            <StatusChip s={status} />
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
          {[
            ['검증할 AI 위험', exp.risk],
            ['틀리면 고객에게 생기는 일', exp.harm],
            ['독립적인 판정 방법', `${exp.method} ${exp.sources.map((s) => `[${s}]`).join(' ')}`],
          ].map(([k, v]) => (
            <div key={k} className="card-soft px-3 py-2">
              <dt className="text-[11.5px] text-ink-3">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {claims.length > 0 && (
        <div className="card p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-navy">
            주장별 대조표 <Prov kind="engine" />
            <Help>AI 원출력에서 떼어 낸 주장마다 Rust 엔진이 같은 기본 가정으로 다시 계산한 값과 비교합니다. 허용 오차 안이면 계산 일치, 벗어나면 오류 발견입니다. 계산으로 판정할 수 없는 가정은 공식 자료가 있으면 검토 필요, 없으면 근거 부족입니다.</Help>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead className="text-left text-ink-3">
                <tr className="border-b border-rule">
                  {['AI 주장', '근거 자료', 'AI 값', '엔진 계산값', '허용 오차', '판정'].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claims.map(({ c, res }) => (
                  <tr key={c.id} className="border-b border-rule/60 align-top">
                    <td className="max-w-[300px] px-2 py-2">
                      <div className="text-ink">“{c.text}”</div>
                      {c.note && <div className="mt-0.5 text-[11.5px] text-ink-3">{c.note}</div>}
                    </td>
                    <td className="px-2 py-2 text-ink-2">{c.sources?.length ? c.sources.map((s) => `[${s}]`).join(' ') : c.kind === 'assumption' ? '없음' : `엔진 · ${c.strategy ? STRATEGY_META[c.strategy].short : ''}${c.month ? ` ${ym(c.month)}` : ''}`}</td>
                    <td className="t-num px-2 py-2">{res.ai}</td>
                    <td className="t-num px-2 py-2">
                      {res.engine}
                      {res.diff && res.diff !== '0' && <div className="text-[11px] text-alert">차이 {res.diff}</div>}
                    </td>
                    <td className="t-num px-2 py-2 text-ink-2">{c.tolerance != null ? `±${man(c.tolerance)}` : c.kind === 'safe' ? '일치 여부' : '—'}</td>
                    <td className="px-2 py-2">
                      <StatusChip s={res.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {serverRuns.map(
            (r) =>
              r.aiReview && (
                <div key={r.id} className="mt-3 rounded-xl border border-violet-ink/15 bg-violet-soft px-3 py-2.5 text-[12.5px]">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2 font-semibold text-violet-ink">
                    AI 1차 검토 의견 <Prov kind="ai" /> <span className="font-normal text-ink-3">{r.aiReview.author} · 판정 아님</span>
                  </div>
                  <div className="text-ink">{r.aiReview.note}</div>
                </div>
              ),
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card flex min-w-0 flex-col p-4">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-navy">
            <Bot className="h-4 w-4 text-violet-ink" /> AI 원출력 <Prov kind="ai" />
          </div>
          <div className="space-y-2">
            {serverRuns.map((r) => (
              <RunCard key={r.id} r={r} shared />
            ))}
            {log.runs.map((r) => (
              <RunCard key={r.id} r={r} onDelete={() => removeRun(exp.id, r.id)} />
            ))}
            {serverRuns.length + log.runs.length === 0 && <div className="rounded-lg border border-dashed border-rule-strong px-3 py-6 text-center text-[12.5px] text-ink-3">기록된 원출력이 없습니다 · 아직 실행하지 않음</div>}
          </div>
          <details className="mt-3 rounded-xl border border-rule bg-white/70 px-3 py-2">
            <summary className="cursor-pointer text-[12.5px] font-medium text-sky">새로 실행하거나 다른 AI의 원출력 기록하기</summary>
            <label className="mt-2 block text-[12px] text-ink-3" htmlFor={`p-${exp.id}`}>
              실험 프롬프트(가상 고객 자료 포함)
            </label>
            <textarea id={`p-${exp.id}`} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} maxLength={6000} className="mt-1 w-full resize-y rounded-lg border border-rule-strong bg-white px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-sky" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn variant="solid" className="h-9" onClick={run} loading={running} disabled={!doc.ai.configured}>
                <Play className="h-4 w-4" /> 서버 AI로 실행
              </Btn>
              <Btn variant="line" className="h-9" onClick={() => setPaste((v) => !v)}>
                <ClipboardPaste className="h-4 w-4" /> 다른 AI 원출력 기록
              </Btn>
            </div>
            {!doc.ai.configured && <p className="mt-1.5 text-[12px] text-caution">서버 AI 미연결 — 실행 결과를 만들어 내지 않습니다.</p>}
            {runErr && <p className="mt-1.5 text-[12px] text-alert">{runErr}</p>}
            {paste && <PasteForm exp={exp} prompt={prompt} onDone={() => setPaste(false)} onSave={(r) => addRun(exp.id, r)} />}
          </details>
        </div>

        <div className="card min-w-0 p-4">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-navy">
            <ShieldCheck className="h-4 w-4 text-good" /> 독립 검증 근거
          </div>
          <p className="text-[13px] leading-relaxed text-ink">{exp.check}</p>
          {exp.sources.length > 0 && (
            <ul className="mt-3 space-y-1 text-[12px] text-ink-2">
              {exp.sources.map((id) => (
                <li key={id} className="flex gap-1.5">
                  <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                  <span>
                    <b className="text-ink">[{id}]</b> {doc.sources.find((s) => s.id === id)?.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-rule pt-3">
            <EngineEvidence id={exp.id} />
          </div>
        </div>
      </div>

      <Review log={log} disabled={serverRuns.length + log.runs.length === 0} onSave={(p) => review(exp.id, p)} />
    </div>
  )
}

function PasteForm({ exp, prompt, onSave, onDone }: { exp: Experiment; prompt: string; onSave: (r: RunLog) => void; onDone: () => void }) {
  const [tool, setTool] = useState('')
  const [model, setModel] = useState('')
  const [at, setAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = tool.trim() && model.trim() && out.trim().length > 20
  const save = async () => {
    setBusy(true)
    let flags: string[] = []
    try {
      flags = (await cpaApi.screen(exp.id, out)).flags
    } catch {
      /* 힌트 실패는 기록을 막지 않는다 */
    }
    onSave({ experimentId: exp.id, provider: 'manual', model: model.trim(), ranAt: new Date(at).toISOString(), systemPrompt: '', prompt, output: out, flags, source: 'manual', tool: tool.trim(), id: crypto.randomUUID() })
    setBusy(false)
    onDone()
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-rule bg-[#f6f6f7] p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="도구 (예: ChatGPT)" aria-label="도구" className="h-9 rounded-lg border border-rule-strong bg-white px-2.5 text-[13px] outline-none focus:border-sky" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="모델명" aria-label="모델명" className="h-9 rounded-lg border border-rule-strong bg-white px-2.5 text-[13px] outline-none focus:border-sky" />
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="실행 시점" className="h-9 rounded-lg border border-rule-strong bg-white px-2.5 text-[13px] outline-none focus:border-sky" />
      </div>
      <textarea value={out} onChange={(e) => setOut(e.target.value)} rows={6} placeholder="AI 응답 전문을 편집 없이 붙여 넣으세요" aria-label="AI 원출력" className="w-full rounded-lg border border-rule-strong bg-white px-3 py-2 text-[12.5px] outline-none focus:border-sky" />
      <div className="flex gap-2">
        <Btn variant="solid" className="h-9" disabled={!ok} loading={busy} onClick={save}>
          원출력 저장
        </Btn>
        <Btn variant="ghost" className="h-9" onClick={onDone}>
          취소
        </Btn>
      </div>
      <p className="text-[11.5px] text-ink-3">기록은 이 브라우저에만 저장되며 JSON으로 내보낼 수 있습니다.</p>
    </div>
  )
}

function RunCard({ r, onDelete, shared }: { r: RunLog; onDelete?: () => void; shared?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-rule bg-white/80">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
        <span className="font-semibold text-ink">{r.tool}</span>
        <span className="text-ink-2">{r.model}</span>
        <span className="t-num text-ink-3">{new Date(r.ranAt).toLocaleString('ko-KR')}</span>
        {shared && <span className="rounded-full bg-[#efeff1] px-1.5 text-[10.5px] text-ink-2">서버 기록</span>}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto text-sky hover:underline" aria-expanded={open}>
          {open ? '접기' : '원출력 보기'}
        </button>
        {onDelete && (
          <button onClick={onDelete} aria-label="이 기록 삭제" className="grid h-6 w-6 place-items-center rounded text-ink-3 hover:bg-alert-soft hover:text-alert">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {r.flags.length > 0 && (
        <div className="border-t border-rule bg-caution-soft/60 px-3 py-2 text-[12px]">
          <div className="mb-0.5 font-semibold text-caution">규칙 기반 힌트 (판정 아님)</div>
          {r.flags.map((f) => (
            <div key={f}>· {f}</div>
          ))}
        </div>
      )}
      {open && <pre className="max-h-[420px] overflow-auto border-t border-rule px-3 py-2 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">{r.output}</pre>}
    </div>
  )
}

function Review({ log, disabled, onSave }: { log: ExpLog; disabled: boolean; onSave: (p: { verdict: Verdict; reason: string; correction: string; reviewer: string }) => void }) {
  const [verdict, setVerdict] = useState<Verdict>(normalizeVerdict(log.verdict))
  const [reason, setReason] = useState(log.reason)
  const [correction, setCorrection] = useState(log.correction)
  const [reviewer, setReviewer] = useState(log.reviewer)
  const opts: { v: Verdict; label: string }[] = [
    { v: 'match', label: '계산 일치 — 엔진·공식 자료와 일치를 확인' },
    { v: 'review', label: '검토 필요 — 추가 확인이 남음' },
    { v: 'insufficient', label: '근거 부족 — 뒷받침할 자료가 없음' },
    { v: 'error', label: '오류 발견 — 권고를 바꿔야 함' },
    { v: 'fixed', label: '수정 완료 — 수정한 권고를 기록함' },
  ]
  const canSave = !disabled && verdict !== 'unset' && reason.trim().length >= 5 && (verdict !== 'fixed' || correction.trim().length >= 5)
  return (
    <div className={cn('card p-4 sm:p-5', disabled && 'opacity-60')}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-navy">
        <UserCheck className="h-4 w-4 text-sky" /> 사람의 판정과 수정 기록
        {log.reviewedAt ? <span className="ml-auto text-[12px] font-normal text-ink-3">마지막 기록 {new Date(log.reviewedAt).toLocaleString('ko-KR')}{log.reviewer ? ` · ${log.reviewer}` : ''}</span> : <span className="ml-auto text-[12px] font-normal text-ink-3">아직 사람의 판정 없음</span>}
      </div>
      {disabled && <p className="mb-2 text-[12.5px] text-ink-2">원출력이 있어야 판정할 수 있습니다.</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {opts.map((o) => (
          <label key={o.v} className={cn('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px]', verdict === o.v ? 'border-sky/50 bg-sky-soft' : 'border-rule bg-white/70')}>
            <input type="radio" name="verdict" className="mt-0.5" disabled={disabled} checked={verdict === o.v} onChange={() => setVerdict(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-[12px] text-ink-3">
          판정 사유와 대조한 근거(필수)
          <textarea disabled={disabled} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-rule-strong bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-sky" />
        </label>
        <label className="text-[12px] text-ink-3">
          수정 전 → 수정 후 고객 권고{verdict === 'fixed' && ' (필수)'}
          <textarea disabled={disabled} value={correction} onChange={(e) => setCorrection(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-rule-strong bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-sky" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input disabled={disabled} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="검토자(팀원 역할)" aria-label="검토자" className="h-9 w-48 rounded-lg border border-rule-strong bg-white px-2.5 text-[13px] outline-none focus:border-sky" />
        <Btn variant="solid" className="h-9" disabled={!canSave} onClick={() => onSave({ verdict, reason, correction, reviewer })}>
          판정 기록
        </Btn>
        <span className="text-[11.5px] text-ink-3">이 브라우저에 저장 · JSON 내보내기에 포함</span>
      </div>
    </div>
  )
}

// ── 엔진 증거: 'AI 가정'과 '검증된 가정'으로 엔진을 다시 실행해 비교 ──
function useWhatIf(patch: Partial<CpaInputs> | null) {
  const inputs = useCpa((s) => s.inputs)
  const [res, setRes] = useState<Analysis | null>(null)
  const key = JSON.stringify(patch)
  useEffect(() => {
    if (!inputs || !patch) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      cpaApi
        .analyze({ ...inputs, ...patch }, ctl.signal)
        .then(setRes)
        .catch(() => undefined)
    }, 200)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, key])
  return res
}

function TauCompare({ base, alt, label, strategies = ['A', 'D'] }: { base: Analysis; alt: Analysis | null; label: string; strategies?: Strategy[] }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="text-ink-3">
        <tr className="border-b border-rule">
          <th className="py-1.5 text-left font-normal">전략</th>
          <th className="py-1.5 text-right font-normal">검증된 가정</th>
          <th className="py-1.5 text-right font-normal">{label}</th>
        </tr>
      </thead>
      <tbody className="t-num">
        {strategies.map((s) => {
          const b = base.short.find((p) => p.strategy === s)!
          const x = alt?.short.find((p) => p.strategy === s)
          return (
            <tr key={s} className="border-b border-rule/60">
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <StrategyBadge s={s} className="h-5 w-5 text-[11px]" /> {STRATEGY_META[s].short}
                </span>
              </td>
              <td className="py-1.5 text-right">하한 도달 {b.tau ? ym(b.tau) : '없음'} · 말 {man(b.endCash)}</td>
              <td className="py-1.5 text-right">{x ? `하한 도달 ${x.tau ? ym(x.tau) : '없음'} · 말 ${man(x.endCash)}` : '계산 중…'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function EngineEvidence({ id }: { id: string }) {
  const a = useCpa((s) => s.analysis)
  const [amount, setAmount] = useState<number>(id === 'E4' ? 150_000 : 700_000)
  const patch = useMemo<Partial<CpaInputs> | null>(() => (id === 'E4' ? { otherDebtPayment: amount } : id === 'E5' ? { unverifiedInflow: amount } : null), [id, amount])
  const alt = useWhatIf(patch)
  if (!a) return <Skel className="h-24" />
  const head = (
    <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-navy">
      엔진 대조(현재 가정) <Prov kind="engine" />
    </div>
  )
  switch (id) {
    case 'E1':
      return (
        <div>
          {head}
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            <div className="card-soft px-3 py-2">
              <div className="text-[11.5px] text-ink-3">2026 유예생 집단 합격률 [S2]</div>
              <div className="t-num text-[16px] text-navy">61.0% = 959 / 1,572명</div>
              <Prov kind="official" />
            </div>
            <div className="card-soft px-3 py-2">
              <div className="text-[11.5px] text-ink-3">엔진의 p 처리</div>
              <div className="text-[13px]">p = {a.inputs.pPct}% (시나리오 조건) — 61%를 자동 적용하지 않음</div>
            </div>
          </div>
        </div>
      )
    case 'E2':
    case 'E7':
      return (
        <div>
          {head}
          <p className="mb-2 text-[12.5px] text-ink-2">{id === 'E2' ? '“합격 즉시 급여” 가정은 지연 L=0과 같습니다. 엔진의 지연 내성:' : '미지정 경로는 소득 0원이 아니라 대체 근로소득으로 계산합니다. 첫 급여 전까지 버틸 수 있는 기간:'}</p>
          <ul className="space-y-1 text-[12.5px]">
            {a.tolerance
              .filter((t) => t.strategy !== 'C')
              .map((t) => (
                <li key={t.strategy} className="flex items-center gap-2">
                  <StrategyBadge s={t.strategy} className="h-5 w-5 text-[11px]" />
                  {t.months == null ? '발표 전 이미 하한 도달' : t.openEnded ? `${t.months}개월 이상 유지` : `${t.months}개월까지 유지 — 그보다 늦으면 하한 도달`}
                </li>
              ))}
          </ul>
        </div>
      )
    case 'E3':
      return (
        <div>
          {head}
          <p className="text-[12.5px] text-ink-2">계산으로 판정할 수 없는 제도 정보입니다. 시행계획 원문 [S9]의 부분합격 조항과 대조합니다(2027년 시행계획은 아직 공고 전). 엔진은 2027년 시험만 모형에 넣습니다.</p>
        </div>
      )
    case 'E4':
    case 'E5':
      return (
        <div>
          {head}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            {id === 'E4' ? 'AI가 넣은 학자금 월 상환액' : 'AI가 넣은 미확인 지원금(월)'}
            <WonInput value={amount} onChange={(v) => setAmount(v ?? 0)} className="w-[120px]" />
            <Help>AI 원출력의 금액을 넣으면 그 가정이 결론을 얼마나 바꾸는지 엔진이 다시 계산합니다.</Help>
          </div>
          <TauCompare base={a} alt={alt} label={id === 'E4' ? 'AI 가정(월정액 상환)' : 'AI 가정(지원금 유입)'} />
          <p className="mt-2 text-[12px] text-ink-2">{id === 'E4' ? '없는 상환액을 넣으면 하한 도달이 앞당겨져 실제보다 비관적인 권고가 됩니다.' : '받지 못할 수 있는 돈을 넣으면 하한 도달이 늦춰져 실제보다 낙관적인 권고가 됩니다.'}</p>
        </div>
      )
    case 'E6':
    case 'E8':
      return (
        <div>
          {head}
          <ul className="space-y-1 text-[12.5px]">
            {a.short.map((p) => (
              <li key={p.strategy} className="flex items-center gap-2">
                <StrategyBadge s={p.strategy} className="h-5 w-5 text-[11px]" />
                {p.missing.length ? '임금 입력 필요' : p.tau ? <span className="text-caution">18개월 내 하한 도달 — {ym(p.tau)}</span> : <span className="text-good">18개월 지급능력 통과</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-2">{id === 'E6' ? '장기 가치는 이 검사를 통과한 전략끼리만 비교합니다.' : '60개월 비교는 투자 수익률을 쓰지 않고 할인율로 현재가치만 비교합니다.'}</p>
        </div>
      )
    default:
      return null
  }
}
