// frontend/src/v2/App.tsx
import { useEffect, useMemo, useRef } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, useLocation } from 'react-router-dom'
import AppRoutes from '@v2/routes'
import { ThemeProvider } from '@v2/components/ThemeProvider'
import { A11yPreferencesProvider } from '@v2/components/A11yPreferencesProvider'
import { ToastProvider } from '@v2/components/ui/Toast'
import { ConfirmProvider } from '@v2/components/ui/ConfirmDialog'
import { createQueryClient } from '@v2/hooks/query-client'
import { ErrorBoundary } from '@v2/components/ErrorBoundary'
import { ev, obs } from '@v2/observability'

export default function App() {
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <A11yPreferencesProvider>
          <ToastProvider>
            <ConfirmProvider>
              <ErrorBoundary>
                <BrowserRouter>
                  <NavigationTracker />
                  <AppRoutes />
                </BrowserRouter>
              </ErrorBoundary>
            </ConfirmProvider>
          </ToastProvider>
        </A11yPreferencesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

/** 一次性挂载在路由器内部，监听 useLocation 变化并埋点 nav.navigated 事件。 */
function NavigationTracker(): null {
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)

  useEffect(() => {
    const next = location.pathname + location.search
    const prev = prevPathRef.current
    if (prev !== next) {
      obs.track(ev.navigated(prev, next))
      prevPathRef.current = next
    }
  }, [location.pathname, location.search])

  return null
}
