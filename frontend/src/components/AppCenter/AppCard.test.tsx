import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppDefinition } from '@/api/appCenter'
import AppCard from './AppCard'

function makeApp(overrides: Partial<AppDefinition> = {}): AppDefinition {
  return {
    id: 1,
    code: 'report_push',
    name: '日报推送',
    category: 'report',
    description: '按日报模板推送数据报告',
    config_schema: null,
    icon: 'file',
    author: 'alice',
    version: '1.0.0',
    enabled: true,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
    instance_count: 2,
    ...overrides,
  }
}

describe('AppCard', () => {
  it('支持点击、Enter 和 Space 触发打开', () => {
    const onClick = vi.fn()

    render(<AppCard app={makeApp()} onClick={onClick} />)

    const card = screen.getByRole('button', { name: /日报推送/ })

    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.keyDown(card, { key: 'Escape' })

    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('未知应用编码时回退到默认图标样式和实例文案', () => {
    render(
      <AppCard
        app={makeApp({
          code: 'custom_app',
          name: '自定义应用',
          enabled: false,
          instance_count: undefined,
        })}
      />,
    )

    expect(screen.getByText('0 个实例 · 未启用')).toBeInTheDocument()
    expect(screen.getByText('查看详情')).toBeInTheDocument()
  })
})
