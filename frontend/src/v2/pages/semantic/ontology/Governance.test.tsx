import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OntologyGovernance from './Governance'

vi.mock('@v2/hooks/ontology', () => ({
  usePolicyList: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useGlossaryList: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useCreatePolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateGlossary: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@v2/hooks/semantic', () => ({
  useSemanticMapperStaleCheck: () => ({
    data: { stale_items: [] },
    isLoading: false,
  }),
  useSemanticMapperConsistencyReport: () => ({
    data: { consistency_items: [] },
    isLoading: false,
  }),
}))

describe('OntologyGovernance', () => {
  it('使用内联二级 Tab，避免和内容区形成双重分隔线', () => {
    render(<OntologyGovernance />)

    expect(screen.getByRole('tablist', { name: '治理视图导航' }).className).not.toContain('border-b')
    expect(screen.getByRole('tab', { name: '数据策略' }).className).toContain('h-7')
    expect(screen.getByRole('tab', { name: '数据策略' }).className).not.toContain('-mb-px')
  })
})
