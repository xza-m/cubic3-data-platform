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

vi.mock('@v2/pages/semantic/modeling-copilot/ModelingAgent', () => ({
  default: () => <div data-testid="semantic-modeling-copilot">SemanticModelingCopilot</div>,
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

describe('AppRoutes semantic modeling convergence', () => {
  it('/semantic/modeling-copilot/new replace 跳到 /semantic/modeling-workbench/quick', async () => {
    renderAt('/semantic/modeling-copilot/new')

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/semantic/modeling-workbench/quick')
    })
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE')
    await waitFor(() => {
      expect(screen.getByTestId('semantic-modeling-workbench')).toBeInTheDocument()
    })
  })

  it('/semantic/modeling-copilot/batch replace 跳到 /semantic/modeling-workbench', async () => {
    renderAt('/semantic/modeling-copilot/batch')

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/semantic/modeling-workbench')
    })
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE')
    await waitFor(() => {
      expect(screen.getByTestId('semantic-modeling-workbench')).toBeInTheDocument()
    })
  })

  it('/semantic/modeling-copilot/:sessionId replace 跳到工作台并保留内部 sessionId', async () => {
    renderAt('/semantic/modeling-copilot/session-123')

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/semantic/modeling-workbench/quick')
    })
    expect(screen.getByTestId('current-search')).toHaveTextContent('?sessionId=session-123')
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE')
    await waitFor(() => {
      expect(screen.getByTestId('semantic-modeling-workbench')).toBeInTheDocument()
    })
  })
})
