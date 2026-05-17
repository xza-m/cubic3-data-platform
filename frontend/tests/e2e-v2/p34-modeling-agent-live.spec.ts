// frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts
//
// P34 live - 对话原生 Modeling Copilot 真实后端闭环。
// 默认跳过，只有显式设置 P34_LIVE_API=1 时才运行，避免普通 v2 e2e
// 套件无意写入 session / proposal / 语义资产。

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const QUESTION = '查询最近7天学生评论数，按学校汇总'
const LIVE_QUESTION =
  process.env.P34_LIVE_QUESTION ||
  `${QUESTION}，源表 df_cb_258187.dwd_interaction_comment_reports_df，关键词 comment reports interaction`
const EXPECTED_SOURCE_TABLE = 'dwd_interaction_comment_reports_df'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T
  details?: unknown
}

type CopilotSession = {
  id: string
  current_proposal_id?: string | null
  status?: string
  user_goal?: string
  workbench_state?: Record<string, unknown>
  tool_traces?: Array<Record<string, unknown>>
}

type CopilotReview = {
  status?: string
  proposal_id?: string | null
  data_agent_consumption?: Record<string, unknown>
}

type SourceCandidate = {
  id?: string
  candidate_id?: string
  name?: string
  table?: string
}

test.skip(process.env.P34_LIVE_API !== '1', '显式设置 P34_LIVE_API=1 才运行真实后端 smoke')

async function login(request: APIRequestContext): Promise<{ token: string; headers: Record<string, string> }> {
  const explicit = process.env.P34_LIVE_AUTH_TOKEN || process.env.DOMAIN_SMOKE_AUTH_TOKEN
  if (explicit) {
    return { token: explicit, headers: { Authorization: `Bearer ${explicit}` } }
  }

  const username = process.env.DOMAIN_SMOKE_USERNAME || process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.DOMAIN_SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
  const response = await request.post('/api/v1/auth/login', {
    data: { username, password },
  })
  const payload = await parseResponse<ApiEnvelope<{ token?: string; access_token?: string }>>(response)
  expect(response.ok(), formatFailure('POST', '/api/v1/auth/login', response.status(), payload)).toBeTruthy()

  const token = payload.data?.token || payload.data?.access_token
  expect(token, `登录成功但响应缺少 token: ${JSON.stringify(payload)}`).toBeTruthy()
  return { token: token as string, headers: { Authorization: `Bearer ${token}` } }
}

async function api<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  data?: unknown,
): Promise<T> {
  const response = await request.fetch(path, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    data,
  })
  const payload = await parseResponse<ApiEnvelope<T>>(response)
  expect(response.ok(), formatFailure(method, path, response.status(), payload)).toBeTruthy()
  expect(payload.data, `${method} ${path} 响应缺少 data: ${JSON.stringify(payload)}`).toBeTruthy()
  return payload.data as T
}

async function parseResponse<T>(response: Awaited<ReturnType<APIRequestContext['fetch']>>): Promise<T> {
  const text = await response.text()
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    return { message: text } as T
  }
}

function formatFailure(method: string, path: string, status: number, payload: unknown): string {
  return `${method} ${path} 返回 ${status}: ${JSON.stringify(payload)}`
}

function stateOf(session: CopilotSession): Record<string, unknown> {
  return session.workbench_state || {}
}

