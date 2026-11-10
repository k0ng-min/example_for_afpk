import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Bot, ChevronDown, RotateCcw, Send, ShieldQuestion, User } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { errorText } from '@/services/api/client'
import { useAsync } from '@/hooks/useAsync'
import type { AnalysisResponse } from '@/types/api'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, HelpTip, Panel, PanelHeader, SourceBadge, Spinner, Textarea } from '@/components/ui'
import { InsightList } from '@/components/financial'
import { recentAnalyses } from '@/features/clients/recent'
import { formatMetric, cn } from '@/utils/format'

type Msg = { role: 'user'; text: string } | { role: 'ai'; res: AnalysisResponse; question: string; at: number } | { role: 'error'; text: string; question: string }

const COMMON = ['매월 얼마나 남나요?', '비상자금으로 몇 개월 버틸 수 있나요?', '목표는 언제 달성되나요?', '부채 이자는 얼마인가요?', '주요 위험은 무엇인가요?']

export default function AICopilot() {
  const client = useCurrentClient()
  const topic = useApp((s) => s.topic)!
  const health = useApp((s) => s.health)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [openAgent, setOpenAgent] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const agents = useAsync(() => api.agents(), [])
  const [params, setParams] = useSearchParams()

  const ask = async (question: string) => {
    if (!client || !question.trim() || busy) return
    setMsgs((m) => [...m, { role: 'user', text: question }])
    setQ('')
    setBusy(true)
    try {
      const res = await api.analysis({ clientId: client.id, question })
      setMsgs((m) => [...m, { role: 'ai', res, question, at: Date.now() }])
      recentAnalyses.add(client.id, { question, at: Date.now(), supported: !!res.answer?.supported })
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', text: errorText(e), question }])
    } finally {
      setBusy(false)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  // 명령 팔레트(Ctrl K)에서 넘어온 질문은 바로 실행
  useEffect(() => {
    const incoming = params.get('q')
    if (incoming && client) {
      setParams({}, { replace: true })
      void ask(incoming)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, client?.id])

  if (!client) return <div className="p-8 text-muted">고객을 선택하세요.</div>
  const suggestions = [...topic.config.content.analysisQuestions.slice(0, 3), ...COMMON]
  const ai = health?.ai
  const lastAi = [...msgs].reverse().find((m): m is Extract<Msg, { role: 'ai' }> => m.role === 'ai')
  const lastCall = !ai?.llmCallsEnabled ? null : !lastAi ? '아직 호출 안 함' : lastAi.res.answer?.source === 'gemini' ? `최근 호출 성공 · ${new Date(lastAi.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : lastAi.res.answer?.llmError ? '최근 호출 실패 · 규칙 엔진 답변으로 대체' : '최근 답변은 규칙 엔진'

  return (
    <div className="pb-10">
      <PageHeader title="AI 재무 상담" subtitle={`${client.name}(합성 고객)의 Rust 계산 결과만 근거로 답합니다. 답변 문장의 출처(Gemini 생성 / 규칙 엔진)와 인용 수치의 출처(Rust 계산)를 따로 표시합니다. 투자 권유가 아닌 시뮬레이션 기반 참고 정보입니다.`} />
      <div className="grid gap-5 px-5 sm:px-8 lg:px-10 xl:grid-cols-[1fr_360px]">
        <Panel className="flex min-h-[560px] flex-col">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-5 py-3 text-[12.5px]">
            <span className={cn('h-2 w-2 rounded-full', ai?.llmCallsEnabled ? 'bg-ok' : 'bg-warn')} />
            <span className="text-fg">{ai?.llmCallsEnabled ? `Gemini API 호출 사용 · ${ai.model ?? '모델 미상'}` : 'LLM 미호출 · 규칙 엔진 답변'}</span>
            {lastCall && <span className="text-dim">· {lastCall}</span>}
            <HelpTip label="AI 호출 방식과 전달 데이터" align="right">
              <span className="block">{ai?.note}</span>
              {ai?.llmCallsEnabled && (
                <>
                  <span className="mt-2 block text-dim">LLM에 전달하는 데이터</span>
                  <span className="block">{ai.llmInputScope}</span>
                  <span className="mt-2 block text-dim">호출 경로</span>
                  <span className="block">브라우저 → Rust 서버 → Gemini API (API 키는 서버에만 있음). 실패하면 규칙 엔진 답변과 실패 사유를 표시합니다.</span>
                </>
              )}
            </HelpTip>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
            {msgs.length === 0 && (
              <div className="py-6">
                <p className="text-[14px] text-muted">이 고객에 대해 질문해 보세요.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="rounded-full shadow-[inset_0_0_0_1px_var(--hair)] px-3 py-1.5 text-[13px] text-muted hover:border-[var(--accent-line)] hover:text-fg">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {msgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <div className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border', m.role === 'user' ? 'border-line text-muted' : 'border-[var(--accent-line)] bg-accent-soft text-accent')}>
                    {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {m.role === 'user' && <p className="pt-1 text-[14px]">{m.text}</p>}
                    {m.role === 'error' && <ErrorNote message={`요청 실패: ${m.text}`} onRetry={busy ? undefined : () => void ask(m.question)} />}
                    {m.role === 'ai' && m.res.answer && (
                      <div className="rounded-[12px] bg-s2 p-4">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {m.res.answer.source === 'gemini' ? (
                            <>
                              <SourceBadge kind="llm">Gemini 생성 문장 · {m.res.answer.model}</SourceBadge>
                              {m.res.answer.unverifiedNumbers.length === 0 ? (
                                <Badge tone="ok">문장 속 수치 {m.res.answer.numbersChecked}개 · Rust 계산값과 일치</Badge>
                              ) : (
                                <Badge tone="danger">계산값과 다른 수치 {m.res.answer.unverifiedNumbers.length}개</Badge>
                              )}
                              <HelpTip label="AI 답변 검증 방식">Gemini 에는 Rust 계산 엔진 결과만 근거로 전달합니다. 답변 속 금액·비율은 서버가 계산값과 자동으로 대조하며, 맞지 않는 숫자는 빨간색으로 표시합니다. 숫자 대조는 문장 내용의 타당성까지 보증하지 않으므로 최종 판단은 사람이 합니다.</HelpTip>
                            </>
                          ) : (
                            <SourceBadge kind="rule">규칙 엔진 문장 · LLM 미호출</SourceBadge>
                          )}
                          {!m.res.answer.supported && (
                            <Badge tone="warn">
                              <ShieldQuestion className="h-3 w-3" /> 지원하지 않는 질문
                            </Badge>
                          )}
                        </div>
                        <p className="text-[14px] leading-relaxed whitespace-pre-line">{m.res.answer.text}</p>
                        {m.res.answer.unverifiedNumbers.length > 0 && (
                          <div className="mt-2 rounded-[10px] bg-[color-mix(in_oklab,var(--danger)_8%,white)] px-3 py-2 text-[12.5px] text-danger">
                            계산 엔진 값과 맞지 않는 수치: {m.res.answer.unverifiedNumbers.join(', ')} — AI 검증 화면에서 확인하세요.
                          </div>
                        )}
                        {m.res.answer.llmError && (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[color-mix(in_oklab,var(--warn)_10%,white)] px-3 py-2 text-[12.5px] text-warn">
                            <span>Gemini 호출 실패로 규칙 엔진 답변을 표시했습니다 · {m.res.answer.llmError}</span>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void ask(m.question)}>
                              <RotateCcw className="h-3.5 w-3.5" /> Gemini 다시 시도
                            </Button>
                          </div>
                        )}
                        {m.res.answer.ruleText && (
                          <details className="mt-2 text-[12.5px] text-muted">
                            <summary className="cursor-pointer text-dim">규칙 엔진 답변과 비교</summary>
                            <p className="mt-1 whitespace-pre-line">{m.res.answer.ruleText}</p>
                          </details>
                        )}
                        {m.res.answer.citedMetrics.length > 0 && (
                          <div className="mt-3 border-t border-line pt-2.5">
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-dim">
                              <SourceBadge kind="engine" /> 근거로 인용한 계산 지표(문장과 별개로 엔진이 직접 계산)
                            </div>
                            <ul className="grid gap-x-6 gap-y-0.5 text-[12.5px] sm:grid-cols-2">
                              {m.res.answer.citedMetrics.map((k) => {
                                const mt = m.res.metrics.find((x) => x.key === k)
                                return mt ? (
                                  <li key={k} className="flex justify-between gap-2 text-muted" title={mt.formula}>
                                    <span>{mt.label}</span>
                                    <span className="num text-fg">{formatMetric(mt.unit, mt.value)}</span>
                                  </li>
                                ) : null
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {busy && (
              <div className="flex items-center gap-2 pl-10 text-[13px] text-muted">
                <Spinner /> {health?.ai.llmCallsEnabled ? 'Rust 엔진 계산 후 Gemini 가 답변을 작성하는 중' : 'Rust 엔진으로 계산하고 규칙을 평가하는 중'}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void ask(q)
            }}
          >
            <Textarea
              rows={1}
              className="min-h-[40px] resize-none"
              placeholder="예: 비상자금으로 몇 개월 버틸 수 있나요?"
              value={q}
              maxLength={500}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void ask(q)
                }
              }}
              aria-label="질문 입력"
            />
            <Button variant="primary" type="submit" disabled={!q.trim()} loading={busy} aria-label="질문 보내기">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="AI 역할 구성" description={`${topic.config.name} 주제에 맞춘 역할별 초점과 프롬프트입니다. 현재 역할들은 규칙 엔진으로 동작하고, LLM 호출은 왼쪽 상담 답변 문장 작성에만 쓰입니다.`} />
            <ul className="space-y-1.5 px-4 pb-4">
              {topic.config.agents.map((a) => {
                const def = agents.data?.agents.find((x) => x.id === a.agent)
                const open = openAgent === a.agent
                return (
                  <li key={a.agent} className="rounded-[12px] bg-s2">
                    <button className="flex w-full items-start gap-2 px-3 py-2.5 text-left" onClick={() => setOpenAgent(open ? null : a.agent)} aria-expanded={open}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium">{def?.name ?? a.agent}</div>
                        <div className="text-[12px] text-muted">{a.focus}</div>
                      </div>
                      <ChevronDown className={cn('mt-1 h-4 w-4 text-dim transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && def && (
                      <div className="border-t border-line px-3 py-2.5 text-[12px] text-muted">
                        <p>{def.role}</p>
                        <p className="mt-1 text-dim">현재 실행 방식: {def.runtime === 'rule_engine' ? '규칙 엔진(LLM 미호출)' : def.runtime}</p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-accent">프롬프트 보기</summary>
                          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-white/60 p-2 text-[11px] whitespace-pre-wrap">{def.taskPromptText}</pre>
                        </details>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="자동 분석 결과" description="질문과 관계없이 규칙 엔진이 Rust 계산 지표를 임계값과 비교한 결과(LLM 미사용)" actions={<SourceBadge kind="rule" />} />
            <div className="px-5 pb-5">
              {msgs.find((m) => m.role === 'ai') ? (
                <InsightList insights={(msgs.filter((m) => m.role === 'ai').pop() as { res: AnalysisResponse }).res.insights} />
              ) : (
                <p className="text-[13px] text-muted">질문을 보내면 함께 표시됩니다.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
