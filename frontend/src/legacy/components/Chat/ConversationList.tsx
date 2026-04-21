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
  onDelete,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.94)]">
      <div className="border-b border-[hsl(var(--workbench-outline))] p-4">
        <div className="mb-3 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
            会话
          </div>
          <div className="text-[0.95rem] font-semibold text-[hsl(var(--workbench-ink))]">当前数据问答</div>
        </div>
        <FormButton onClick={onNew} className="h-11 w-full rounded-[var(--workbench-radius-sm)]">
          <Plus className="mr-2 h-4 w-4" />
          新建对话
        </FormButton>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {conversations.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
              <MessageSquare className="h-6 w-6" />
            </div>
            <p className="text-sm text-[hsl(var(--workbench-muted-foreground))]">暂无对话</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              data-testid={`conversation-row-${conv.id}`}
              onClick={() => onSelect(conv.id)}
              className={`group relative cursor-pointer rounded-[var(--workbench-radius-sm)] border p-4 transition-colors ${
                currentId === conv.id
                  ? 'border-[hsl(var(--workbench-accent))]/16 bg-[hsl(var(--workbench-accent-soft))]'
                  : 'border-[hsl(var(--workbench-outline))] bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[0.9rem] ${
                    currentId === conv.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]'
                  }`}
                >
                  <MessageSquare className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 truncate text-[0.9375rem] font-semibold leading-5 text-[hsl(var(--workbench-ink))]">
                    {conv.title}
                  </div>
                  {conv.dataset_name ? (
                    <div className="mb-1 truncate text-[0.75rem] leading-4 text-[hsl(var(--workbench-muted-foreground))]">
                      {conv.dataset_name}
                    </div>
                  ) : null}
                  <div className="tabular-nums text-[0.75rem] leading-4 text-[hsl(var(--workbench-muted-foreground))]">
                    {format(new Date(conv.updated_at), 'MM月dd日 HH:mm', { locale: zhCN })} • {conv.message_count} 条消息
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-lg p-1 text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:bg-[hsl(var(--semantic-error))]/8 hover:text-[hsl(var(--semantic-error))]"
                      aria-label="删除对话"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除此对话？</AlertDialogTitle>
                      <AlertDialogDescription>删除后将无法恢复，请谨慎操作。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(event) => {
                          event.stopPropagation()
                          onDelete(conv.id)
                        }}
                        className="bg-[hsl(var(--semantic-error))] hover:bg-[hsl(var(--semantic-error))]"
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
