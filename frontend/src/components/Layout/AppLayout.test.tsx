import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppLayout from './AppLayout'

vi.mock('overlayscrollbars-react', () => ({
  OverlayScrollbarsComponent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

function renderLayout(initialEntry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>登录页</div>} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>工作台页面</div>} />
          <Route path="/semantic/cubes" element={<div>Cube 页面</div>} />
          <Route path="/data-center/datasources" element={<div>数据源页面</div>} />
          <Route path="/data-center/datasets" element={<div>数据集页面</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  it('渲染暗色侧边栏和导航项', async () => {
    const user = userEvent.setup()
    renderLayout('/dashboard')

    await user.hover(screen.getByTestId('app-shell-sidebar'))

    expect(screen.getByText('Cubic³')).toBeInTheDocument()
    expect(screen.getByText('工作台')).toBeInTheDocument()
    expect(screen.getByText('查询分析')).toBeInTheDocument()
    expect(screen.getByText('数据中心')).toBeInTheDocument()
    expect(screen.getByText('语义中心')).toBeInTheDocument()
    expect(screen.getByText('智能问数')).toBeInTheDocument()
    expect(screen.getByText('数据工程师')).toBeInTheDocument()
    expect(screen.getByText('数据源')).toBeInTheDocument()
    expect(screen.getByText('应用市场')).toBeInTheDocument()
    expect(screen.getByText('渠道管理')).toBeInTheDocument()
    expect(screen.getByText('语义工作台')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '通知中心' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument()
  })

  it('语义中心子导航使用最新 IA 文案与入口', async () => {
    const user = userEvent.setup()
    renderLayout('/semantic/cubes')

    await user.hover(screen.getByTestId('app-shell-sidebar'))

    expect(screen.getByText('语义工作台')).toBeInTheDocument()
    expect(screen.getByText('Cube 管理')).toBeInTheDocument()
    expect(screen.getByText('领域建模')).toBeInTheDocument()
    expect(screen.queryByText('总览')).not.toBeInTheDocument()
    expect(screen.queryByText('开发工具')).not.toBeInTheDocument()
    expect(screen.queryByText('领域画布')).not.toBeInTheDocument()
  })

  it('退出登录后跳回登录页', async () => {
    const user = userEvent.setup()
    const originalLocalStorage = globalThis.localStorage
    const removeItem = vi.fn()

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem,
        clear: vi.fn(),
      },
    })

    renderLayout('/semantic/cubes')

    await user.hover(screen.getByTestId('app-shell-sidebar'))

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))

    expect(removeItem).toHaveBeenCalledWith('auth_token')
    expect(screen.getByText('登录页')).toBeInTheDocument()

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
  })

  it('鼠标仍停留在侧边栏时，切换 tab 后应保持展开', async () => {
    const user = userEvent.setup()
    renderLayout('/dashboard')

    const sidebar = screen.getByTestId('app-shell-sidebar')
    fireEvent.mouseEnter(sidebar)
    expect(sidebar.className).toContain('w-60')

    await user.click(screen.getByRole('button', { name: /数据源/i }))

    expect(await screen.findByText('数据源页面')).toBeInTheDocument()
    expect(sidebar.className).toContain('w-60')
  })

  it('鼠标仍停留在侧边栏时，切换二级功能页后应保持展开', async () => {
    renderLayout('/data-center/datasources')

    const sidebar = screen.getByTestId('app-shell-sidebar')
    fireEvent.mouseEnter(sidebar)

    const datasetButton = screen.getByRole('button', { name: /^数据集$/ })
    fireEvent.click(datasetButton)

    expect(await screen.findByText('数据集页面')).toBeInTheDocument()
    expect(sidebar.className).toContain('w-60')
    expect(screen.getByRole('button', { name: /^数据源$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^数据集$/ })).toBeVisible()
  }, 10_000)
})
