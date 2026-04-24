// frontend/src/v2/components/ErrorBoundary.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
// 通用 React error boundary。
// fallback UI 含错误 ID（用于可观测性后台查询）+ "回到上一页" / "重试"。
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { obs } from '@v2/observability'
import { t } from '@v2/i18n'

interface Props {
  children: ReactNode
  fallback?: (props: FallbackProps) => ReactNode
}

interface State {
  hasError: boolean
  errorId: string | null
  error: Error | null
}

interface FallbackProps {
  error: Error | null
  errorId: string | null
  retry: () => void
}

function generateErrorId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}`
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorId: null, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorId: generateErrorId(), error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    obs.error(error, {
      kind: 'react',
      componentStack: info.componentStack ?? undefined,
    })
  }

  retry = () => {
    this.setState({ hasError: false, errorId: null, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorId: this.state.errorId,
          retry: this.retry,
        })
      }
      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          retry={this.retry}
        />
      )
    }
    return this.props.children
  }
}

function DefaultErrorFallback({ error, errorId, retry }: FallbackProps) {
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
        <div className="text-[15px] font-semibold text-1">
          {t('error.boundary.title', '页面渲染出错')}
        </div>
        <div className="mt-1 text-[12px] text-3">
          {error?.message ?? t('error.boundary.unknown', '未知错误')}
        </div>
        {errorId ? (
          <div className="mt-2 text-[11px] text-4">
            {t('error.boundary.id', '错误 ID')}: <code>{errorId}</code>
          </div>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => window.history.back()}
        >
          {t('action.back', '回到上一页')}
        </button>
        <button type="button" className="btn btn-primary" onClick={retry}>
          {t('action.retry', '重试')}
        </button>
      </div>
    </div>
  )
}
