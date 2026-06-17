import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppRoutes from './routes'

vi.mock('@v2/pages/ProtectedRoute', () => ({
  default: () => <Outlet />,
}))

vi.mock('@v2/layout/AppShell', () => ({
  AppShell: () => <Outlet />,
}))

vi.mock('@v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench', () => ({
  default: () => <div data-testid="semantic-modeling-workbench">SemanticModelingWorkbench</div>,
}))

vi.mock('@v2/pages/data/DataCenter', () => ({
  default: () => <div data-testid="data-center">DataCenter</div>,
}))

vi.mock('@v2/pages/NotFound', () => ({
  default: () => <div data-testid="not-found">NotFound</div>,
}))

function LocationProbe() {
  const location = useLocation()
  const navigationType = useNavigationType()

  return (
    <>
      <output data-testid="current-path">{location.pathname}</output>
      <output data-testid="current-search">{location.search}</output>
      <output data-testid="navigation-type">{navigationType}</output>
    </>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('AppRoutes semantic route surface', () => {
  it('语义建设只暴露新 workbench 路由', async () => {
    renderAt('/semantic/modeling-workbench/quick')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/semantic/modeling-workbench/quick')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    await waitFor(() => {
      expect(screen.getByTestId('semantic-modeling-workbench')).toBeInTheDocument()
    })
  })

  it('旧 modeling-copilot URL 不再重定向到新工作台', async () => {
    renderAt('/semantic/modeling-copilot/new')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/semantic/modeling-copilot/new')
    expect(screen.getByTestId('current-search')).toHaveTextContent('')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    expect(screen.queryByTestId('semantic-modeling-workbench')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('not-found')).toBeInTheDocument()
    })
  })

  it('旧语义中心别名 URL 不再重定向', async () => {
    renderAt('/semantic/overview')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/semantic/overview')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    await waitFor(() => {
      expect(screen.getByTestId('not-found')).toBeInTheDocument()
    })
  })
})

describe('AppRoutes data-center IA surface', () => {
  it('新数据中心连接路径直接渲染正式工作台', async () => {
    renderAt('/data-center/connections')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/data-center/connections')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    await waitFor(() => {
      expect(screen.getByTestId('data-center')).toBeInTheDocument()
    })
  })

  it('数据中心同步主 Tab 进入统一工作台，不直接跳到二级任务列表', async () => {
    renderAt('/data-center/sync')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/data-center/sync')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    await waitFor(() => {
      expect(screen.getByTestId('data-center')).toBeInTheDocument()
    })
  })

  it.each([
    ['/datasources', '/data-center/connections'],
    ['/datasources/3', '/data-center/connections/3'],
    ['/datasets', '/data-center/assets'],
    ['/datasets/7', '/data-center/assets/7'],
    ['/extraction', '/data-center/sync/tasks'],
  ])('v1 顶级旧路径 %s 重定向到 %s', async (from, to) => {
    renderAt(from)

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent(to)
    })
  })

  it('旧数据源列表路径不再重定向到新 IA', async () => {
    renderAt('/data-center/datasources')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/data-center/datasources')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    expect(screen.queryByTestId('data-center')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('not-found')).toBeInTheDocument()
    })
  })

  it('旧同步任务路径不再作为数据中心兼容入口', async () => {
    renderAt('/extraction/tasks')

    expect(screen.getByTestId('current-path')).toHaveTextContent('/extraction/tasks')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('POP')
    expect(screen.queryByTestId('data-center')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('not-found')).toBeInTheDocument()
    })
  })
})
