// frontend/src/v2/components/RouteErrorBoundary.tsx
// react-router 的 errorElement 组件。
// 挂载在每个需要独立错误边界的路由上。
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom'
import { reportError } from '@v2/lib/telemetry'
import { t } from '@v2/i18n'
import { useEffect } from 'react'

export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()

  useEffect(() => {
    if (error instanceof Error) {
      reportError(error, { context: 'RouteErrorBoundary' })
    }
  }, [error])

  let title = t('error.route.title', '页面加载失败')
  let description = t('error.route.desc', '发生了意外错误，请重试或返回上一页。')

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = t('error.route.404', '页面不存在')
      description = t('error.route.404.desc', '请检查 URL 是否正确。')
    } else if (error.status === 403) {
      title = t('error.route.403', '无访问权限')
      description = t('error.route.403.desc', '你没有权限访问此页面。')
    } else {
      description = error.data?.message ?? description
    }
  } else if (error instanceof Error) {
    description = error.message
  }

  const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: 'var(--bg-app)' }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl text-[20px]"
        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
      >
        ⚠
      </div>
      <div>
        <div className="text-[15px] font-semibold text-1">{title}</div>
        <div className="mt-1 text-[12px] text-3">{description}</div>
        <div className="mt-2 text-[11px] text-4">
          {t('error.boundary.id', '错误 ID')}: <code>{errorId}</code>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={() => navigate(-1)}>
          {t('action.back', '回到上一页')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('action.retry', '重试')}
        </button>
      </div>
    </div>
  )
}
