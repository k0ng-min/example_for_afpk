import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CpaShell } from '@/components/cpa/Shell'
import { Skel } from '@/components/cpa/ui'

const Home = lazy(() => import('@/pages/cpa/Home'))
const ClientPage = lazy(() => import('@/pages/cpa/Client'))
const Canvas = lazy(() => import('@/pages/cpa/Canvas'))
const Copilot = lazy(() => import('@/pages/cpa/Copilot'))
const Simulator = lazy(() => import('@/pages/cpa/Simulator'))
const Verification = lazy(() => import('@/pages/cpa/Verification'))
const Plan = lazy(() => import('@/pages/cpa/Plan'))
const Report = lazy(() => import('@/pages/cpa/Report'))

function Fallback() {
  return (
    <div className="space-y-4" role="status" aria-label="화면 불러오는 중">
      <Skel className="h-10 w-72" />
      <Skel className="h-5 w-[min(520px,90%)]" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skel className="h-40" />
        <Skel className="h-40" />
        <Skel className="h-40" />
      </div>
    </div>
  )
}

/** 최종 제출 사이트: 홈 → 고객 정보 → AI 분석 → AI 상담 → 시뮬레이션 → AI 검증 → 실행 계획 → 보고서 */
export function CpaRoutes() {
  return (
    <CpaShell>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route index element={<Home />} />
          <Route path="client" element={<ClientPage />} />
          <Route path="canvas" element={<Canvas />} />
          <Route path="copilot" element={<Copilot />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="verification" element={<Verification />} />
          <Route path="ai" element={<Navigate to="/verification" replace />} />
          <Route path="plan" element={<Plan />} />
          <Route path="report" element={<Report />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </CpaShell>
  )
}
