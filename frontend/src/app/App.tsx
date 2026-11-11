import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { CpaRoutes } from '@/app/router/cpa'

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <CpaRoutes />
      </MotionConfig>
    </BrowserRouter>
  )
}
