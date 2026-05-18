import { describe, expect, it } from 'vitest'
import { createApiClient } from './client'

describe('browser E2E fixture client', () => {
  it('serves modeling-agent shell and task APIs without a live backend', async () => {
    const client = createApiClient('/api/v1', { browserE2eFixtures: true })

    const prefs = await client.get('/access/me/preferences')
    expect(prefs.data.data.default_landing).toBe('/dashboard')

    const specDraft = await client.post('/semantic/modeling-agent/spec-draft', {
      source_kind: 'physical_table',
      source_id: '1',
      database: 'dw',
      schema: 'dwd',
      table: 'dwd_student_comment_events',
      business_subject: '学生评论',
      default_roles: ['teacher_ops', 'content_audit'],
      sensitivity_level: 'restricted',
    })
    const spec = specDraft.data.data.spec
    expect(spec.cube.name).toBe('student_comment_events')
    expect(spec.ontology.object.name).toBe('student_comment')

    const validation = await client.post('/semantic/modeling-agent/validate', { spec })
    expect(validation.data.data.status).toBe('ready')

    const ready = await client.post('/semantic/modeling-agent/agent-ready-check', { spec })
    expect(ready.data.data.status).toBe('ready')
    expect(ready.data.data.truth_sources).toMatchObject({
      business: 'ontology',
      execution: 'cube',
      domain: 'business_context',
    })
  })
})