function objectAt(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function arrayAt(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : []
}

async function confirmBlockingItems(
  request: APIRequestContext,
  session: CopilotSession,
  headers: Record<string, string>,
): Promise<CopilotSession> {
  let current = session
  for (const item of arrayAt(stateOf(current).required_confirmations)) {
    const confirmationId = String(item.id || '')
    if (!confirmationId) continue
    current = await api<CopilotSession>(
      request,
      'POST',
      `/api/v1/semantic/modeling-copilot/sessions/${current.id}/confirmations`,
      headers,
      {
        confirmation_id: confirmationId,
        value: item.recommended_value ?? true,
      },
    )
  }
  return current
}

async function ensureReviewableSpec(
  request: APIRequestContext,
  session: CopilotSession,
  headers: Record<string, string>,
): Promise<CopilotSession> {
  const traces = (session.tool_traces || []).map((item) => String(item.tool || item.title || ''))
  const state = stateOf(session)
  if (objectAt(state.raw_spec).cube) {
    expect(
      traces.includes('deterministic.fast_path') || traces.includes('generate_semantic_draft'),
      `已有 raw_spec 但缺少生成 trace: ${JSON.stringify(session.tool_traces)}`,
    ).toBeTruthy()
    return session
  }

  const candidates = arrayAt(state.source_candidates) as SourceCandidate[]
  expect(candidates.length, `未生成 raw_spec，且没有候选来源可确认: ${JSON.stringify(state)}`).toBeGreaterThan(0)
  const candidate =
    candidates.find((item) => {
      const text = `${item.name || ''} ${item.table || ''}`.toLowerCase()
      return text.includes(EXPECTED_SOURCE_TABLE)
    }) || candidates[0]
  const selectedCandidate = candidate as SourceCandidate
  const candidateId = String(selectedCandidate.id || selectedCandidate.candidate_id || '')
  expect(candidateId, `候选来源缺少 id: ${JSON.stringify(candidate)}`).toBeTruthy()

  const confirmed = await api<CopilotSession>(
    request,
    'POST',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/messages`,
    headers,
    {
      message: `使用此来源：${selectedCandidate.name || selectedCandidate.table || candidateId}`,
      action: 'confirm_source_candidate',
      candidate_id: candidateId,
    },
  )
  const confirmedState = stateOf(confirmed)
  expect(objectAt(confirmedState.raw_spec).cube, `确认候选来源后仍缺少 raw_spec: ${JSON.stringify(confirmedState)}`)
    .toBeTruthy()
  expect(
    JSON.stringify(confirmedState.raw_spec),
    `学生评论 live spec 未落到 ${EXPECTED_SOURCE_TABLE}: ${JSON.stringify(confirmedState.raw_spec)}`,
  ).toContain(EXPECTED_SOURCE_TABLE)
  const confirmedTraces = (confirmed.tool_traces || []).map((item) => String(item.tool || item.title || ''))
  expect(confirmedTraces, `确认候选来源后未生成 semantic draft: ${JSON.stringify(confirmed.tool_traces)}`)
    .toContain('generate_semantic_draft')
  return confirmed
}

async function openPublishedSession(page: Page, token: string, sessionId: string): Promise<void> {
  await page.addInitScript((accessToken: string) => {
    window.sessionStorage.setItem('v2.access_token', accessToken)
    window.localStorage.setItem('auth_token', accessToken)
  }, token)
  await page.goto(`/semantic/modeling-agent/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('chat-workspace')).toBeVisible()
  await expect(page.getByText(LIVE_QUESTION).first()).toBeVisible()
  await expect(page.getByText(/语义已发布|Data Agent 可消费|已发布/).first()).toBeVisible()
}

test('P34 live 真实后端完成 session -> deterministic draft -> proposal -> publish @live @p34', async ({
  page,
  request,
}) => {
  const auth = await login(request)

  let session = await api<CopilotSession>(
    request,
    'POST',
    '/api/v1/semantic/modeling-copilot/sessions',
    auth.headers,
    {
      user_goal: QUESTION,
      message: LIVE_QUESTION,
      entry_type: 'business_question',
    },
  )
  expect(session.id).toBeTruthy()

  session = await api<CopilotSession>(
    request,
    'POST',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/messages`,
    auth.headers,
    { message: LIVE_QUESTION },
  )

  session = await ensureReviewableSpec(request, session, auth.headers)
  session = await confirmBlockingItems(request, session, auth.headers)
  const stateAfterMessage = stateOf(session)
  expect(objectAt(stateAfterMessage.raw_spec).cube, `缺少可保存 raw_spec: ${JSON.stringify(stateAfterMessage)}`)
    .toBeTruthy()

  session = await api<CopilotSession>(
    request,
    'POST',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/accept-cube-draft`,
    auth.headers,
    { reason: 'p34_live_smoke' },
  )
  expect(stateOf(session).cube_draft_accepted).toBe(true)

  session = await api<CopilotSession>(
    request,
    'POST',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/sandbox`,
    auth.headers,
    { sample_question: QUESTION },
  )
  expect(objectAt(stateOf(session).sandbox_preview).pollutes_official_route).toBe(false)

  session = await api<CopilotSession>(
    request,
    'POST',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/save-proposal`,
    auth.headers,
    { source: 'p34_live_smoke' },
  )
  const proposalId = session.current_proposal_id || String(objectAt(stateOf(session).advanced_refs).proposal_id || '')
  expect(proposalId, `保存 Proposal 后缺少 proposal id: ${JSON.stringify(session)}`).toBeTruthy()

  session = await api<CopilotSession>(
    request,
    'POST',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/publish`,
    auth.headers,
    { source: 'p34_live_smoke' },
  )
  expect(objectAt(stateOf(session).publish_result).status, JSON.stringify(stateOf(session).publish_result))
    .toBe('published')

  const review = await api<CopilotReview>(
    request,
    'GET',
    `/api/v1/semantic/modeling-copilot/sessions/${session.id}/review`,
    auth.headers,
  )
  expect(review.status).toBe('published')
  expect(objectAt(review.data_agent_consumption).state).toBe('available')

  await openPublishedSession(page, auth.token, session.id)
})
