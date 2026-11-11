import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Bot, Calculator, CircleAlert, Send, Sparkles } from 'lucide-react'
import { cn } from '@/utils/format'
import { errorText, request } from '@/services/api/client'
import { cpaApi, useCpa } from '@/features/cpa/store'
import { PageTitle } from '@/components/cpa/Shell'
import { Btn, Help, Prov } from '@/components/cpa/ui'

const Fact = z.object({ label: z.string(), value: z.string(), source: z.string() })
const RuleAnswer = z.object({ id: z.string(), question: z.string(), answer: z.string(), facts: z.array(Fact), outOfScope: z.boolean() })
const AskSchema = z.object({
  mode: z.enum(['rule', 'ai', 'unsupported']),
  rule: RuleAnswer.nullable(),
  ai: z.object({ model: z.string(), ranAt: z.string(), text: z.string(), checkedNumbers: z.number(), unverifiedNumbers: z.array(z.string()) }).nullable(),
  aiError: z.string().nullable(),
  aiConfigured: z.boolean(),
  suggestions: z.array(z.tuple([z.string(), z.string()])),
})
type Ask = z.infer<typeof AskSchema>
type Turn = { id: string; question: string; res?: Ask; err?: string; pending?: boolean }

const SUGGESTED: [string, string][] = [
  ['runway', '현재 자금으로 언제까지 생활할 수 있나요?'],
  ['floor', '안전자금 하한에는 언제 도달하나요?'],
  ['supportCut', '가족 지원이 더 빨리 끊기면 어떤 조정이 필요한가요?'],
  ['delayRule', '수습처 확보가 늦어지면 어떤 전환 규칙을 적용하나요?'],
  ['feasible', '어떤 전략이 단기 지급능력 조건을 통과하나요?'],
  ['verify', 'AI 제안은 어떤 계산 근거로 검증되나요?'],
]

