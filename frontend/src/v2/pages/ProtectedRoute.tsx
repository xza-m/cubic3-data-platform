// frontend/src/v2/pages/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAccessToken } from '@v2/api/client'

export default function ProtectedRoute() {
  const location = useLocation()
  if (import.meta.env.VITE_AUTH_BYPASS || import.meta.env.VITE_BROWSER_E2E_FIXTURES) {
    return <Outlet />
  }
  if (!getAccessToken()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return <Outlet />
}
