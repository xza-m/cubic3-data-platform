// frontend/src/v2/pages/chat/DataChat.tsx
//
// Data Chat 对话工作台。当前接入已有 /api/v1/conversations 契约：
// 选择数据集 → 创建/选择对话 → 发送问题。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, MessageSquarePlus, Send, Sparkles } from 'lucide-react'
import { useDatasets } from '@v2/hooks/datasets'
import {
  useConversation,
  useConversations,
  useCreateConversation,
  useSendConversationMessage,
} from '@v2/hooks/conversations'
import type { Conversation, ConversationMessage } from '@v2/api/conversations'
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
  const conversationsQ = useConversations(DEFAULT_CONVERSATION_PARAMS)
  const createConversationMut = useCreateConversation()
  const sendMessageMut = useSendConversationMessage()

  const datasets = useMemo(() => datasetsQ.data?.items ?? [], [datasetsQ.data?.items])
  const conversations = useMemo(() => conversationsQ.data?.items ?? [], [conversationsQ.data?.items])
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

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
          <p>{t('dataChat.ctx.contract', '对话入口使用 conversations 契约，发送消息前必须先绑定数据集。')}</p>
          <p>{t('dataChat.ctx.noFakeData', '页面只展示接口返回内容，不在前端伪造 AI 结果。')}</p>
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
    if (selectedDatasetId == null && datasets.length > 0) {
      setSelectedDatasetId(datasets[0].id)
    }
  }, [datasets, selectedDatasetId])

  useEffect(() => {
    if (activeConversationId == null && conversations.length > 0) {
      const first = conversations[0]
      setActiveConversationId(first.id)
      if (first.dataset_id != null) setSelectedDatasetId(first.dataset_id)
    }
  }, [activeConversationId, conversations])

  const selectedDataset = datasets.find((item) => item.id === selectedDatasetId) ?? null
  const canSend = draft.trim().length > 0 && selectedDatasetId != null && !sendMessageMut.isPending && !createConversationMut.isPending

  const handleNewConversation = () => {
    setActiveConversationId(null)
    setDraft('')
    if (datasets.length > 0 && selectedDatasetId == null) {
      setSelectedDatasetId(datasets[0].id)
    }
  }

  const handleSend = async () => {
    const question = draft.trim()
    if (!question) return
    if (selectedDatasetId == null) {
      toast.show({
        tone: 'warning',
        title: t('dataChat.toast.pickDataset', '请先选择数据集'),
      })
      return
    }

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
              {t('dataChat.dataset.label', '选择数据集')}
            </label>
            <Select
              id="data-chat-dataset"
              value={selectedDatasetId ?? ''}
              onChange={(event) => setSelectedDatasetId(event.target.value ? Number(event.target.value) : null)}
              disabled={datasetsQ.isLoading || datasets.length === 0}
            >
              {datasetsQ.isLoading ? (
                <option value="">{t('dataChat.dataset.loading', '加载数据集中...')}</option>
              ) : datasets.length === 0 ? (
                <option value="">{t('dataChat.dataset.empty', '暂无可用数据集')}</option>
              ) : (
                datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.dataset_name}
                  </option>
                ))
              )}
            </Select>
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
                      : t('dataChat.noDataset', '请选择一个数据集')
                  }
                  extra={<Chip tone="accent">{t('dataChat.api', 'conversations')}</Chip>}
                />
                <CardBody className="space-y-3">
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

function MessageBubble({ message }: { message: ConversationMessage }) {
  return (
    <div className="rounded border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Chip tone={messageTone(message.role)}>{message.role === 'user' ? 'User' : 'Assistant'}</Chip>
        <span className="text-[11px] text-3">{fmtDateTime(message.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-1">{message.content}</div>
      {message.generated_sql ? (
        <pre className="mt-3 overflow-x-auto rounded bg-black/5 p-3 text-xs dark:bg-white/10">
          {message.generated_sql}
        </pre>
      ) : null}
      {message.error ? <div className="mt-2 text-xs text-danger">{message.error}</div> : null}
    </div>
  )
}
