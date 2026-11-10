import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, Download, KeyRound, Lock, RotateCcw, Sparkles, Upload, Wand2, XCircle } from 'lucide-react'
import { useApp } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { adminToken, errorText } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import type { GenerationNote, IdeaAnalysis, IdeaInput, Preview, ValidationReport } from '@/types/api'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, Input, Label, Notice, Panel, PanelHeader, Skeleton, Textarea } from '@/components/ui'
import { TopicIllustration } from '@/components/financial/TopicIllustration'
import { LinesChart } from '@/components/charts'
import { TOPIC_ICONS, VISUAL_LABEL } from '@/services/adapters/topic'
import { cn, shortMetric, won } from '@/utils/format'

const STATUS_KO: Record<string, string> = { validated: '검증 통과', invalid: '검증 실패', draft: '초안', preset: '기본 후보' }
const SOURCE_KO: Record<string, string> = { preset: '기본 후보', generated: '자동 생성', imported: '가져온' }

const ACCENT_HEX: Record<string, string> = { cyan: '#3dd8e8', blue: '#5b8cff', violet: '#a37bff', emerald: '#34d399', amber: '#f6a94a', rose: '#f472b6' }

const OPTIONAL: { key: keyof IdeaInput; label: string; ph: string }[] = [
  { key: 'coreProblem', label: '핵심 문제', ph: '고객이 겪는 재무 문제의 본질' },
  { key: 'targetCustomer', label: '대상 고객', ph: '예: 30대 프리랜서 1인 가구' },
  { key: 'financialProblem', label: '해결하려는 재무문제', ph: '' },
  { key: 'aiRole', label: 'AI의 역할', ph: '예: 위험 탐색, 반론 생성' },
  { key: 'requiredData', label: '필요한 고객 데이터', ph: '' },
  { key: 'expectedGoals', label: '예상 재무목표(쉼표 구분)', ph: '예: 비상자금 1000만원, 장비 교체 300만원' },
  { key: 'keyRisks', label: '주요 위험(쉼표 구분)', ph: '예: 수입 공백, 건강 악화' },
  { key: 'desiredFeatures', label: '원하는 분석 기능', ph: '' },
  { key: 'references', label: '참고 자료', ph: '출처 메모(링크는 실행되지 않음)' },
  { key: 'notes', label: '추가 설명', ph: '' },
]

export default function IdeaStudio() {
  const health = useApp((s) => s.health)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [token, setToken] = useState(adminToken.get() ?? '')
  const [authErr, setAuthErr] = useState<string | null>(null)

  useEffect(() => {
    if (!adminToken.get()) return setAuthed(false)
    api.adminSession().then(() => setAuthed(true)).catch(() => setAuthed(false))
  }, [])

  const login = async () => {
    adminToken.set(token.trim())
    try {
      await api.adminSession()
      setAuthed(true)
      setAuthErr(null)
    } catch (e) {
      adminToken.set(null)
      setAuthErr(errorText(e))
    }
  }

  if (authed === null)
    return (
      <div className="px-5 pt-5 sm:px-8 lg:px-10" role="status" aria-label="관리자 세션 확인 중">
        <div className="mb-2 text-[11.5px] text-dim">재무설계 › 관리자</div>
        <h1 className="t-page">아이디어 설정</h1>
        <Skeleton className="mt-6 h-48 max-w-md rounded-[24px]" />
      </div>
    )
  if (!authed)
    return (
      <div className="grid min-h-[70vh] place-items-center px-4">
        <Panel className="w-full max-w-md p-6">
          <div className="flex items-center gap-2 text-violet">
            <Lock className="h-4 w-4" /> 관리자 전용
          </div>
          <h1 className="mt-2 text-xl font-medium">아이디어 설정</h1>
          <p className="mt-1 text-[13.5px] text-muted">공개 배포에서 주제를 무단으로 바꿀 수 없도록 서버의 ADMIN_TOKEN 으로 보호됩니다.</p>
          {!health?.adminEnabled && <div className="mt-3"><ErrorNote message="이 배포 환경은 ADMIN_TOKEN 이 설정되지 않아 관리자 기능이 비활성화되어 있습니다." /></div>}
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void login() }}>
            <Label htmlFor="tok">관리자 토큰</Label>
            <Input id="tok" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            {health?.devAdminHint && <p className="text-[12px] text-dim">개발 모드: ADMIN_TOKEN 미설정 시 기본값 <code className="text-fg">finova-dev-admin</code></p>}
            {authErr && <ErrorNote message={authErr} />}
            <Button variant="primary" type="submit" disabled={!token.trim()}>
              <KeyRound className="h-4 w-4" /> 인증
            </Button>
          </form>
        </Panel>
      </div>
    )
  return <Studio onLogout={() => { adminToken.set(null); setAuthed(false) }} />
}

