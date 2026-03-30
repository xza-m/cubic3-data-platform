import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/Layout/AppLayout', () => ({
  default: () => (
    <div data-testid="app-layout">
      <Outlet />
    </div>
  ),
}))

vi.mock('./components/auth/ProtectedRoute', () => ({
  default: () => (
    <div data-testid="protected-route">
      <Outlet />
    </div>
  ),
}))

vi.mock('@/components/business', () => ({
  Toaster: () => <div data-testid="toaster" />,
}))

vi.mock('./pages/Dashboard', () => ({
  default: () => <div>Dashboard 页面</div>,
}))

vi.mock('./pages/AppCenter/AppMarket', () => ({
  default: () => <div>应用市场页</div>,
}))

vi.mock('./pages/QueryCenter/Dashboard', () => ({
  default: () => <div>查询分析仪表盘</div>,
}))

vi.mock('./pages/Login', () => ({
  default: () => <div>登录页面</div>,
}))

vi.mock('./pages/Semantic/CubeList', () => ({
  default: () => <div>Cube 列表页</div>,
}))

vi.mock('./pages/Semantic/DevTools', () => ({
  default: () => <div>语义工作台页</div>,
}))

vi.mock('./pages/Semantic/ModelingRedirect', () => ({
  default: () => <div>领域画布跳转页</div>,
}))

vi.mock('./pages/Semantic/Playground', () => ({
  default: () => <div>Cube Playground 页</div>,
}))

vi.mock('./pages/Semantic/RelationCanvas', () => ({
  default: () => <div>Cube 关系画布页</div>,
}))

vi.mock('./pages/Semantic/DomainCanvas', () => ({
  default: () => <div>领域画布页</div>,
}))

function renderApp(initialEntry: string) {
  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('App routes', () => {
  it('登录路由使用独立布局并渲染 Toaster', async () => {
    renderApp('/login')

    expect(await screen.findByText('登录页面')).toBeInTheDocument()
    expect(screen.queryByTestId('app-layout')).not.toBeInTheDocument()
    expect(screen.getByTestId('toaster')).toBeInTheDocument()
  })

  it('首页会重定向到 dashboard 并经过受保护布局', async () => {
    renderApp('/')

    expect(await screen.findByText('Dashboard 页面')).toBeInTheDocument()
    expect(screen.getByTestId('protected-route')).toBeInTheDocument()
    expect(screen.getByTestId('app-layout')).toBeInTheDocument()
  })

  it('语义旧路由会重定向到新入口并保留查询参数', async () => {
    renderApp('/semantic/playground?tab=overview')

    expect(await screen.findByText('Cube 列表页')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/cubes?tab=overview')
  })

  it('语义中心默认入口和旧工具入口会统一收口到语义工作台', async () => {
    const firstRender = renderApp('/semantic')
    expect(await screen.findByText('语义工作台页')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench')
    firstRender.unmount()

    renderApp('/semantic/tools?tab=sync')
    expect(await screen.findByText('语义工作台页')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench?tab=sync')
  })

  it('Cube 主路径使用新界面：列表走 Cube 列表，旧详情入口会收口到编辑画布', async () => {
    const firstRender = renderApp('/semantic/cubes')
    expect(await screen.findByText('Cube 列表页')).toBeInTheDocument()
    firstRender.unmount()

    const secondRender = renderApp('/semantic/cubes/answer_records')
    expect(await screen.findByText('Cube 关系画布页')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/cubes/answer_records/edit')
    secondRender.unmount()

    renderApp('/semantic/cubes/answer_records/edit')
    expect(await screen.findByText('Cube 关系画布页')).toBeInTheDocument()
  })

  it('查询分析入口会进入新的查询分析中心主工作台', async () => {
    renderApp('/queries')

    expect(await screen.findByText('查询分析仪表盘')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/queries')
  })

  it('旧查询子路由会收口到 /queries 并保留兼容意图参数', async () => {
    const firstRender = renderApp('/queries/editor?folder=teaching')
    expect(await screen.findByText('查询分析仪表盘')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/queries?legacy=editor&folder=teaching')
    firstRender.unmount()

    renderApp('/queries/templates?category=ops')
    expect(await screen.findByText('查询分析仪表盘')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/queries?legacy=templates&category=ops')
  })

  it('应用详情旧深链会回到应用市场', async () => {
    renderApp('/apps/daily-report')

    expect(await screen.findByText('应用市场页')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/apps')
  })

  it('旧版领域画布路由会重定向到新画布路径', async () => {
    renderApp('/semantic/domains/domain-1/canvas?mode=focus')

    expect(await screen.findByText('领域画布页')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/domains/domain-1?mode=focus')
  })

  it('未知路由会回到 dashboard', async () => {
    renderApp('/not-found')

    expect(await screen.findByText('Dashboard 页面')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/dashboard')
  })
})
