import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@v2/hooks/agent', () => ({
  useAgentSemanticPlan: vi.fn(),
}))

vi.mock('@v2/hooks/ontology', () => ({
  useWorkbenchObjects: vi.fn(),
}))

import { useAgentSemanticPlan } from '@v2/hooks/agent'
import { useWorkbenchObjects } from '@v2/hooks/ontology'
import OntologyWorkbench from './Workbench'

const mockUseAgentSemanticPlan = vi.mocked(useAgentSemanticPlan)
const mockUseWorkbenchObjects = vi.mocked(useWorkbenchObjects)

describe('OntologyWorkbench page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAgentSemanticPlan.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      data: undefined,
      error: null,
    } as unknown as ReturnType<typeof useAgentSemanticPlan>)
    mockUseWorkbenchObjects.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useWorkbenchObjects>)
  })

  it('正文不再展示扩展能力索引，导航入口交给二级菜单承载', () => {
    render(
      <MemoryRouter>
        <OntologyWorkbench />
      </MemoryRouter>,
    )

    expect(screen.queryByText('本体扩展能力')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Cube/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /业务上下文/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /关系画布/ })).not.toBeInTheDocument()
  })
})
