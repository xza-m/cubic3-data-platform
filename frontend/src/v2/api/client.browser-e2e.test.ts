import axios, { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, createApiClient, setTokenPair } from './client'

beforeEach(() => {
  clearTokens()
  vi.restoreAllMocks()
})

describe('browser E2E fixture client', () => {
  it('serves modeling-copilot session APIs without a live backend', async () => {
    const client = createApiClient('/api/v1', { browserE2eFixtures: true })

    const prefs = await client.get('/access/me/preferences')
    expect(prefs.data.data.default_landing).toBe('/dashboard')

    const created = await client.post('/semantic/modeling-copilot/sessions', {
      user_goal: '创建学生评论语义模型',
      entry_type: 'business_question',
    })
    const session = created.data.data
    expect(session.id).toBe('fixture_modeling_session')
    expect(session.workbench_state).toBeTruthy()

    const replied = await client.post(`/semantic/modeling-copilot/sessions/${session.id}/messages`, {
      message: '继续生成草稿',
    })
    expect(replied.data.data.workbench_state).toBeTruthy()
    expect(replied.data.data.workbench_state.semantic_canvas.objects[0].name).toBe('student_comment')

    const releasePreview = await client.post(`/semantic/modeling-copilot/sessions/${session.id}/release-preview`, {
      sample_questions: ['昨天评论数是多少？'],
    })
    expect(releasePreview.data.data.workbench_state.release_preview.target).toBe('semantic_center')
    expect(releasePreview.data.data.workbench_state.release_preview.compiled_sql).toBe('')
    expect(releasePreview.data.data.workbench_state.release_preview.gateway_validation.status).toBe('not_configured')
  })
})

describe('api client token-pair refresh', () => {
  it('does not refresh auth endpoints after 401', async () => {
    const refreshSpy = vi.spyOn(axios, 'post')
    const client = createApiClient('/api/v1')
    window.history.pushState({}, '', '/login')
    client.defaults.adapter = async (config) => {
      const response = {
        data: { code: 'INVALID_AUTHORIZATION_CODE', message: '授权码无效' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        request: {},
      } as AxiosResponse
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, response)
    }
    setTokenPair({ access_token: 'expired-access', refresh_token: 'refresh-token' })

    await expect(client.post('/auth/feishu/exchange', { code: 'bad-code' })).rejects.toMatchObject({
      httpStatus: 401,
    })
    expect(refreshSpy).not.toHaveBeenCalled()
  })
})
