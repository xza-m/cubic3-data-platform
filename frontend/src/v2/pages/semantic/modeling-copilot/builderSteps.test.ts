import { describe, expect, it } from 'vitest'
import { BUILDER_STEPS, getActiveBuilderStepId } from './builderSteps'
import type { SemanticModelingCopilotSession } from '@v2/api/semantic'

function makeSession(overrides: Partial<SemanticModelingCopilotSession> = {}): SemanticModelingCopilotSession {
  return {
    id: 'session_1',
    user_goal: '建设评论数语义资产',
    entry_type: 'business_question',
    status: 'active',
    workbench_state: {},
    ...overrides,
  }
}

describe('semantic builder steps', () => {
  it('按建设流程顺序暴露步骤标签和说明', () => {
    expect(BUILDER_STEPS).toEqual([
      expect.objectContaining({ id: 'scope', label: '建设范围', description: expect.any(String) }),
      expect.objectContaining({ id: 'source_evidence', label: '来源证据', description: expect.any(String) }),
      expect.objectContaining({ id: 'field_candidates', label: '字段候选', description: expect.any(String) }),
      expect.objectContaining({ id: 'semantic_draft', label: '语义草案', description: expect.any(String) }),
      expect.objectContaining({ id: 'publish_check', label: '发布校验', description: expect.any(String) }),
      expect.objectContaining({ id: 'publish_result', label: '发布结果', description: expect.any(String) }),
    ])

    BUILDER_STEPS.forEach((step) => {
      expect(step.description.trim()).not.toBe('')
    })
  })

  it('source_candidates 只能推进到来源证据，不直接进入字段候选', () => {
    const session = makeSession({
      workbench_state: {
        source_candidates: [{ id: 'source_1', title: 'dwd_student_comment' }],
      },
    })

    expect(getActiveBuilderStepId(session)).toBe('source_evidence')
  })

  it('field_candidate_trace 存在 candidate_set_id 时推进到字段候选', () => {
    const session = makeSession({
      workbench_state: {
        field_candidate_trace: { candidate_set_id: 'fcs_student_comment' },
      },
    })

    expect(getActiveBuilderStepId(session)).toBe('field_candidates')
  })

  it.each([
    ['spec_version', { spec_version: '1.0' }],
    ['cube', { cube: { name: 'student_comment', source: 'dwd_student_comment' } }],
    ['cubes', { cubes: [{ name: 'student_comment', source: 'dwd_student_comment' }] }],
  ])('raw_spec 有 %s 时推进到语义草案', (_field, rawSpec) => {
    expect(getActiveBuilderStepId(makeSession({ workbench_state: { raw_spec: rawSpec } }))).toBe('semantic_draft')
  })

  it('current_proposal_id 存在时优先于 raw_spec 推进到发布校验', () => {
    const session = makeSession({
      current_proposal_id: 'proposal_1',
      workbench_state: {
        raw_spec: {
          spec_version: '1.0',
          cube: { name: 'student_comment', source: 'dwd_student_comment' },
        },
      },
    })

    expect(getActiveBuilderStepId(session)).toBe('publish_check')
  })

  it('publish_result 存在时优先于 current_proposal_id 和 raw_spec 推进到发布结果', () => {
    const session = makeSession({
      current_proposal_id: 'proposal_1',
      workbench_state: {
        raw_spec: {
          spec_version: '1.0',
          cube: { name: 'student_comment', source: 'dwd_student_comment' },
        },
        publish_result: { status: 'published', proposal_id: 'proposal_1' },
      },
    })

    expect(getActiveBuilderStepId(session)).toBe('publish_result')
  })

  it('空 session 返回建设范围', () => {
    expect(getActiveBuilderStepId(null)).toBe('scope')
    expect(getActiveBuilderStepId(undefined)).toBe('scope')
  })
})
