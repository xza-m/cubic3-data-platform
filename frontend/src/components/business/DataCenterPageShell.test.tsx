import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CapabilityGateCard, DataCenterPageShell } from './index'

describe('DataCenterPageShell', () => {
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
