import { useState, type ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { useApp, useCurrentClient } from '@/stores/app'
import { api } from '@/services/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAnalysis, useTopicComparison } from '@/features/topics/useTopicData'
import { DECISION_LABEL, STATUS_META } from '@/features/verification/status'
import { PageHeader } from '@/components/layout/AppShell'
import { Badge, Button, ErrorNote, Panel, PanelHeader, Skeleton, SourceBadge, type SourceKind } from '@/components/ui'
import { GoalTimeline, LinesChart, SERIES } from '@/components/charts'
import { formatMetric, manwon, won } from '@/utils/format'

/** 섹션별 내용의 출처. 이 보고서 문장은 LLM 이 쓰지 않는다(템플릿 + 입력 + Rust 계산 + 규칙 엔진 + 사람 판단). */
const SECTION_SOURCES: Record<string, { kinds: SourceKind[]; note: string }> = {
  summary: { kinds: ['input'], note: '고객 정보 입력값과 주제 문제 정의 문구' },
  goals: { kinds: ['input'], note: '고객 정보에서 입력한 목표' },
  status: { kinds: ['engine'], note: 'Rust 계산 엔진 지표' },
  risks: { kinds: ['rule', 'engine'], note: '규칙 엔진 판정 + Rust 계산 경고' },
  scenarios: { kinds: ['engine'], note: '가정 기반 Rust 시뮬레이션' },
  recommendations: { kinds: ['engine', 'human'], note: '계산 결과로 고른 후보 · 최종 채택은 사람 판단' },
  verification: { kinds: ['draft', 'engine', 'human'], note: 'AI 초안 주장 · Rust 독립 계산 · 사람 판단' },
  actions: { kinds: ['human'], note: '실행 계획 화면에서 사람이 관리' },
  review: { kinds: ['human'], note: '재점검 조건' },
}

export default function ReportStudio() {
  const client = useCurrentClient()
  const topic = useApp((s) => s.topic)!
  const revision = useApp((s) => s.revision)
  const analysis = useAnalysis(client)
  const comparison = useTopicComparison(client)
  const ver = useAsync(() => api.verification({ clientId: client!.id }), [client?.id, topic.version.id, revision], { enabled: !!client })
  const actions = useAsync(() => api.actions(client!.id), [client?.id, revision], { enabled: !!client })
  const cfg = topic.config
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  if (!client) return <div className="p-8 text-muted">고객을 선택하세요.</div>
  const ready = analysis.data && comparison.data && ver.data && actions.data
  const loadErr = analysis.error ?? comparison.error ?? ver.error ?? actions.error
  const retryAll = () => {
    analysis.reload()
    comparison.reload()
    ver.reload()
    actions.reload()
  }
  const m = (k: string) => analysis.data?.metrics.find((x) => x.key === k)
  const fm = (k: string) => {
    const x = m(k)
    return x ? formatMetric(x.unit, x.value) : '—'
  }

  // 권고 시나리오: 현금이 바닥나지 않는 대안 중 기말 순자산이 가장 큰 시나리오(엔진 결과 기반 선택 규칙)
  const ranked = comparison.data?.scenarios.filter((s) => s.projection.summary.firstNegativeCashMonth == null).sort((a, b) => b.projection.summary.finalNetWorth - a.projection.summary.finalNetWorth) ?? []
  const best = ranked[0]
  const base = comparison.data?.scenarios.find((s) => s.scenarioId === comparison.data?.baselineId)
  const unresolved = ver.data?.results.filter((r) => !STATUS_META[r.displayStatus].passed && !(r.review && r.review.decision !== 'pending')).length ?? 0

  const sections: Record<string, ReactNode> = {
    summary: (
      <>
        <p>
          {client.name}은(는) {client.age}세 {client.occupation}이며, {client.familySituation}. 월 세후 소득 {won(client.monthlyIncome)}, 현금성 자산 {won(client.cashAssets)}, 부채 잔액 {won(client.liabilities.reduce((a, l) => a + l.balance, 0))}입니다.
        </p>
        <p className="mt-2 text-muted">{cfg.content.problemStatement}</p>
      </>
    ),
    goals: (
      <ul className="list-disc space-y-1 pl-5">
        {client.goals.map((g) => (
          <li key={g.id}>
            {g.priority}순위 {g.name}: {won(g.targetAmount)} / {g.targetMonth}개월 내
          </li>
        ))}
      </ul>
    ),
    status: (
      <div className="grid gap-x-8 sm:grid-cols-2">
        {['monthly_surplus', 'savings_rate_bps', 'debt_service_ratio_bps', 'family_support_ratio_bps', 'emergency_fund_months_x10', 'net_worth', 'debt_to_asset_bps', 'total_interest_paid'].map((k) => (
          <div key={k} className="flex justify-between border-b border-line py-1.5 text-[13.5px]">
            <span className="text-muted">{m(k)?.label}</span>
            <span className="num">{fm(k)}</span>
          </div>
        ))}
      </div>
    ),
    risks: (
      <ul className="space-y-1.5">
        {analysis.data?.insights.length ? (
          analysis.data.insights.map((i) => (
            <li key={i.id}>
              <b>[{i.severity === 'critical' ? '심각' : i.severity === 'warning' ? '주의' : '참고'}] {i.title}</b> — {i.message}
            </li>
          ))
        ) : (
          <li>현재 규칙 기준으로 탐지된 위험이 없습니다.</li>
        )}
        {analysis.data?.projection.warnings.map((w, i) => (
          <li key={i} className="text-muted">
            계산 경고: {w.message}
          </li>
        ))}
      </ul>
    ),
    scenarios: (
      <>
        {comparison.data && <LinesChart height={220} series={comparison.data.scenarios.map((s) => ({ id: s.scenarioId, name: s.name, color: s.color || SERIES[0], values: s.projection.rows.map((r) => r.netWorth) }))} />}
        <table className="mt-3 w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">시나리오</th>
              <th className="py-1 text-right font-medium">월 순현금흐름</th>
              <th className="py-1 text-right font-medium">최저 현금</th>
              <th className="py-1 text-right font-medium">기말 순자산</th>
              <th className="py-1 text-right font-medium">기한 내 목표</th>
            </tr>
          </thead>
          <tbody>
            {comparison.data?.scenarios.map((s) => (
              <tr key={s.scenarioId} className="border-t border-line">
                <td className="py-1.5">{s.name}</td>
                <td className="num text-right">{manwon(s.projection.summary.firstMonthNetCashflow)}</td>
                <td className="num text-right">{manwon(s.projection.summary.minCash)}</td>
                <td className="num text-right">{manwon(s.projection.summary.finalNetWorth)}</td>
                <td className="num text-right">
                  {s.projection.summary.goals.filter((g) => g.onTrack).length}/{s.projection.summary.goals.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
    recommendations: best ? (
      <>
        <p>
          비교한 {comparison.data!.scenarios.length}개 시나리오 중 현금 소진이 없고 기말 순자산이 가장 큰 대안은 <b>‘{best.name}’</b>입니다
          {base && best.scenarioId !== base.scenarioId ? ` (기준 대비 기말 순자산 ${manwon(best.projection.summary.finalNetWorth - base.projection.summary.finalNetWorth)} 차이)` : ''}. 이 선택 규칙은 계산 결과에만 근거한 후보 제시이며, 최종 채택은 고객의 가치 판단(가족 관계·경력 등)을 상담에서 확인한 뒤 사람이 결정합니다.
        </p>
        <div className="mt-3">
          <GoalTimeline goals={best.projection.summary.goals} horizon={best.projection.summary.horizonMonths} />
        </div>
      </>
    ) : (
      <p>모든 시나리오에서 현금 소진이 발생합니다. 지출 구조 조정 시나리오를 추가로 검토해야 합니다.</p>
    ),
    verification: (
      <>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 font-medium">주장</th>
              <th scope="col" className="py-1 font-medium">자동 판정</th>
              <th scope="col" className="py-1 text-right font-medium">주장 값</th>
              <th scope="col" className="py-1 text-right font-medium">독립 계산</th>
              <th scope="col" className="py-1 pl-3 font-medium">사람 판단</th>
            </tr>
          </thead>
          <tbody>
            {ver.data?.results.map((r) => (
              <tr key={r.claimId} className="border-t border-line align-top">
                <td className="py-1.5 pr-3">
                  {r.statement}
                  <span className="block text-[11px] text-dim">{r.source === 'ai_draft' ? 'AI 초안(예시)' : r.source === 'user' ? '사용자 등록' : '규칙 엔진'}</span>
                </td>
                <td className="py-1.5">{STATUS_META[r.displayStatus].label}</td>
                <td className="num py-1.5 text-right">{r.claimedValue == null ? '수치 없음' : formatMetric(r.unit, r.claimedValue)}</td>
                <td className="num py-1.5 text-right">{r.computedValue == null ? '계산 불가' : formatMetric(r.unit, r.computedValue)}</td>
                <td className="py-1.5 pl-3">
                  {r.review && r.review.decision !== 'pending' ? (
                    <>
                      {DECISION_LABEL[r.review.decision]}
                      {r.review.note && <span className="block text-[11px] text-dim">{r.review.note}</span>}
                    </>
                  ) : (
                    <span className="text-dim">미검토</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {unresolved > 0 && (
          <p className="mt-2 text-[12.5px] text-warn">
            ※ 자동 검증을 통과하지 못했거나 사람 판단이 없는 주장 {unresolved}건은 이 보고서의 권고 근거로 사용하지 않았습니다.
          </p>
        )}
      </>
    ),
    actions: (
      <ul className="space-y-1">
        {actions.data?.items.map((a) => (
          <li key={a.id}>
            [{a.status === 'done' ? '완료' : a.status === 'in_progress' ? '진행 중' : a.status === 'blocked' ? '보류' : '예정'}] P{a.priority} {a.title} — {a.targetDate}
            {a.amount ? `, ${won(a.amount)}` : ''}
          </li>
        ))}
        {!actions.data?.saved && <li className="text-muted">※ 실행계획이 아직 저장되지 않아 주제 템플릿 초안을 표시합니다.</li>}
      </ul>
    ),
    review: (
      <ul className="list-disc space-y-1 pl-5">
        {actions.data?.items.filter((a) => a.reviewCondition).map((a) => (
          <li key={a.id}>
            {a.title}: {a.reviewCondition}
          </li>
        ))}
        <li>소득·지출·가족 상황 변화 시 미래 시뮬레이션에서 재계산 후 계획을 갱신합니다.</li>
      </ul>
    ),
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="보고서"
        subtitle="분석·시나리오·검증·실행 계획을 한 권의 재무설계 보고서로 묶습니다."
        actions={
          <Button variant="primary" onClick={() => window.print()} disabled={!ready}>
            <Printer className="h-4 w-4" /> 인쇄 · PDF 저장
          </Button>
        }
      />
      <div className="grid gap-5 px-5 sm:px-8 lg:px-10 xl:grid-cols-[240px_1fr]">
        <Panel className="no-print self-start">
          <PanelHeader title="보고서 섹션" description="체크 해제 시 제외" />
          <ul className="space-y-1 px-4 pb-4 text-[13px]">
            {cfg.content.reportSections.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={!hidden.has(s.id)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} />
                  {s.title}
                </label>
              </li>
            ))}
          </ul>
        </Panel>
        <article className="print-area surface rounded-[16px] px-6 py-8 md:px-12">
          {!ready ? (
            loadErr ? (
              <ErrorNote message={`보고서 데이터를 불러오지 못했습니다: ${loadErr}`} onRetry={retryAll} />
            ) : (
              <div className="space-y-3" role="status" aria-label="보고서 구성 중">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            )
          ) : (
            <>
              <header className="border-b border-line pb-5">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="accent">{cfg.serviceName}</Badge>
                  <Badge tone="warn">합성 데이터</Badge>
                </div>
                <h2 className="mt-3 text-[24px] font-light tracking-[-0.02em]">{cfg.content.reportTitle}</h2>
                <p className="mt-1 text-[13px] text-muted">
                  작성일 {new Date().toLocaleDateString('ko-KR')} · 대상 {client.name}{client.name.includes('합성') ? '' : '(합성 고객)'} · 계산: FINOVA Rust 엔진
                </p>
                <p className="mt-2 rounded-[12px] bg-white/50 px-3 py-2 text-[12px] text-muted">
                  이 보고서의 문장은 LLM이 작성하지 않았습니다. 주제 템플릿 문구에 입력값·Rust 계산값·규칙 엔진 판정·사람 판단을 채워 조립했습니다. 각 섹션 제목 옆에 내용의 출처를 표시합니다. 미래 수치는 가정에 따른 시뮬레이션이며 확정된 결과나 투자 권유가 아닙니다.
                </p>
              </header>
              {cfg.content.reportSections.filter((s) => !hidden.has(s.id)).map((s, i) => (
                <section key={s.id} className="print-avoid mt-7 text-[14px] leading-relaxed">
                  <h3 className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] font-medium">
                    <span>
                      <span className="num mr-2 text-dim">{i + 1}.</span>
                      {s.title}
                    </span>
                    {SECTION_SOURCES[s.id] && (
                      <span className="flex flex-wrap items-center gap-1 text-[11px] font-normal" title={SECTION_SOURCES[s.id].note}>
                        {SECTION_SOURCES[s.id].kinds.map((k) => (
                          <SourceBadge key={k} kind={k} />
                        ))}
                      </span>
                    )}
                  </h3>
                  {sections[s.id] ?? <p className="text-muted">이 섹션 유형은 현재 자동 조립을 지원하지 않습니다.</p>}
                </section>
              ))}
              <footer className="mt-10 border-t border-line pt-4 text-[11.5px] text-dim">
                <p>{cfg.content.disclaimer}</p>
                <p className="mt-1">계산 가정: {analysis.data!.projection.assumptions.join(' / ')}</p>
              </footer>
            </>
          )}
        </article>
      </div>
    </div>
  )
}