export default function Copilot() {
  const inputs = useCpa((s) => s.inputs)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [useAi, setUseAi] = useState(false)
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    cpaApi
      .experiments()
      .then((d) => setAiConfigured(d.ai.configured))
      .catch(() => setAiConfigured(false))
  }, [])
  useEffect(() => {
    // 최신 브라우저는 scrollIntoView 가 Promise 를 돌려주므로 반환하지 않는다
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  const ask = async (body: { questionId?: string; question?: string }, label: string) => {
    if (!inputs) return
    const id = crypto.randomUUID()
    setTurns((t) => [...t, { id, question: label, pending: true }])
    try {
      const res = await request('/cpa/ask', AskSchema, { method: 'POST', body: { ...body, inputs, useAi } })
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, res, pending: false } : x)))
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, err: errorText(e), pending: false } : x)))
    }
  }

  return (
    <div>
      <PageTitle eyebrow="3단계 · 재무상태 분석" title="AI 상담" lead="소득 공백 동안의 지급능력에 대해 묻고 답합니다. 기본 답변은 Rust 계산 엔진 결과로 만든 규칙 기반 답변이며, 생성형 AI는 요청할 때만 서버에서 호출합니다. 합격 가능성 예측이나 수험 코칭은 하지 않습니다." />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <div className="card p-4">
            <div className="mb-2 text-[13px] font-semibold text-navy">답변 방식</div>
            <div className="space-y-2 text-[12.5px]">
              <div className="flex items-start gap-2 rounded-lg bg-[#f6f6f7] px-3 py-2">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
                <div>
                  <b>규칙 기반(기본)</b> — 엔진 계산값을 정해진 문장에 넣어 답합니다. 항상 같은 입력에 같은 답.
                </div>
              </div>
              <label className={cn('flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2', useAi ? 'border-violet-ink/30 bg-violet-soft' : 'border-rule bg-white')}>
                <input type="checkbox" className="mt-1" checked={useAi} disabled={!aiConfigured} onChange={(e) => setUseAi(e.target.checked)} />
                <div>
                  <b className="text-violet-ink">생성형 AI로 문장 다듬기</b>
                  <div className="text-ink-2">{aiConfigured == null ? '서버 상태 확인 중…' : aiConfigured ? '서버에 AI 키가 있어 요청 시 Gemini를 호출합니다. 숫자는 엔진 값과 자동 대조합니다.' : '서버에 AI 키가 없어 사용할 수 없습니다(규칙 기반만 동작).'}</div>
                </div>
              </label>
            </div>
          </div>
          <div className="card p-4">
            <div className="mb-2 text-[13px] font-semibold text-navy">추천 질문</div>
            <div className="space-y-1.5">
              {SUGGESTED.map(([id, q]) => (
                <button key={id} onClick={() => ask({ questionId: id }, q)} className="w-full rounded-xl border border-rule bg-white/80 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-sky-2 hover:text-sky">
                  {q}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="card flex min-h-[520px] flex-col p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {turns.length === 0 && (
              <div className="grid h-full min-h-[360px] place-items-center text-center">
                <div>
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sky-soft text-sky">
                    <Calculator className="h-6 w-6" />
                  </div>
                  <div className="mt-3 text-[15px] font-semibold text-navy">왼쪽의 추천 질문을 누르거나 직접 물어보세요</div>
                  <p className="mt-1 text-[13px] text-ink-2">답변의 모든 숫자는 현재 고객 가정으로 계산한 엔진 결과에서 가져옵니다.</p>
                </div>
              </div>
            )}
            {turns.map((t) => (
              <div key={t.id} className="space-y-2">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sky px-3.5 py-2 text-[13.5px] text-white">{t.question}</div>
                {t.pending && <div className="w-fit animate-pulse rounded-2xl bg-white px-3.5 py-2 text-[13px] text-ink-3">계산 근거를 모으는 중…</div>}
                {t.err && <div className="w-fit rounded-xl bg-caution-soft px-3 py-2 text-[13px] text-caution">{t.err}</div>}
                {t.res && <AnswerCard r={t.res} />}
              </div>
            ))}
            <div ref={end} />
          </div>
          <form
            className="flex gap-2 border-t border-rule p-3"
            onSubmit={(e) => {
              e.preventDefault()
              const q = text.trim()
              if (!q) return
              setText('')
              void ask({ question: q }, q)
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="예: 근로를 두 달 늦게 시작하면 어떻게 되나요?" aria-label="질문 입력" className="h-11 min-w-0 flex-1 rounded-full border border-rule-strong bg-white px-4 text-[14px] outline-none focus:border-sky" />
            <Btn variant="solid" className="h-11" type="submit" disabled={!text.trim()}>
              <Send className="h-4 w-4" /> 질문
            </Btn>
          </form>
          <p className="px-4 pb-3 text-[11.5px] text-ink-3">직접 입력한 질문은 추천 질문과 연결되지 않으면 생성형 AI가 필요합니다. AI를 쓸 수 없으면 답하지 않고 그렇다고 알려 드립니다.</p>
        </section>
      </div>
    </div>
  )
}

function AnswerCard({ r }: { r: Ask }) {
  return (
    <div className="max-w-[92%] space-y-2">
      {r.rule && (
        <div className={cn('rounded-2xl rounded-bl-md border bg-white px-4 py-3', r.rule.outOfScope ? 'border-caution/30' : 'border-rule')}>
          <div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold text-ink-2">
            {r.rule.outOfScope ? <CircleAlert className="h-3.5 w-3.5 text-caution" /> : <Calculator className="h-3.5 w-3.5 text-sky" />}
            {r.rule.outOfScope ? '상담 범위 안내' : '규칙 기반 답변'}
            {!r.rule.outOfScope && <Prov kind="engine" />}
          </div>
          <p className="text-[13.5px] leading-relaxed text-ink">{r.rule.answer}</p>
          {r.rule.facts.length > 0 && (
            <dl className="mt-2 grid gap-1 rounded-xl bg-[#f6f6f7] px-3 py-2 text-[12px] sm:grid-cols-2">
              {r.rule.facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-2">
                  <dt className="text-ink-3">{f.label}</dt>
                  <dd className="t-num text-right text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {r.ai && (
        <div className="rounded-2xl rounded-bl-md border border-violet-ink/20 bg-violet-soft px-4 py-3">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-violet-ink">
            <Sparkles className="h-3.5 w-3.5" /> 생성형 AI 답변 <Prov kind="ai" />
            <span className="font-normal text-ink-3">
              {r.ai.model} · {new Date(r.ai.ranAt).toLocaleTimeString('ko-KR')}
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">{r.ai.text}</p>
          <div className={cn('mt-2 flex items-center gap-1.5 text-[12px]', r.ai.unverifiedNumbers.length ? 'text-caution' : 'text-good')}>
            숫자 {r.ai.checkedNumbers}개를 엔진 값과 대조 ·{' '}
            {r.ai.unverifiedNumbers.length ? `확인되지 않은 숫자 ${r.ai.unverifiedNumbers.join(', ')}` : '모두 엔진 계산값과 일치'}
            <Help>AI 문장 속 금액·비율을 이번 계산의 엔진 결과·입력값과 대조합니다. 맞지 않는 숫자는 사실로 쓰지 마세요.</Help>
          </div>
        </div>
      )}
      {r.mode === 'unsupported' && (
        <div className="rounded-2xl rounded-bl-md border border-rule bg-white px-4 py-3 text-[13px] text-ink-2">
          <Bot className="mr-1 inline h-4 w-4 text-ink-3" />이 질문은 규칙 기반 답변에 없고 생성형 AI도 사용할 수 없어 답하지 않았습니다. 추천 질문을 이용해 주세요.
        </div>
      )}
      {r.aiError && r.mode !== 'unsupported' && <div className="text-[12px] text-ink-3">생성형 AI는 호출하지 않았습니다: {r.aiError}</div>}
    </div>
  )
}
