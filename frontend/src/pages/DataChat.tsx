/**
 * 智能问数主页面
 * 基于 uiv2.pen 设计稿 (ebOCv)
 * 三栏布局: 对话列表 | 聊天面板 | 工具栏
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUp,
  BarChart2,
  Bot,
  Download,
  PanelLeftClose,
  PanelRightOpen,
  Plus,
  Search,
  Sparkles,
  Table2,
} from 'lucide-react'
import { useToast } from '@/components/business'
import {
  listConversations,
  createConversation,
  getConversation,
  sendMessage,
  type Conversation,
  type Message,
} from '../api/conversations'
import DatasetSelector from '../components/Chat/DatasetSelector'

export default function DataChat() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [selectedDataset, setSelectedDataset] = useState<number>()
  const [currentConversation, setCurrentConversation] = useState<number>()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')

  // Load conversations
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations(),
  })

  const conversations = (conversationsData?.data?.items || []) as Conversation[]

  // Load current conversation
  const { data: conversationData } = useQuery({
    queryKey: ['conversation', currentConversation],
    queryFn: () => getConversation(currentConversation!),
    enabled: !!currentConversation,
  })

  useEffect(() => {
    setMessages([])
  }, [currentConversation])

  useEffect(() => {
    if (conversationData) {
      setMessages(conversationData.data?.messages || [])
      const datasetId = conversationData.data?.dataset_id
      if (datasetId) setSelectedDataset(datasetId)
    }
  }, [conversationData])

  const createMutation = useMutation({
    mutationFn: (datasetId: number) => createConversation(datasetId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setCurrentConversation(response.data?.id)
      toast({ title: '对话已创建' })
    },
    onError: () => toast({ title: '创建对话失败', variant: 'destructive' }),
  })

  const [sendingMessage, setSendingMessage] = useState(false)

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => sendMessage(currentConversation!, content),
    onSuccess: (response) => {
      const { user_message, ai_message } = response.data
      setMessages((prev) => [...prev, user_message, ai_message])
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setSendingMessage(false)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } }
      toast({ title: '发送消息失败', description: err.response?.data?.message, variant: 'destructive' })
      setSendingMessage(false)
    },
  })

  const handleNewConversation = () => {
    if (!selectedDataset) {
      toast({ title: '请先选择数据集', variant: 'warning' })
      return
    }
    createMutation.mutate(selectedDataset)
  }

  const handleSendMessage = () => {
    if (!inputValue.trim()) return
    if (!currentConversation) {
      toast({ title: '请先创建或选择对话', variant: 'warning' })
      return
    }
    setSendingMessage(true)
    sendMessageMutation.mutate(inputValue.trim())
    setInputValue('')
  }

  const activeConversation =
    conversationData?.data ||
    conversations.find((conversation) => conversation.id === currentConversation)
  const conversationTitle = activeConversation?.title?.trim() || '请选择或创建对话'
  const hasConversations = conversations.length > 0
  const hasCurrentConversation = typeof currentConversation === 'number'
  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full w-full" data-testid="data-chat-layout">
      {/* Conversation List */}
      <div className="flex h-full w-[260px] shrink-0 flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg cursor-pointer">
            <PanelLeftClose className="h-4 w-4 text-[#94A3B8]" />
          </div>
          <span className="text-sm font-semibold text-[#0F172A]">对话列表</span>
          <button
            type="button"
            onClick={handleNewConversation}
            className="flex items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-1.5 shadow-[0_2px_6px_#2563EB30] cursor-pointer"
          >
            <Plus className="h-3 w-3 text-white" />
            <span className="text-[11px] font-medium text-white">新对话</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-[#F1F5F9] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-[#94A3B8]" />
            <span className="text-xs text-[#94A3B8]">搜索对话...</span>
          </div>
        </div>

        <div className="px-4 pb-3" data-testid="data-chat-dataset-selector">
          <DatasetSelector value={selectedDataset} onChange={setSelectedDataset} />
        </div>

        {/* Conversation Items */}
        <div className="flex-1 overflow-y-auto p-2">
          {hasConversations ? (
            <div className="flex flex-col gap-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  data-testid={`conversation-row-${conversation.id}`}
                  onClick={() => setCurrentConversation(conversation.id)}
                  className={`flex flex-col gap-1 rounded-lg px-4 py-3 text-left cursor-pointer transition-colors ${
                    conversation.id === currentConversation
                      ? 'bg-[#EFF6FF]'
                      : 'hover:bg-[#F1F5F9]'
                  }`}
                >
                  <span className="text-[13px] font-medium text-[#0F172A] truncate">
                    {conversation.title || `对话 #${conversation.id}`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-4 text-center">
              <Bot className="h-10 w-10 text-[#CBD5E1]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">暂无历史对话</p>
              <p className="mt-2 text-xs leading-6 text-[#94A3B8]">
                选择数据集后创建新对话，系统才会展示真实问答内容。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      <div className="flex h-full w-2 shrink-0 items-center justify-center">
        <div className="h-10 w-[3px] rounded-sm bg-[#E2E8F0]" />
      </div>

      {/* Chat Panel */}
      <div className="flex h-full flex-1 flex-col bg-white">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold text-[#0F172A]">{conversationTitle}</span>
            <span className="rounded-[10px] bg-gradient-to-b from-[#6366F1] to-[#3B82F6] px-2 py-0.5 text-[10px] font-medium text-white">
              AI 语义驱动
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-2.5 py-1.5 cursor-pointer">
              <PanelRightOpen className="h-3.5 w-3.5 text-[#94A3B8]" />
              <span className="text-[11px] text-[#94A3B8]">展开面板</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-5">
            {hasMessages ? (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'gap-3'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#3B82F6]">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-[#2563EB] text-white'
                        : 'rounded-bl-sm bg-[#F1F5F9] text-[#0F172A]'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-6 text-center">
                <Bot className="h-12 w-12 text-[#CBD5E1]" />
                <p className="mt-4 text-sm font-medium text-[#0F172A]">
                  {hasCurrentConversation ? '当前对话还没有消息' : '当前没有可展示的真实消息'}
                </p>
                <p className="mt-2 max-w-[360px] text-sm leading-6 text-[#94A3B8]">
                  {hasCurrentConversation
                    ? '发送第一条问题后，这里只会展示后端真实返回的问答记录。'
                    : '请选择左侧已有对话，或先选择数据集后创建新对话。'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-3 border-t border-[#E2E8F0] px-5 py-4">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-[#F1F5F9] px-3.5 py-2.5">
            <Sparkles className="h-4 w-4 text-[#6366F1] shrink-0" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="输入您的数据问题..."
              className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={sendingMessage}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] shadow-[0_2px_8px_#2563EB30] disabled:opacity-50 cursor-pointer"
          >
            <ArrowUp className="h-[18px] w-[18px] text-white" />
          </button>
        </div>
      </div>

      {/* Resize Handle */}
      <div className="flex h-full w-2 shrink-0 items-center justify-center">
        <div className="h-10 w-[3px] rounded-sm bg-[#E2E8F0]" />
      </div>

      {/* Collapsed Right Panel */}
      <div className="flex h-full w-12 shrink-0 flex-col items-center gap-4 bg-white py-3">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1F5F9] cursor-pointer">
          <PanelRightOpen className="h-[18px] w-[18px] text-[#94A3B8]" />
        </button>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer hover:bg-[#F1F5F9]">
          <BarChart2 className="h-4 w-4 text-[#94A3B8]" />
        </button>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer hover:bg-[#F1F5F9]">
          <Table2 className="h-4 w-4 text-[#94A3B8]" />
        </button>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer hover:bg-[#F1F5F9]">
          <Download className="h-4 w-4 text-[#94A3B8]" />
        </button>
      </div>
    </div>
  )
}
