import { useEffect, useState } from 'react'
import { ArrowRight, CheckSquare, Plus, RefreshCw } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { errorText } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import { useAnalysis } from '@/features/topics/useTopicData'
import { DECISION_LABEL, STATUS_META } from '@/features/verification/status'
import type { ClaimInput, VerifiedClaim } from '@/types/api'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, HelpTip, Input, Label, NumberField, Panel, PanelHeader, Skeleton, SourceBadge, Textarea, selectClass } from '@/components/ui'
import { cn, formatMetric } from '@/utils/format'

const UNIT_KO: Record<string, string> = { won: '원', bps: '0.01%', months_x10: '0.1개월', months: '개월', count: '개' }

const customKey = (id: string) => `finova.claims.${id}`
function loadCustom(id: string): ClaimInput[] {
  try {
    return JSON.parse(localStorage.getItem(customKey(id)) ?? '[]')
  } catch {
    return []
  }
}
function storeCustom(id: string, v: ClaimInput[]) {
  try {
    localStorage.setItem(customKey(id), JSON.stringify(v))
  } catch {
    /* 무시 */
  }
}

export default function VerificationLab() {
  const client = useCurrentClient()
  const topic = useApp((s) => s.topic)!
  const revision = useApp((s) => s.revision)
  const analysis = useAnalysis(client)
  const [custom, setCustom] = useState<ClaimInput[]>([])
  const [form, setForm] = useState({ statement: '', metric: 'monthly_surplus', value: 0, useValue: true })
  const clientId = client?.id
  useEffect(() => setCustom(clientId ? loadCustom(clientId) : []), [clientId])

  const draftClaims: ClaimInput[] = topic.config.aiDraftClaims.map((c) => ({ id: c.id, statement: c.statement, metric: c.metric ?? null, claimedValue: c.claimedValue ?? null, scenarioPreset: c.scenarioPreset ?? null, source: 'ai_draft' }))
  const ver = useAsync(() => api.verification({ clientId: client!.id, claims: [...draftClaims, ...custom] }), [client?.id, topic.version.id, revision, JSON.stringify(custom)], { enabled: !!client })

  if (!client) return <div className="p-8 text-muted">고객을 선택하세요.</div>

  const addClaim = () => {
    if (!form.statement.trim()) return
    const next = [...custom, { id: `user_${Date.now().toString(36)}`, statement: form.statement.trim(), metric: form.metric || null, claimedValue: form.useValue ? form.value : null, source: 'user' as const }]
    setCustom(next)
    storeCustom(client.id, next)
    setForm({ ...form, statement: '' })
  }

  const s = ver.data?.summary
  const results = ver.data?.results ?? []
  const decided = results.filter((r) => r.review && r.review.decision !== 'pending').length
  return (
    <div className="pb-12">
      <PageHeader
        title="AI 검증"
        subtitle="AI 초안 주장(주제 구성에 미리 작성된 예시)과 직접 등록한 주장을 Rust 계산 엔진이 독립적으로 다시 계산해 대조합니다. 자동 판정은 수치 일치 여부만 보며, 최종 채택 여부는 사람이 사유와 함께 기록합니다."
        actions={
          <Button onClick={ver.reload} loading={ver.loading}>
            <RefreshCw className="h-4 w-4" /> 독립 계산 다시 실행
          </Button>
        }
      />
      <div className="space-y-5 px-5 sm:px-8 lg:px-10">
        {s ? (
          <div className="surface grid grid-cols-2 gap-x-6 gap-y-4 rounded-[20px] px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            {(['verified', 'error_found', 'needs_review', 'insufficient_evidence', 'corrected'] as const).map((k) => {
              const n = { verified: s.verified, error_found: s.errorFound, needs_review: s.needsReview, insufficient_evidence: s.insufficientEvidence, corrected: s.corrected }[k]
              return (
                <div key={k}>
                  <div className="flex items-center gap-1">
                    <Badge tone={STATUS_META[k].tone}>{STATUS_META[k].label}</Badge>
                    <HelpTip label={`${STATUS_META[k].label} 뜻`}>
                      <span className="block text-fg">{STATUS_META[k].criterion}</span>
                      <span className="mt-1.5 block text-dim">다음 행동 · {STATUS_META[k].next}</span>
                    </HelpTip>
                  </div>
                  <div className="num mt-2.5 text-[28px] leading-none font-extralight">{n}</div>
                </div>
              )
            })}
            <div>
              <SourceBadge kind="human">사람 판단</SourceBadge>
              <div className="num mt-2.5 text-[28px] leading-none font-extralight">
                {decided}
                <span className="unit">/ {results.length}건</span>
              </div>
            </div>
          </div>
        ) : (
          !ver.error && <Skeleton className="h-[92px] rounded-[20px]" />
        )}
        {ver.error && <ErrorNote message={`검증 계산 실패: ${ver.error}`} onRetry={ver.reload} />}
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {!ver.data && !ver.error && [0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-[24px]" label={i === 0 ? '검증 결과 계산 중' : undefined} />)}
            {ver.data && results.length === 0 && <Panel className="p-6 text-[13px] text-muted">검증할 주장이 없습니다. 오른쪽에서 주장을 직접 추가하세요.</Panel>}
            {results.map((r) => (
              <ClaimCard
                key={r.claimId + (r.review?.updatedAt ?? '')}
                r={r}
                clientId={client.id}
                onSaved={ver.reload}
                onRemove={
                  r.source === 'user'
                    ? () => {
                        const next = custom.filter((c) => c.id !== r.claimId)
                        setCustom(next)
                        storeCustom(client.id, next)
                      }
                    : undefined
                }
              />
            ))}
          </div>
          <div className="space-y-5">
            <Panel>
              <PanelHeader title="주장 직접 추가" description="AI 재무 상담 답변이나 보고서 문장을 검증 대상으로 등록합니다. 등록한 주장 문장은 이 브라우저에만 보관되고, 사람 판단 기록은 서버(SQLite)에 저장됩니다." />
              <div className="space-y-3 px-5 pb-5">
                <div>
                  <Label htmlFor="cl-st">주장 문장</Label>
                  <Textarea id="cl-st" rows={2} maxLength={300} value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} placeholder="예: 비상자금은 3개월분 이상이다" />
                </div>
                <div>
                  <Label htmlFor="cl-m">근거 지표</Label>
                  <select id="cl-m" className={cn(selectClass, 'w-full')} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                    <option value="">근거 지표 없음(근거 부족으로 분류)</option>
                    {analysis.data?.metrics.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label
                    hint={
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={form.useValue} onChange={(e) => setForm({ ...form, useValue: e.target.checked })} /> 수치 포함
                      </label>
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      주장 값 <HelpTip label="입력 단위">비율은 0.01% 단위(15% = 1500), 비상자금은 0.1개월 단위(3개월 = 30)로 입력합니다.</HelpTip>
                    </span>
                  </Label>
                  <NumberField value={form.value} suffix={UNIT_KO[analysis.data?.metrics.find((m) => m.key === form.metric)?.unit ?? ''] ?? ''} min={-1_000_000_000_000} max={1_000_000_000_000} onChange={(v) => setForm({ ...form, value: v })} ariaLabel="주장 값" />
                </div>
                <Button variant="primary" onClick={addClaim} disabled={!form.statement.trim()}>
                  <Plus className="h-4 w-4" /> 검증 대상에 추가
                </Button>
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="검증 체크리스트" description={`${topic.config.name} 주제의 verification_rules.json 에서 구성된 사람 점검 항목`} />
              <ul className="space-y-2 px-5 pb-5 text-[13px] text-muted">
                {ver.data?.checklist.map((c) => (
                  <li key={c} className="flex gap-2">
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-dim" />
                    {c}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const BAR = { verified: 'bg-ok', corrected: 'bg-violet', error_found: 'bg-danger', needs_review: 'bg-warn', insufficient_evidence: 'bg-[var(--text-dim)]' } as const

/** 검증 카드: ① 주장 → ② 근거·독립 계산·허용 오차 → ③ 판정 기준·다음 행동 → ④ 사람 검토 기록(검토자·시점·사유·수정 요구) */
function ClaimCard({ r, clientId, onSaved, onRemove }: { r: VerifiedClaim; clientId: string; onSaved: () => void; onRemove?: () => void }) {
  const meta = STATUS_META[r.displayStatus]
  const [decision, setDecision] = useState(r.review?.decision ?? 'pending')
  const [corrected, setCorrected] = useState<number>(r.review?.correctedValue ?? r.computedValue ?? 0)
  const [note, setNote] = useState(r.review?.note ?? '')
  const [request, setRequest] = useState(r.review?.correctedStatement ?? '')
  const [reviewer, setReviewer] = useState(r.review?.reviewer ?? '')
  const [saving, setSaving] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const needsReason = decision === 'rejected' || decision === 'corrected'
  const save = async () => {
    if (needsReason && !note.trim()) {
      setErr('기각·수정 판단에는 판단 사유를 적어 주세요.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      await api.saveReview(clientId, r.claimId, { statement: r.statement, decision, correctedValue: decision === 'corrected' && r.metric ? corrected : null, correctedStatement: request, note, reviewer })
      onSaved()
      setReviewOpen(false)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  const humanOnly = r.displayStatus === 'corrected' && !r.metric
  const decided = !!r.review && r.review.decision !== 'pending'
  return (
    <Panel className="relative overflow-hidden p-5 pl-6">
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', BAR[r.displayStatus])} aria-hidden />
      {/* ① 주장 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-dim">주장</span>
            {r.source === 'ai_draft' ? <SourceBadge kind="draft" /> : r.source === 'user' ? <SourceBadge kind="input">사용자 등록 주장</SourceBadge> : <SourceBadge kind="rule" />}
            {humanOnly && <Badge tone="warn">자동 검증 아님 · 사람 판단으로 처리</Badge>}
          </div>
          <p className="mt-2 text-[15px] font-medium">“{r.statement}”</p>
        </div>
        {onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            삭제
          </Button>
        )}
      </div>

      {/* ② 근거·독립 계산·허용 오차 */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] lg:grid-cols-4">
        <Field k="근거 지표" v={r.metricLabel ?? '연결 없음'} />
        <Field k="주장 값" v={r.claimedValue == null ? '수치 없음' : formatMetric(r.unit, r.claimedValue)} />
        <Field k="독립 계산값 · Rust" v={r.computedValue == null ? '계산 불가' : formatMetric(r.unit, r.computedValue)} strong />
        <Field k="차이 / 허용 오차" v={r.difference != null ? `${formatMetric(r.unit, r.difference)} / ±${formatMetric(r.unit, r.tolerance)}` : '비교 불가'} danger={r.status === 'error_found'} />
      </dl>
      <ToleranceRuler r={r} />
      <details className="mt-2 text-[12px] text-muted">
        <summary className="cursor-pointer text-dim">계산식·입력값 보기</summary>
        <div className="mt-1.5 space-y-1 rounded-[12px] bg-white/50 px-3 py-2">
          <div>계산식 · {r.formula ?? '연결된 계산식 없음'}</div>
          <div>검증 방법 · {r.method}</div>
          {r.inputs.length > 0 && <div>입력 · {r.inputs.map((i) => `${i.label} ${new Intl.NumberFormat('ko-KR').format(i.value)}`).join(', ')}</div>}
          <div className="text-dim">시나리오 · {r.scenarioName} · Rust 계산 엔진</div>
        </div>
      </details>

      {/* ③ 판정 기준과 다음 행동 */}
      <div className="mt-3 grid gap-2 rounded-[16px] bg-white/45 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.7)] sm:grid-cols-[auto_1fr_1fr] sm:items-start sm:gap-5">
        <div className="flex items-center gap-1.5 sm:flex-col sm:items-start sm:gap-1">
          <span className="text-[11px] text-dim">자동 판정</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <div className="text-[12.5px]">
          <span className="block text-[11px] text-dim">판정 기준</span>
          {meta.criterion}
        </div>
        <div className="flex items-start gap-1.5 text-[12.5px]">
          <ArrowRight className="mt-[18px] h-3.5 w-3.5 shrink-0 text-accent max-sm:hidden" aria-hidden />
          <span>
            <span className="block text-[11px] text-dim">다음 행동</span>
            {decided ? '사람 판단이 기록됨 · 필요하면 판단 수정' : meta.next}
          </span>
        </div>
      </div>
      {r.correctedCheck && (
        <div className="mt-2 rounded-[10px] bg-white/45 px-3 py-2 text-[12.5px]">
          수정값 재검증: {formatMetric(r.unit, r.correctedCheck.claimedValue)} →{' '}
          <span className={r.correctedCheck.status === 'verified' ? 'text-ok' : 'text-danger'}>{STATUS_META[r.correctedCheck.status].label}</span>
        </div>
      )}

      {/* ④ 사람 검토 기록 */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-[var(--hair)] pt-3">
        <div className="min-w-0 flex-1 text-[12.5px]">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <SourceBadge kind="human">사람 검토</SourceBadge>
            {r.review ? (
              <Badge tone={r.review.decision === 'approved' ? 'ok' : r.review.decision === 'rejected' ? 'danger' : r.review.decision === 'corrected' ? 'violet' : 'neutral'}>{DECISION_LABEL[r.review.decision]}</Badge>
            ) : (
              <span className="text-dim">아직 기록 없음</span>
            )}
          </div>
          {r.review && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-muted">
              <dt className="text-dim">검토자·시점</dt>
              <dd>
                {r.review.reviewer || '이름 미기재'} · {fmtTime(r.review.updatedAt)}
              </dd>
              <dt className="text-dim">판단 사유</dt>
              <dd>{r.review.note || '—'}</dd>
              {r.review.correctedStatement && (
                <>
                  <dt className="text-dim">수정 요구</dt>
                  <dd>{r.review.correctedStatement}</dd>
                </>
              )}
            </dl>
          )}
        </div>
        <Button size="sm" variant={decided ? 'ghost' : 'secondary'} onClick={() => setReviewOpen((v) => !v)} aria-expanded={reviewOpen}>
          {reviewOpen ? '판단 입력 닫기' : r.review ? '판단 수정' : '사람 판단 기록'}
        </Button>
      </div>
      {reviewOpen && (
        <div className="mt-3 grid gap-3 rounded-[16px] bg-white/40 p-3 sm:grid-cols-2 lg:grid-cols-[150px_150px_1fr_1fr]">
          <div>
            <Label>판단</Label>
            <select aria-label="판단" className={cn(selectClass, 'w-full')} value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
              {Object.entries(DECISION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label hint={r.metric ? undefined : '지표 없음'}>수정값</Label>
            <NumberField value={corrected} suffix="" min={-1_000_000_000_000} max={1_000_000_000_000} onChange={setCorrected} ariaLabel="수정값" />
          </div>
          <div>
            <Label hint={needsReason ? '필수' : undefined}>판단 사유</Label>
            <Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="예: 반올림 차이, 출처 확인 필요" aria-label="판단 사유" />
          </div>
          <div>
            <Label hint="고쳐 쓸 문장">수정 요구</Label>
            <Input value={request} maxLength={300} onChange={(e) => setRequest(e.target.value)} placeholder="예: 필수지출 3개월 기준으로 고쳐 쓸 것" aria-label="수정 요구" />
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3 sm:col-span-2 lg:col-span-4">
            <div className="w-full sm:w-48">
              <Label>검토자</Label>
              <Input value={reviewer} maxLength={40} onChange={(e) => setReviewer(e.target.value)} aria-label="검토자" />
            </div>
            <Button variant="primary" onClick={save} loading={saving}>
              판단 저장
            </Button>
          </div>
        </div>
      )}
      {err && (
        <div className="mt-2">
          <ErrorNote message={err} />
        </div>
      )}
    </Panel>
  )
}

function Field({ k, v, strong, danger }: { k: string; v: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-dim">{k}</dt>
      <dd className={cn('num', strong && 'text-accent', danger && 'text-danger')}>{v}</dd>
    </div>
  )
}

/** 허용 오차 눈금자: 독립 계산값(●)과 허용 범위(띠) 위에 AI 주장값(◇)이 어디에 놓이는지 보여준다 */
function ToleranceRuler({ r }: { r: VerifiedClaim }) {
  if (r.computedValue == null || r.claimedValue == null || r.tolerance == null) {
    return (
      <div className="mt-4 rounded-[10px] bg-white/40 px-3 py-2 text-[12px] text-dim">
        {r.metric ? '주장에 비교할 수치가 없음 · 사람 판단 필요' : '연결된 계산 지표 없음 · 근거 확인 필요'}
      </div>
    )
  }
  const c = r.computedValue
  const a = r.claimedValue
  const tol = Math.max(r.tolerance, 0)
  const lo0 = Math.min(c - tol, a)
  const hi0 = Math.max(c + tol, a)
  const pad = Math.max((hi0 - lo0) * 0.35, Math.abs(c) * 0.02, 1)
  const lo = lo0 - pad
  const hi = hi0 + pad
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100
  const inside = Math.abs(a - c) <= tol
  return (
    <div className="mt-4" role="img" aria-label={`독립 계산값 ${formatMetric(r.unit, c)}, 허용 범위 ±${formatMetric(r.unit, tol)}, 주장 값 ${formatMetric(r.unit, a)} — ${inside ? '범위 안' : '범위 밖'}`}>
      <div className="relative h-11">
        <div className="absolute top-5 right-0 left-0 h-px bg-[var(--hair-strong)]" />
        <div className="absolute top-[14px] h-3 rounded-full bg-[color-mix(in_oklab,var(--ok)_22%,transparent)]" style={{ left: `${x(c - tol)}%`, width: `${Math.max(0.8, x(c + tol) - x(c - tol))}%` }} />
        <div className="absolute top-[13px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-fg shadow-[0_0_0_3px_var(--s1)]" style={{ left: `${x(c)}%` }} />
        <div className={cn('absolute top-[13px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border-2', inside ? 'border-ok' : 'border-danger')} style={{ left: `${x(a)}%`, background: 'var(--s1)' }} />
        <div className="absolute top-[30px] -translate-x-1/2 text-[11px] whitespace-nowrap text-muted" style={{ left: `${x(c)}%` }}>
          계산 {formatMetric(r.unit, c)}
        </div>
        {Math.abs(x(a) - x(c)) > 14 && (
          <div className={cn('absolute -top-0.5 -translate-x-1/2 text-[11px] whitespace-nowrap', inside ? 'text-ok' : 'text-danger')} style={{ left: `${x(a)}%` }}>
            주장 {formatMetric(r.unit, a)}
          </div>
        )}
      </div>
    </div>
  )
}
