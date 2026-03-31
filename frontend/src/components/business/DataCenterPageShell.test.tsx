import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CapabilityGateCard, DataCenterPageShell } from './index'

describe('DataCenterPageShell', () => {
  it('将 description、actions、status 分别放入对应槽位', () => {
    render(
      <DataCenterPageShell
        title="数据中心"
        description="统一管理数据资产"
        actions={<button type="button">新建数据源</button>}
        status={<div>同步中</div>}
      >
        <div>壳层正文</div>
      </DataCenterPageShell>,
    )

    const shell = screen.getByTestId('data-center-page-shell')
    const header = shell.querySelector('header')
    const bodySections = shell.querySelectorAll(':scope > div > section')

    expect(header).not.toBeNull()
    expect(within(header as HTMLElement).getByRole('heading', { name: '数据中心' })).toBeInTheDocument()
    expect(within(header as HTMLElement).getByText('统一管理数据资产')).toBeInTheDocument()
    expect(within(header as HTMLElement).getByRole('button', { name: '新建数据源' })).toBeInTheDocument()
    expect(bodySections).toHaveLength(2)
    expect(within(bodySections[0] as HTMLElement).getByText('同步中')).toBeInTheDocument()
    expect(within(bodySections[1] as HTMLElement).getByText('壳层正文')).toBeInTheDocument()
  })

  it('在禁用能力卡片中展示原因且不暴露可点击主动作', () => {
    render(
      <DataCenterPageShell title="数据中心">
        <CapabilityGateCard title="血缘关系" reason="当前阶段未接入后端能力" />
      </DataCenterPageShell>,
    )

    expect(screen.getByText('数据中心')).toBeInTheDocument()
    expect(screen.getByText('血缘关系')).toBeInTheDocument()
    expect(screen.getAllByText('当前阶段未接入后端能力')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /立即查看/ })).not.toBeInTheDocument()
  })
})
