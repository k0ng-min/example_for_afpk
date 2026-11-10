import { BrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { BootProvider } from '@/app/providers/BootProvider'
import { AppRoutes } from '@/app/router'

export default function App() {
  return (
    <BrowserRouter>
      <BootProvider>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </BootProvider>
    </BrowserRouter>
  )
}
