/**
 * 智能问数主页面 - Migrated to shadcn/ui
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import DatasetSelector from '../components/Chat/DatasetSelector'
import ConversationList from '../components/Chat/ConversationList'
import MessageList from '../components/Chat/MessageList'
import MessageInput from '../components/Chat/MessageInput'
import { useToast } from '@/components/business'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  sendMessage,
  type Conversation,
  type Message
} from '../api/conversations'

export default function DataChat() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // 状态管理
  const [selectedDataset, setSelectedDataset] = useState<number>()
  const [currentConversation, setCurrentConversation] = useState<number>()
  const [messages, setMessages] = useState<Message[]>([])
  const [showDatasetChangeDialog, setShowDatasetChangeDialog] = useState(false)
  const [pendingDatasetId, setPendingDatasetId] = useState<number>()

  // 加载对话列表
  const { data: conversationsData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations()
  })

  const conversations = (conversationsData?.data?.items || []) as Conversation[]

  // 加载当前对话详情
  const { data: conversationData, isLoading: loadingConversation } = useQuery({
    queryKey: ['conversation', currentConversation],
    queryFn: () => getConversation(currentConversation!),
    enabled: !!currentConversation
  })

  // 更新消息列表
  useEffect(() => {
    if (conversationData) {
      setMessages(conversationData.data?.messages || [])
      const datasetId = conversationData.data?.dataset_id
      if (datasetId) {
        setSelectedDataset(datasetId)
      }
    }
  }, [conversationData])

  // 创建对话
  const createMutation = useMutation({
    mutationFn: (datasetId: number) => createConversation(datasetId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setCurrentConversation(response.data?.id)
      toast({ title: "对话已创建" })
    },
    onError: () => {
      toast({ title: "创建对话失败", variant: "destructive" })
    }
  })

  // 删除对话
  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (currentConversation) {
        setCurrentConversation(undefined)
        setMessages([])
      }
      toast({ title: "对话已删除" })
    },
    onError: () => {
      toast({ title: "删除对话失败", variant: "destructive" })
    }
  })

  // 发送消息
  const [sendingMessage, setSendingMessage] = useState(false)
  
  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => sendMessage(currentConversation!, content),
    onSuccess: (response) => {
      const { user_message, ai_message } = response.data
      setMessages(prev => [...prev, user_message, ai_message])
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setSendingMessage(false)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } }
      toast({ 
        title: "发送消息失败", 
        description: err.response?.data?.message, 
        variant: "destructive" 
      })
      setSendingMessage(false)
    }
  })

  // 新建对话
  const handleNewConversation = () => {
    if (!selectedDataset) {
      toast({ title: "请先选择数据集", variant: "warning" })
      return
    }
    createMutation.mutate(selectedDataset)
  }

  // 选择对话
  const handleSelectConversation = (id: number) => {
    setCurrentConversation(id)
  }

  // 删除对话
  const handleDeleteConversation = (id: number) => {
    deleteMutation.mutate(id)
  }

  // 发送消息
  const handleSendMessage = (content: string) => {
    if (!currentConversation) {
      toast({ title: "请先创建或选择对话", variant: "warning" })
      return
    }
    setSendingMessage(true)
    sendMessageMutation.mutate(content)
  }

  // 数据集变更时提示
  const handleDatasetChange = (datasetId: number) => {
    if (currentConversation) {
      setPendingDatasetId(datasetId)
      setShowDatasetChangeDialog(true)
    } else {
      setSelectedDataset(datasetId)
    }
  }

  const confirmDatasetChange = () => {
    if (pendingDatasetId) {
      setSelectedDataset(pendingDatasetId)
      createMutation.mutate(pendingDatasetId)
      setShowDatasetChangeDialog(false)
      setPendingDatasetId(undefined)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部工具栏 */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">智能问数</h1>
            <p className="text-xs text-gray-500 -mt-0.5">AI-Powered Data Q&A</p>
          </div>
        </div>

        <div className="flex-1 max-w-md">
          <DatasetSelector
            value={selectedDataset}
            onChange={handleDatasetChange}
          />
        </div>

        <div className="text-sm text-gray-500">
          {currentConversation && `当前对话 #${currentConversation}`}
        </div>
      </div>

      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 对话列表侧边栏 */}
        <ConversationList
          conversations={conversations}
          currentId={currentConversation}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />

        {/* 聊天区域 */}
        <div className="flex-1 flex flex-col">
          {currentConversation ? (
            <>
              {/* 消息列表 */}
              <MessageList
                messages={messages}
                loading={loadingConversation || sendingMessage}
              />

              {/* 输入框 */}
              <div className="border-t border-gray-200 bg-white p-6 flex-shrink-0">
                <MessageInput
                  onSend={handleSendMessage}
                  loading={sendingMessage}
                  disabled={!selectedDataset}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-12 h-12 text-pink-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">开始智能对话</h2>
                <p className="text-gray-500 mb-6">
                  {selectedDataset
                    ? '点击左侧「新建对话」开始提问'
                    : '请先选择一个数据集'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 数据集切换确认对话框 */}
      <AlertDialog open={showDatasetChangeDialog} onOpenChange={setShowDatasetChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>切换数据集</AlertDialogTitle>
            <AlertDialogDescription>
              切换数据集将创建新对话，是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDatasetChange}>
              创建新对话
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
