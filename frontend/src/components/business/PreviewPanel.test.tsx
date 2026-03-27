import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreviewPanel } from './index'

describe('PreviewPanel', () => {
  it('在 loading 状态渲染加载提示', () => {
    render(
      <PreviewPanel
        title="预览"
        state="loading"
        loadingText="正在加载预览内容"
      />,
    )

    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
    expect(screen.getByText('预览')).toBeInTheDocument()
    expect(screen.getByText('正在加载预览内容')).toBeInTheDocument()
  })

  it('在 empty 状态渲染空态提示', () => {
    render(
      <PreviewPanel
        title="预览"
        state="empty"
        emptyTitle="暂无可预览内容"
        emptyDescription="请选择一个对象后再查看。"
      />,
    )

    expect(screen.getByText('暂无可预览内容')).toBeInTheDocument()
    expect(screen.getByText('请选择一个对象后再查看。')).toBeInTheDocument()
  })

  it('在 error 状态渲染错误提示', () => {
    render(
      <PreviewPanel
        title="预览"
        state="error"
        errorTitle="预览失败"
        errorDescription="后端暂时无法返回内容。"
      />,
    )

    expect(screen.getByText('预览失败')).toBeInTheDocument()
    expect(screen.getByText('后端暂时无法返回内容。')).toBeInTheDocument()
  })

  it('在 ready 状态渲染正文内容', () => {
    render(
      <PreviewPanel title="预览" state="ready">
        <div>预览正文</div>
      </PreviewPanel>,
    )

    expect(screen.getByText('预览正文')).toBeInTheDocument()
  })
})
