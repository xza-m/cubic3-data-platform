// frontend/src/v2/pages/chat/DataChat.tsx
//
// Data Chat 对话工作台。当前接入已有 /api/v1/conversations 契约：
// 选择数据集 → 创建/选择对话 → 发送问题。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, MessageSquarePlus, Send, Sparkles } from 'lucide-react'
import { useDatasets } from '@v2/hooks/datasets'
import { useAgentSemanticExecute } from '@v2/hooks/agent'
import { useCubeList } from '@v2/hooks/semantic'
import {
  useConversation,
  useConversations,
  useCreateConversation,
  useSendConversationMessage,
} from '@v2/hooks/conversations'
import type { Conversation, ConversationMessage } from '@v2/api/conversations'
import type { AgentSemanticExecuteResponse } from '@v2/api/agent'
import { Button, Card, CardBody, CardHead, Chip, Select, Textarea, useToast } from '@v2/components/ui'
import { RefreshButton } from '@v2/components/CommonControls'
import { useAppShell } from '@v2/layout/AppShell'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

const DEFAULT_CONVERSATION_PARAMS = { offset: 0, limit: 20 }

function titleFromQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, ' ')
  if (!normalized) return t('dataChat.defaultTitle', '新的数据对话')
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized
}

function messageTone(role: string): 'accent' | 'neutral' {
  return role === 'user' ? 'accent' : 'neutral'
}

