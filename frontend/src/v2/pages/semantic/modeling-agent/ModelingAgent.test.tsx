import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const specDraft = vi.fn()
const draftFromSpec = vi.fn()
const validateAgent = vi.fn()
const checkAgentReady = vi.fn()
const applyAgent = vi.fn()
const publishAgent = vi.fn()

vi.mock('@v2/hooks/semantic', () => ({
  useCreateSemanticModelingAgentSpecDraft: () => ({ mutateAsync: specDraft, isPending: false }),
  useDraftSemanticModelingAgentFromSpec: () => ({ mutateAsync: draftFromSpec, isPending: false }),
  useValidateSemanticModelingAgent: () => ({ mutateAsync: validateAgent, isPending: false }),
  useCheckSemanticModelingAgentReady: () => ({ mutateAsync: checkAgentReady, isPending: false }),
  useApplySemanticModelingAgent: () => ({ mutateAsync: applyAgent, isPending: false }),
  usePublishSemanticModelingAgent: () => ({ mutateAsync: publishAgent, isPending: false }),
}))

import ModelingAgent from './ModelingAgent'

const SPEC = {
  spec_version: 'v1',
  cube: { name: 'student_comments' },
  ontology: { object: { name: 'student_comment' }, metrics: [{ name: 'student_comment_total_count' }] },
}

describe('ModelingAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    specDraft.mockResolvedValue({ spec: SPEC, next_actions: { default_publish_target: 'cube_only' } })
    draftFromSpec.mockResolvedValue({ cube: SPEC.cube, ontology: SPEC.ontology, published: false })
    validateAgent.mockResolvedValue({ status: 'ready', issues: [], agent_sandbox_preview: { mode: 'draft_spec' } })
    checkAgentReady.mockResolvedValue({ status: 'ready', cube_status: 'active', ontology_status: 'active' })
    applyAgent.mockResolvedValue({ published: false, assets: { cube: SPEC.cube } })
    publishAgent.mockResolvedValue({ publish_targets: { cube: true, ontology: false } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('从事实表生成 spec 并按 cube-only 发布', async () => {
    render(
      <MemoryRouter>
        <ModelingAgent />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('事实表'), { target: { value: 'dwd_student_comment_events' } })
    fireEvent.change(screen.getByLabelText('业务主题'), { target: { value: '学生评论' } })
    fireEvent.click(screen.getByRole('button', { name: '生成 Spec' }))

    await waitFor(() => expect(specDraft).toHaveBeenCalledWith(expect.objectContaining({
      source_kind: 'physical_table',
      table: 'dwd_student_comment_events',
      business_subject: '学生评论',
    })))
    expect(await screen.findByText('student_comments')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '生成草稿' }))
    await waitFor(() => expect(draftFromSpec).toHaveBeenCalledWith(expect.objectContaining({ spec_version: 'v1' })))

    fireEvent.click(screen.getByRole('button', { name: '校验' }))
    await waitFor(() => expect(validateAgent).toHaveBeenCalled())
    expect(await screen.findByText('ready')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agent-ready' }))
    await waitFor(() => expect(checkAgentReady).toHaveBeenCalledWith(expect.objectContaining({ spec_version: 'v1' })))

    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(applyAgent).toHaveBeenCalledWith(expect.objectContaining({ spec_version: 'v1' })))

    fireEvent.click(screen.getByRole('button', { name: '发布 Cube' }))
    await waitFor(() => expect(publishAgent).toHaveBeenCalledWith({
      spec: expect.objectContaining({ spec_version: 'v1' }),
      publish_targets: { cube: true, ontology: false },
    }))
  })

  it('浏览器 E2E 夹具模式下可通过指针释放触发任务按钮', async () => {
    vi.stubEnv('VITE_BROWSER_E2E_FIXTURES', '1')

    render(
      <MemoryRouter>
        <ModelingAgent />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('事实表'), { target: { value: 'dwd_student_comment_events' } })
    fireEvent.change(screen.getByLabelText('业务主题'), { target: { value: '学生评论' } })
    fireEvent.pointerUp(screen.getByRole('button', { name: '生成 Spec' }))

    await waitFor(() => expect(specDraft).toHaveBeenCalledWith(expect.objectContaining({
      table: 'dwd_student_comment_events',
      business_subject: '学生评论',
    })))

    fireEvent.pointerUp(screen.getByRole('button', { name: '生成草稿' }))
    await waitFor(() => expect(draftFromSpec).toHaveBeenCalledWith(expect.objectContaining({ spec_version: 'v1' })))

    fireEvent.pointerUp(screen.getByRole('button', { name: 'Agent-ready' }))
    await waitFor(() => expect(checkAgentReady).toHaveBeenCalledWith(expect.objectContaining({ spec_version: 'v1' })))
  })
})
