/**
 * 对话列表组件 - Migrated to shadcn/ui
 */
import { Plus, MessageSquare, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Conversation } from '../../api/conversations'
import { FormButton } from '@/components/business'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ConversationListProps {
  conversations: Conversation[]
  currentId?: number
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
}

export default function ConversationList({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete
}: ConversationListProps) {
  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <FormButton
          size="lg"
          onClick={onNew}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          新建对话
        </FormButton>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-20 text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-sm text-gray-500">暂无对话</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group relative p-4 rounded-xl cursor-pointer transition-all ${
                currentId === conv.id
                  ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  currentId === conv.id
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                    : 'bg-gray-200'
                }`}>
                  <MessageSquare className={`w-5 h-5 ${
                    currentId === conv.id ? 'text-white' : 'text-gray-600'
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate mb-1">
                    {conv.title}
                  </div>
                  {conv.dataset_name && (
                    <div className="text-xs text-gray-500 truncate mb-1">
                      {conv.dataset_name}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    {format(new Date(conv.updated_at), 'MM月dd日 HH:mm', { locale: zhCN })} • {conv.message_count} 条消息
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除此对话？</AlertDialogTitle>
                      <AlertDialogDescription>
                        删除后将无法恢复，请谨慎操作。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(conv.id)
                        }}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