export default function DataChat() {
  const toast = useToast()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const datasetsQ = useDatasets({ page: 1, page_size: 100 })
  const cubesQ = useCubeList({ page: 1, page_size: 50 })
  const conversationsQ = useConversations(DEFAULT_CONVERSATION_PARAMS)
  const createConversationMut = useCreateConversation()
  const sendMessageMut = useSendConversationMessage()
  const executeSemanticMut = useAgentSemanticExecute()

  const datasets = useMemo(() => datasetsQ.data?.items ?? [], [datasetsQ.data?.items])
  const cubes = useMemo(() => cubesQ.data?.cubes ?? [], [cubesQ.data?.cubes])
  const conversations = useMemo(() => conversationsQ.data?.items ?? [], [conversationsQ.data?.items])
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [executeConversationId, setExecuteConversationId] = useState<number | null>(null)

  const activeConversationQ = useConversation(activeConversationId)
  const {
    data: activeConversationData,
    refetch: refetchActiveConversation,
    isFetching: isActiveConversationFetching,
  } = activeConversationQ
  const activeConversation = activeConversationData ?? conversations.find((c) => c.id === activeConversationId) ?? null
  const messages = activeConversationData?.messages ?? []

  const handleRefresh = useCallback(() => {
    if (activeConversationId == null) {
      return conversationsQ.refetch()
    }
    return Promise.all([
      conversationsQ.refetch(),
      refetchActiveConversation(),
    ])
  }, [activeConversationId, conversationsQ, refetchActiveConversation])

  useEffect(() => {
    setBreadcrumbs([t('nav.chat.label', 'Data Chat')])
    setTopBarActions(
      <RefreshButton
        onClick={handleRefresh}
        loading={conversationsQ.isFetching || isActiveConversationFetching}
        ariaLabel={t('dataChat.action.refresh', '刷新数据对话')}
      />,
    )
    setContextPanel({
      title: t('dataChat.ctx.title', 'Data Chat'),
      subtitle: t('dataChat.ctx.subtitle', '选择数据集后发起自然语言问数'),
      body: (
        <div className="space-y-3 px-4 py-4 text-xs text-2">
          <p>{t('dataChat.ctx.datasetFirst', '直接提问；可在左侧选择某个数据集以限定范围（可选）。')}</p>
          <p>{t('dataChat.ctx.trust', '回答会标注来源，优先使用已验证的语义层结果。')}</p>
        </div>
      ),
    })
    return () => {
      setTopBarActions(null)
      setContextPanel(null)
    }
  }, [
    conversationsQ.isFetching,
    handleRefresh,
    isActiveConversationFetching,
    setBreadcrumbs,
    setContextPanel,
    setTopBarActions,
  ])

  useEffect(() => {
    if (activeConversationId == null && conversations.length > 0) {
      const first = conversations[0]
      setActiveConversationId(first.id)
      if (first.dataset_id != null) setSelectedDatasetId(first.dataset_id)
    }
  }, [activeConversationId, conversations])

  const selectedDataset = datasets.find((item) => item.id === selectedDatasetId) ?? null
  // 全局问数：dataset 可选，不再强制选择；selectedDatasetId 为 null 即「全局（不限数据集）」。
  const canSend = draft.trim().length > 0 && !sendMessageMut.isPending && !createConversationMut.isPending

  const handleNewConversation = () => {
    setActiveConversationId(null)
    setDraft('')
  }

  const handleSend = async () => {
    const question = draft.trim()
    if (!question) return

    try {
      let conversationId = activeConversationId
      if (conversationId == null) {
        const created = await createConversationMut.mutateAsync({
          dataset_id: selectedDatasetId,
          title: titleFromQuestion(question),
          description: selectedDataset ? `${selectedDataset.dataset_name} · Data Chat` : undefined,
        })
        conversationId = created.id
        setActiveConversationId(created.id)
      }
      await sendMessageMut.mutateAsync({ conversationId, content: question })
      setDraft('')
      toast.show({ tone: 'success', title: t('dataChat.toast.sent', '问题已发送') })
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('dataChat.toast.failed', '发送失败'),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleExecuteSemanticPlan = useCallback(
    async (plan: Record<string, unknown>) => {
      const planQuestion = typeof plan.question === 'string' ? plan.question.trim() : ''
      const question = planQuestion || activeConversation?.title?.trim() || ''
      if (!question) {
        toast.show({
          tone: 'warning',
          title: t('dataChat.execute.noQuestion', '缺少可执行问题'),
        })
        return
      }
      const planId = typeof plan.semantic_plan_id === 'string' ? plan.semantic_plan_id : question
      try {
        setExecuteConversationId(activeConversationId)
        const result = await executeSemanticMut.mutateAsync({
          question,
          runtime_options: { source: 'data_chat' },
          idempotency_key: ['data-chat', activeConversationId ?? 'draft', planId].join(':').slice(0, 180),
        })
        if (result.status === 'submitted') {
          toast.show({
            tone: 'success',
            title: t('dataChat.execute.submitted', '已提交正式执行'),
            description: result.gateway_query_id
              ? t('dataChat.execute.gatewayQuery', '执行任务已生成，可在执行记录中追踪')
              : undefined,
          })
        } else {
          toast.show({
            tone: 'warning',
            title: t('dataChat.execute.blocked', '执行未提交'),
            description: result.reason ?? result.decision ?? result.status,
          })
        }
      } catch (err) {
        toast.show({
          tone: 'danger',
          title: t('dataChat.execute.failed', '执行提交失败'),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [activeConversation?.title, activeConversationId, executeSemanticMut, toast],
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="v2-data-chat">
      <div
        className="flex flex-wrap items-center gap-3 border-b px-5 py-4"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-3">
            <Sparkles size={14} className="text-[color:var(--accent)]" />
            {t('dataChat.eyebrow', 'Semantic Conversation')}
          </div>
          <h1 className="mt-1 text-[22px] font-semibold text-1">Data Chat</h1>
          <p className="mt-1 text-[12px] leading-5 text-2">
            {t('dataChat.subtitle', '面向数据集发起语义问数，并沿用后端对话历史。')}
          </p>
        </div>
        <Button size="sm" onClick={handleNewConversation}>
          <MessageSquarePlus size={13} /> {t('dataChat.action.new', '新对话')}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
        <aside className="min-h-0 border-r" style={{ borderColor: 'var(--border)' }}>
          <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
            <label htmlFor="data-chat-dataset" className="mb-1 block text-[11px] font-medium text-3">
              {t('dataChat.dataset.label', '数据集范围（可选）')}
            </label>
            <Select
              id="data-chat-dataset"
              value={selectedDatasetId ?? ''}
              onChange={(event) => setSelectedDatasetId(event.target.value ? Number(event.target.value) : null)}
              disabled={datasetsQ.isLoading}
            >
              <option value="">
                {datasetsQ.isLoading
                  ? t('dataChat.dataset.loading', '加载数据集中...')
                  : t('dataChat.dataset.global', '全局（不限数据集）')}
              </option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.dataset_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-1.5 text-[11px] font-medium text-3">{t('dataChat.catalog.title', '能问什么')}</div>
            {cubesQ.isLoading ? (
              <div className="text-[11px] text-3">{t('common.loading', '加载中…')}</div>
            ) : cubes.length === 0 ? (
              <div className="text-[11px] text-3">{t('dataChat.catalog.empty', '暂无已发布语义资产')}</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {cubes.slice(0, 12).map((cube) => (
                  <Chip key={cube.name}>{cube.title || cube.name}</Chip>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto scroll-thin p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-3">{t('dataChat.history.title', '最近对话')}</span>
              {conversationsQ.isFetching ? <Loader2 className="h-3 w-3 animate-spin text-3" /> : null}
            </div>
            {conversationsQ.isError ? (
              <div className="rounded border px-3 py-2 text-xs text-danger" style={{ borderColor: 'var(--border)' }}>
                {conversationsQ.error instanceof Error
                  ? conversationsQ.error.message
                  : t('dataChat.history.error', '对话加载失败')}
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded border px-3 py-6 text-center text-xs text-3" style={{ borderColor: 'var(--border)' }}>
                {t('dataChat.history.empty', '暂无对话')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {conversations.map((conversation) => (
                  <ConversationButton
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onClick={() => {
                      setActiveConversationId(conversation.id)
                      if (conversation.dataset_id != null) setSelectedDatasetId(conversation.dataset_id)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-5">
            <div className="mx-auto max-w-4xl space-y-3">
              <Card>
                <CardHead
                  title={activeConversation?.title ?? t('dataChat.empty.title', '准备开始新的数据对话')}
                  subtitle={
                    selectedDataset
                      ? t('dataChat.activeDataset', '当前数据集：{name}', { name: selectedDataset.dataset_name })
                      : t('dataChat.noDataset', '全局问数（不限数据集）')
                  }
                  extra={<Chip tone="accent">{t('dataChat.api', '对话记录')}</Chip>}
                />
                <CardBody className="space-y-3">
                  <SemanticPlanTrace
                    context={activeConversationData?.context}
                    executeResult={executeConversationId === activeConversationId ? executeSemanticMut.data ?? null : null}
                    executing={executeSemanticMut.isPending}
                    onExecute={handleExecuteSemanticPlan}
                  />
                  {messages.length > 0 ? (
                    messages.map((message) => <MessageBubble key={message.id} message={message} />)
                  ) : (
                    <div className="flex items-start gap-3 rounded border px-4 py-4" style={{ borderColor: 'var(--border)' }}>
                      <Bot size={18} className="mt-0.5 text-[color:var(--accent)]" />
                      <div>
                        <div className="text-sm font-medium text-1">
                          {t('dataChat.empty.assistantTitle', '可以开始提问了')}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-2">
                          {t(
                            'dataChat.empty.assistantDesc',
                            '例如：本周订单金额趋势如何？或：列出最近 10 条异常订单。',
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          <div className="border-t p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="mx-auto flex max-w-4xl items-end gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('dataChat.input.placeholder', '输入你的数据问题，例如：查询本月销售前 10 的产品')}
                rows={2}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />
              <Button onClick={() => void handleSend()} disabled={!canSend}>
                {sendMessageMut.isPending || createConversationMut.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                {t('dataChat.action.send', '发送')}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function ConversationButton({
  conversation,
  active,
  onClick,
}: {
  conversation: Conversation
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`nav-item w-full text-left ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">{conversation.title}</span>
        <span className="block truncate text-[11px] text-3">
          {conversation.dataset_name ?? '-'} · {conversation.message_count ?? 0}{' '}
          {t('dataChat.history.messageCount', '条消息')}
        </span>
      </span>
    </button>
  )
}

/** 最近一次语义执行摘要（conversation.context.semantic_plan） */
function SemanticPlanTrace({
  context,
  executeResult,
  executing,
  onExecute,
}: {
  context?: Record<string, unknown> | null
  executeResult?: AgentSemanticExecuteResponse | null
  executing?: boolean
  onExecute?: (plan: Record<string, unknown>) => void
}) {
  const plan = (context as { semantic_plan?: Record<string, unknown> } | null | undefined)?.semantic_plan
  if (!plan) return null
  const route = (plan.route ?? {}) as Record<string, unknown>
  const primary = (plan.primary_traceability ?? {}) as Record<string, unknown>
  const metric = (primary.business_metric ?? {}) as Record<string, unknown>
  const measure = (primary.analysis_measure ?? {}) as Record<string, unknown>
  const decision = decisionLabel((plan.policy_decision ?? {}) as Record<string, unknown>)
  const parts: string[] = []
  if (typeof route.route_type === 'string') {
    parts.push(t('dataChat.trace.routeValue', '理解方式：{value}', { value: semanticRouteLabel(route.route_type) }))
  }
  const metricTitle = metric.title ?? metric.name
  if (typeof metricTitle === 'string') {
    parts.push(t('dataChat.trace.metricValue', '指标：{value}', { value: metricTitle }))
  }
  if (typeof measure.cube_name === 'string') {
    parts.push(t('dataChat.trace.cubeValue', '分析实体：{value}', { value: measure.cube_name }))
  }
  if (decision) {
    parts.push(t('dataChat.trace.decisionValue', '治理：{value}', { value: decision }))
  }
  const canSubmit = typeof onExecute === 'function'
  if (parts.length === 0 && !canSubmit) return null
  return (
    <div
      className="rounded border px-3 py-2 text-[11px] text-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
      data-testid="semantic-plan-trace"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {t('dataChat.trace.title', '语义执行摘要')}
          {parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}
        </span>
        {canSubmit ? (
          <Button size="sm" variant="ghost" disabled={executing} onClick={() => onExecute(plan)}>
            {executing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {t('dataChat.execute.action', '提交执行')}
          </Button>
        ) : null}
      </div>
      {executeResult ? <SemanticExecuteResult result={executeResult} /> : null}
    </div>
  )
}

function decisionLabel(policyDecision: Record<string, unknown>): string | null {
  const raw = policyDecision.decision ?? policyDecision.effect
  if (typeof raw !== 'string' || !raw) return null
  const normalized = raw.toLowerCase()
  const labels: Record<string, string> = {
    allow: t('dataChat.policy.allow', '允许执行'),
    allowed: t('dataChat.policy.allow', '允许执行'),
    deny: t('dataChat.policy.deny', '已拦截'),
    denied: t('dataChat.policy.deny', '已拦截'),
    review: t('dataChat.policy.review', '需要复核'),
  }
  return labels[normalized] ?? raw
}

function semanticRouteLabel(routeType: string): string {
  const normalized = routeType.trim().toLowerCase()
  const labels: Record<string, string> = {
    semantic: t('dataChat.route.semantic', '语义模型匹配'),
    semantic_router: t('dataChat.route.semantic', '语义模型匹配'),
    cube: t('dataChat.route.cube', 'Cube 指标匹配'),
    query_plan: t('dataChat.route.queryPlan', '查询计划生成'),
    direct_sql: t('dataChat.route.directSql', 'SQL 直连兜底'),
    fallback: t('dataChat.route.fallback', '兜底理解'),
  }
  return labels[normalized] ?? t('dataChat.route.semantic', '语义模型匹配')
}

function SemanticExecuteResult({ result }: { result: AgentSemanticExecuteResponse }) {
  const submitted = result.status === 'submitted'
  return (
    <div className="mt-2 rounded border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={submitted ? 'success' : 'warning'}>
          {submitted ? t('dataChat.execute.statusSubmitted', '已提交') : t('dataChat.execute.statusBlocked', '未提交')}
        </Chip>
        <span className="text-3">
          {submitted && result.gateway_query_id
            ? t('dataChat.execute.gatewayQuery', '执行任务已生成，可在执行记录中追踪')
            : result.reason ?? result.decision ?? result.status}
        </span>
      </div>
    </div>
  )
}

/** Phase 5 可信标注：把后端 source 字段映射为来源徽标 */
function sourceBadge(source: string | null | undefined): { label: string; tone: 'success' | 'accent' | 'warning' } | null {
  switch (source) {
    case 'semantic':
      return { label: t('dataChat.source.semantic', '语义层'), tone: 'success' }
    case 'agent':
      return { label: t('dataChat.source.agent', 'Agent'), tone: 'accent' }
    case 'legacy_llm':
      return { label: t('dataChat.source.legacy', '直连 LLM · 未验证'), tone: 'warning' }
    default:
      return null
  }
}

const RESULT_DISPLAY_LIMIT = 50

// 防御式解析后端 query_result（形状未在契约中钉定）：
// 兼容 columns 为 string[] 或 [{name}]，data 为对象数组或数组数组。
function parseQueryResult(
  qr: unknown,
): { columns: string[]; rows: Record<string, unknown>[]; total: number } | null {
  if (!qr || typeof qr !== 'object' || Array.isArray(qr)) return null
  const obj = qr as Record<string, unknown>
  const rawData = (Array.isArray(obj.data) ? obj.data : Array.isArray(obj.rows) ? obj.rows : null) as
    | unknown[]
    | null
  if (!rawData || rawData.length === 0) return null
  const rawCols = obj.columns
  let columns: string[] = []
  if (Array.isArray(rawCols) && rawCols.length > 0) {
    columns = rawCols.map((c) =>
      typeof c === 'string'
        ? c
        : c && typeof c === 'object' && 'name' in (c as object)
          ? String((c as { name: unknown }).name)
          : String(c),
    )
  } else {
    const first = rawData[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) columns = Object.keys(first as object)
  }
  if (columns.length === 0) return null
  const rows = rawData.map((r) => {
    if (Array.isArray(r)) {
      const o: Record<string, unknown> = {}
      columns.forEach((c, i) => {
        o[c] = (r as unknown[])[i]
      })
      return o
    }
    return r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
  })
  const total = typeof obj.row_count === 'number' ? obj.row_count : rows.length
  return { columns, rows, total }
}

function formatCell(value: unknown): string {
  if (value == null) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function QueryResultTable({ result }: { result: unknown }) {
  const parsed = parseQueryResult(result)
  if (!parsed) return null
  const { columns, rows, total } = parsed
  const shown = rows.slice(0, RESULT_DISPLAY_LIMIT)
  return (
    <div className="mt-3 overflow-auto scroll-thin rounded border" style={{ borderColor: 'var(--border)' }}>
      <table className="wb-table" data-density="compact">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{formatCell(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 text-[11px] text-3">
        {t('dataChat.result.rowCount', '结果行数')}: {total}
        {rows.length > shown.length ? ` · ${t('dataChat.result.truncated', '仅展示前 50 行')}` : ''}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const badge = message.role === 'assistant' ? sourceBadge(message.source) : null
  return (
    <div className="rounded border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Chip tone={messageTone(message.role)}>{message.role === 'user' ? 'User' : 'Assistant'}</Chip>
          {badge ? <Chip tone={badge.tone}>{badge.label}</Chip> : null}
        </div>
        <span className="text-[11px] text-3">{fmtDateTime(message.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-1">{message.content}</div>
      <QueryResultTable result={message.query_result} />
      {message.generated_sql ? (
        <div
          className="mt-3 rounded border px-3 py-2 text-xs text-2"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
        >
          {t('dataChat.sql.generated', '已生成可追溯查询语句，详情可在执行记录中查看。')}
        </div>
      ) : null}
      {message.error ? <div className="mt-2 text-xs text-danger">{message.error}</div> : null}
    </div>
  )
}