function Studio({ onLogout }: { onLogout: () => void }) {
  const reloadTopic = useApp((s) => s.reloadTopic)
  const versions = useAsync(() => api.versions(), [])
  const [input, setInput] = useState<IdeaInput>({ ideaName: '', description: '' })
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null)
  const [notes, setNotes] = useState<GenerationNote[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const preview = useAsync(() => api.preview(previewId!), [previewId], { enabled: !!previewId })

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setErr(null)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const presets = versions.data?.versions.filter((v) => v.source === 'preset') ?? []
  const others = versions.data?.versions.filter((v) => v.source !== 'preset') ?? []

  return (
    <div className="pb-14">
      <PageHeader
        title="아이디어 설정"
        subtitle="공모전 아이디어를 입력하면 검증된 기능만 조합해 주제 구성을 만들고, 미리보기와 검증 후 승인할 때만 적용합니다."
        actions={
          <>
            <Button variant="ghost" onClick={onLogout}>잠금</Button>
            <Button
              onClick={() =>
                act('backup', async () => {
                  const b = await api.backup()
                  download(`finova-backup-${new Date().toISOString().slice(0, 10)}.json`, b)
                })
              }
              loading={busy === 'backup'}
            >
              <Download className="h-4 w-4" /> 설정 백업
            </Button>
            <Button
              onClick={() =>
                act('rollback', async () => {
                  await api.rollback()
                  await reloadTopic()
                  versions.reload()
                  setMsg('이전 주제로 되돌렸습니다.')
                })
              }
              disabled={!versions.data?.historyDepth}
              loading={busy === 'rollback'}
            >
              <RotateCcw className="h-4 w-4" /> 이전 주제로 되돌리기 {versions.data ? `(${versions.data.historyDepth})` : ''}
            </Button>
          </>
        }
      />
      <div className="space-y-5 px-5 sm:px-8 lg:px-10">
        {err && <ErrorNote message={err} />}
        {msg && <Notice>{msg}</Notice>}

        <Panel>
          <PanelHeader title="기존 후보 선택" description="5개 후보 + 공통 워크스페이스. 선택하면 미리보기만 열리며 활성 주제는 바뀌지 않습니다." />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
            {presets.map((v) => (
              <button
                key={v.id}
                onClick={() => act('preset', async () => { const g = await api.generateIdea({ presetId: v.topicId }); setNotes(g.notes); setAnalysis(null); setPreviewId(g.versionId) })}
                className={cn('rounded-[16px] border px-4 py-3 text-left transition-colors hover:border-[var(--hair-strong)]', previewId === v.id ? 'border-[var(--accent-line)] bg-accent-soft' : 'border-line')}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT_HEX[v.accent ?? 'cyan'] }} />
                  <span className="text-[14px] font-medium">{v.name}</span>
                  {v.active && <Badge tone="accent" className="ml-auto">활성</Badge>}
                </div>
                <div className="mt-1 text-[12px] text-dim">{VISUAL_LABEL[(v.signatureVisual ?? 'scenario_overview') as keyof typeof VISUAL_LABEL]}</div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Panel>
            <PanelHeader title="새 아이디어 입력" description="아이디어명과 설명만으로도 초기 구성을 생성합니다. 추가 정보가 많을수록 정확해집니다." />
            <div className="space-y-3 px-5 pb-5">
              <div>
                <Label htmlFor="idea-name" hint="필수">아이디어명</Label>
                <Input id="idea-name" maxLength={80} value={input.ideaName} onChange={(e) => setInput({ ...input, ideaName: e.target.value })} placeholder="예: 프리랜서 소득 절벽 대응" />
              </div>
              <div>
                <Label htmlFor="idea-desc">자유형 설명</Label>
                <Textarea id="idea-desc" rows={4} maxLength={4000} value={input.description} onChange={(e) => setInput({ ...input, description: e.target.value })} placeholder="누가, 어떤 재무 문제를, 왜 겪는지. 숫자가 있으면 함께 적어 주세요(예: 32세, 월 소득 280만원, 현금 900만원)." />
              </div>
              <details className="rounded-[12px] bg-s2 px-3 py-2">
                <summary className="cursor-pointer text-[13px] text-muted">추가 정보(선택)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {OPTIONAL.map((f) => (
                    <div key={f.key}>
                      <Label>{f.label}</Label>
                      <Textarea rows={2} maxLength={1500} aria-label={f.label} value={(input[f.key] as string) ?? ''} placeholder={f.ph} onChange={(e) => setInput({ ...input, [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act('analyze', async () => setAnalysis(await api.analyzeIdea(input)))} loading={busy === 'analyze'} disabled={!input.ideaName.trim()}>
                  <Sparkles className="h-4 w-4" /> 아이디어 분석
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    act('generate', async () => {
                      const a = await api.analyzeIdea(input)
                      setAnalysis(a)
                      const g = await api.generateIdea({ input })
                      setNotes(g.notes)
                      setPreviewId(g.versionId)
                      versions.reload()
                    })
                  }
                  loading={busy === 'generate'}
                  disabled={!input.ideaName.trim()}
                >
                  <Wand2 className="h-4 w-4" /> 구성 생성 · 미리보기
                </Button>
                <ImportButton onImported={(id) => { setPreviewId(id); versions.reload() }} setErr={setErr} />
              </div>
            </div>
          </Panel>
          <AnalysisPanel analysis={analysis} />
        </div>

        {previewId && (
          <PreviewPanel
            loading={preview.loading}
            error={preview.error}
            preview={preview.data}
            notes={notes}
            busy={busy}
            onValidate={() => act('validate', async () => { await api.validate(previewId); preview.reload(); versions.reload() })}
            onActivate={() =>
              act('activate', async () => {
                await api.activate(previewId)
                await reloadTopic()
                preview.reload()
                versions.reload()
                setMsg('주제를 적용했습니다. 이전 주제는 롤백 스택에 백업되었습니다.')
              })
            }
          />
        )}

        <Panel>
          <PanelHeader title="버전과 적용 이력" description="구성은 덮어쓰지 않고 버전으로 쌓입니다" />
          <div className="grid gap-5 px-5 pb-5 lg:grid-cols-2">
            <ul className="space-y-1.5 text-[13px]">
              {others.length === 0 && <li className="text-muted">생성·가져오기 버전이 아직 없습니다.</li>}
              {others.map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded-[10px] bg-s2 px-3 py-2">
                  <span className="truncate">{v.name}</span>
                  <Badge tone={v.status === 'validated' ? 'ok' : v.status === 'invalid' ? 'danger' : 'neutral'}>{STATUS_KO[v.status] ?? v.status}</Badge>
                  {v.active && <Badge tone="accent">활성</Badge>}
                  <button className="ml-auto text-accent hover:underline" onClick={() => setPreviewId(v.id)}>
                    미리보기
                  </button>
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-[12.5px] text-muted">
              {versions.data?.log.slice().reverse().slice(0, 10).map((l, i) => (
                <li key={i}>
                  <span className="text-dim">{new Date(l.at).toLocaleString('ko-KR')}</span> {l.action === 'activate' ? '적용' : '롤백'}: {l.fromVersion} → {l.toVersion}
                </li>
              ))}
              {!versions.data?.log.length && <li>적용 이력이 없습니다.</li>}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function ImportButton({ onImported, setErr }: { onImported: (id: string) => void; setErr: (e: string | null) => void }) {
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-muted hover:bg-white/50 hover:text-fg focus-within:outline-2 focus-within:outline-[var(--accent-line)]">
      <Upload className="h-4 w-4" /> 구성 JSON 가져오기
      <input
        type="file"
        accept="application/json"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const parsed = JSON.parse(await f.text())
            const body = parsed.config ? parsed : { config: parsed }
            const r = await api.importTopic(body)
            onImported(r.versionId)
          } catch (err) {
            setErr(`가져오기 거부: ${errorText(err)}`)
          }
        }}
      />
    </label>
  )
}

function AnalysisPanel({ analysis }: { analysis: IdeaAnalysis | null }) {
  if (!analysis)
    return (
      <Panel>
        <PanelHeader title="아이디어 분석 결과" description="문제 정의 · 재무설계 6단계 연결 · 지원 범위" />
        <p className="px-5 pb-5 text-[13px] text-muted">아이디어를 입력하고 분석을 실행하면 추출된 문제·고객·목표·위험과 기존 모듈 지원 여부가 표시됩니다.</p>
      </Panel>
    )
  const confTone = analysis.confidence === 'high' ? 'ok' : analysis.confidence === 'medium' ? 'warn' : 'danger'
  return (
    <Panel>
      <PanelHeader title="아이디어 분석 결과" description="규칙 기반 분석(키워드·수치 추출) — AI API 미사용" actions={<Badge tone={confTone}>신뢰도 {({ high: '높음', medium: '보통', low: '낮음' } as const)[analysis.confidence]}</Badge>} />
      <div className="space-y-4 px-5 pb-5 text-[13px]">
        {analysis.notices.map((n) => (
          <p key={n} className="text-[12px] text-dim">{n}</p>
        ))}
        <Row k="기반 유형">{analysis.archetypeScores.find((a) => a.id === analysis.baseArchetype)?.label ?? '공통 워크스페이스'}</Row>
        <Row k="추천 시각화">{VISUAL_LABEL[analysis.recommendedVisual]}</Row>
        <Row k="문제 정의">{analysis.problemDefinition || '—'}</Row>
        <Row k="고객 유형">{analysis.customerType}</Row>
        <Row k="재무목표">{analysis.financialGoals.join(', ')}</Row>
        <Row k="주요 위험">{analysis.keyRisks.join(', ')}</Row>
        <Row k="추출 수치">
          {Object.entries(analysis.extracted).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${k === 'age' ? `${v}세` : won(v as number)}`).join(', ') || '없음'}
        </Row>
        <div>
          <div className="mb-1 text-[12px] text-dim">유형 점수(일치 키워드)</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.archetypeScores.map((a) => (
              <Badge key={a.id} tone={a.id === analysis.baseArchetype ? 'accent' : 'neutral'} title={a.matched.join(', ')}>
                {a.label} {a.score}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-dim">기능 지원 범위</div>
          <ul className="space-y-1">
            {analysis.capabilities.map((c) => (
              <li key={c.capability} className="flex gap-2">
                {c.status === 'supported' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />}
                <span className={c.status === 'supported' ? '' : 'text-warn'}>
                  {c.capability}
                  {c.status !== 'supported' && <span className="block text-[11.5px] text-dim">{c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-dim">재무설계 6단계 매핑</div>
          <ol className="space-y-0.5 text-[12.5px] text-muted">
            {analysis.stageMapping.map((s) => (
              <li key={s.stage}>
                {s.stage}. {s.stageName} → {s.screen}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Panel>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <span className="text-dim">{k}</span>
      <span>{children}</span>
    </div>
  )
}

function PreviewPanel({ preview, loading, error, notes, busy, onValidate, onActivate }: { preview: Preview | null; loading: boolean; error: string | null; notes: GenerationNote[]; busy: string | null; onValidate: () => void; onActivate: () => void }) {
  if (error) return <ErrorNote message={error} />
  if (!preview || loading) return <Skeleton className="h-40 rounded-[20px]" label="미리보기 불러오는 중" />
  const c = preview.config
  const v: ValidationReport | null = preview.validation
  const Icon = TOPIC_ICONS[c.icon] ?? TOPIC_ICONS.sparkles
  const first = preview.scenarioPreview[0]
  const metaNotes = (preview.meta.notes as GenerationNote[] | undefined) ?? notes
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={`미리보기: ${c.name}`}
        description={`${SOURCE_KO[preview.version.source] ?? preview.version.source} 구성 · 아직 적용되지 않은 미리보기입니다`}
        actions={
          <>
            <Button size="sm" onClick={() => download(`${c.id}.topic.json`, { config: c, client: preview.client })}>
              <Download className="h-3.5 w-3.5" /> JSON 내보내기
            </Button>
            <Button size="sm" onClick={onValidate} loading={busy === 'validate'}>
              다시 검증
            </Button>
            <Button size="sm" variant="primary" onClick={onActivate} loading={busy === 'activate'} disabled={!v?.ok || preview.version.active}>
              {preview.version.active ? '현재 활성 주제' : '승인하고 적용'}
            </Button>
          </>
        }
      />
      {/* 주제 액센트를 이 영역에만 적용한 미리보기 */}
      <div className="grid gap-5 px-5 pb-5 xl:grid-cols-[1.2fr_1fr]" style={{
          ['--accent' as string]: ACCENT_HEX[c.accent],
          ['--accent-soft' as string]: `color-mix(in oklab, ${ACCENT_HEX[c.accent]} 16%, transparent)`,
          ['--accent-line' as string]: `color-mix(in oklab, ${ACCENT_HEX[c.accent]} 45%, transparent)`,
        }}>
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-[14px] border border-[var(--accent-line)] bg-accent-soft p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px] text-accent">
                <Icon className="h-4 w-4" /> {c.serviceName}
              </div>
              <div className="font-display mt-1 text-[22px] leading-tight font-medium">{c.content.heroTitle}</div>
              <p className="mt-1 text-[13px] text-muted">{c.content.heroSubtitle}</p>
            </div>
            <TopicIllustration motif={c.visual.heroMotif} className="hidden h-28 w-32 shrink-0 sm:block" />
          </div>
          {first && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {first.kpis.map((k) => (
                <div key={k.key} className="rounded-[10px] bg-s2 px-3 py-2">
                  <div className="text-[11.5px] text-dim">{k.label}</div>
                  <div className="num text-[15px]">{shortMetric(k.unit, k.value)}</div>
                </div>
              ))}
            </div>
          )}
          {preview.scenarioPreview.length > 0 && (
            <div className="rounded-[12px] bg-s2 p-3">
              <div className="mb-1 text-[12.5px] text-muted">시나리오 프리셋 순자산 추이(대표 고객 계산)</div>
              <LinesChart height={200} series={preview.scenarioPreview.map((s) => ({ id: s.presetId, name: s.name, color: s.color || '#3060a8', values: s.netWorth }))} />
            </div>
          )}
          <div className="grid gap-4 text-[13px] sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[12px] text-dim">이미지·그래픽 설정</div>
              <div>모티프 {c.visual.heroMotif} · 액센트 {c.accent} · 아이콘 {c.icon}</div>
              <div>전용 시각화 {VISUAL_LABEL[c.signatureVisual]}</div>
              <div>차트 {c.visual.charts.length}종 · KPI {c.visual.kpis.length}개 · 캔버스 노드 {c.canvas.nodes.length}개</div>
            </div>
            <div>
              <div className="mb-1 text-[12px] text-dim">보고서 구성</div>
              <div>{c.content.reportTitle}</div>
              <div className="text-muted">{c.content.reportSections.map((s) => s.title).join(' / ')}</div>
            </div>
          </div>
          {preview.client && (
            <div className="rounded-[12px] bg-s2 p-3 text-[13px]">
              <div className="mb-1 text-[12px] text-dim">합성 고객 데이터</div>
              <div>
                {preview.client.name} · {preview.client.age}세 · 소득 {won(preview.client.monthlyIncome)} · 생활비 {won(preview.client.fixedExpenses + preview.client.variableExpenses)} · 현금 {won(preview.client.cashAssets)}
              </div>
              <div className="text-muted">목표: {preview.client.goals.map((g) => `${g.name} ${won(g.targetAmount)}/${g.targetMonth}개월`).join(', ')}</div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[13.5px] font-medium">
              검증 결과 {v && <Badge tone={v.ok ? 'ok' : 'danger'}>{v.ok ? '통과' : '실패'}</Badge>}
            </div>
            <ul className="space-y-1.5 text-[13px]">
              {v?.checks.map((ch) => (
                <li key={ch.id} className="flex gap-2">
                  {ch.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <div>
                    {ch.label}
                    {ch.details.map((d) => (
                      <div key={d} className="text-[12px] text-danger">{d}</div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {metaNotes.length > 0 && (
            <div>
              <div className="mb-2 text-[13.5px] font-medium">자동 구성 상태</div>
              <ul className="space-y-1.5 text-[12.5px]">
                {metaNotes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <Badge tone={n.mode === 'generated' ? 'accent' : n.mode === 'reused' ? 'neutral' : 'warn'} className="shrink-0">
                      {n.mode === 'generated' ? '자동 생성' : n.mode === 'reused' ? '재사용' : '개발 필요'}
                    </Badge>
                    <span className="text-muted">
                      <b className="font-medium text-fg">{n.item}</b> {n.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.requiresDevelopment.length > 0 && (
            <div className="rounded-[16px] border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] p-3 text-[12.5px]">
              <div className="mb-1 font-medium text-warn">런타임 구성으로 지원되지 않음 — Claude Code 개발 필요</div>
              <ul className="list-disc pl-4 text-muted">
                {c.requiresDevelopment.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="mb-1 text-[12px] text-dim">분석 질문</div>
            <ul className="list-disc pl-4 text-[12.5px] text-muted">
              {c.content.analysisQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Panel>
  )
}
