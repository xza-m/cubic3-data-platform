/**
 * 路由守卫组件
 * 检查 localStorage 中是否存在 auth_token，无 token 则重定向到登录页
 */
import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedRoute() {
  const token = localStorage.getItem('auth_token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
