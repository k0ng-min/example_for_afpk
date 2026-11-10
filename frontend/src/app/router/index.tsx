import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PageSkeleton } from '@/components/ui'
import { NAV_ITEMS, STUDIO_ITEM } from '@/components/layout/nav'

// 화면 코드는 나눠 받되, 앱이 뜬 뒤 유휴 시간에 미리 받아 두어 메뉴 이동 시 빈 화면이 생기지 않게 한다.
const loaders = {
  '/': () => import('@/pages/Dashboard'),
  '/client': () => import('@/pages/ClientProfile'),
  '/canvas': () => import('@/pages/ReasoningCanvas'),
  '/scenarios': () => import('@/pages/ScenarioLab'),
  '/copilot': () => import('@/pages/AICopilot'),
  '/verification': () => import('@/pages/VerificationLab'),
  '/actions': () => import('@/pages/ActionPlanner'),
  '/report': () => import('@/pages/ReportStudio'),
  '/studio': () => import('@/pages/IdeaConfigurationStudio'),
} as const

const Dashboard = lazy(loaders['/'])
const ClientProfile = lazy(loaders['/client'])
const ReasoningCanvas = lazy(loaders['/canvas'])
const ScenarioLab = lazy(loaders['/scenarios'])
const AICopilot = lazy(loaders['/copilot'])
const VerificationLab = lazy(loaders['/verification'])
const ActionPlanner = lazy(loaders['/actions'])
const ReportStudio = lazy(loaders['/report'])
const IdeaStudio = lazy(loaders['/studio'])

/** 화면 코드를 받는 동안: 제목 자리와 본문 골격을 유지한다 */
function RouteFallback() {
  const loc = useLocation()
  const item = [...NAV_ITEMS, STUDIO_ITEM].find((n) => n.to === loc.pathname)
  return (
    <div className="pb-10">
      <div className="px-5 pt-5 pb-5 sm:px-8 lg:px-10">
        <div className="mb-2 text-[11.5px] text-dim">재무설계 › {item?.stage ?? '화면'}</div>
        <h1 className="t-page">{item?.ko ?? '불러오는 중'}</h1>
      </div>
      <PageSkeleton label={`${item?.ko ?? '화면'} 불러오는 중`} />
    </div>
  )
}

export function AppRoutes() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((l) => void l().catch(() => undefined))
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 })
    else window.setTimeout(run, 1200)
  }, [])
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/client" element={<ClientProfile />} />
        <Route path="/canvas" element={<ReasoningCanvas />} />
        <Route path="/scenarios" element={<ScenarioLab />} />
        <Route path="/copilot" element={<AICopilot />} />
        <Route path="/verification" element={<VerificationLab />} />
        <Route path="/actions" element={<ActionPlanner />} />
        <Route path="/report" element={<ReportStudio />} />
        <Route path="/studio" element={<IdeaStudio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}


