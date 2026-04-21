// frontend/src/v2/pages/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAccessToken } from '@v2/api/client'

export default function ProtectedRoute() {
  const location = useLocation()
  if (import.meta.env.VITE_AUTH_BYPASS) {
    return <Outlet />
  }
  if (!getAccessToken()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return <Outlet />
}
