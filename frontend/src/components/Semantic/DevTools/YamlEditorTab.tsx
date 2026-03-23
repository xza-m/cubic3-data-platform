import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { AlertTriangle, CheckCircle2, FileCode, Loader2, Save } from 'lucide-react'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SemanticEmptyState } from '@/components/Semantic/workbench'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export type YamlEditorFileType = 'cubes' | 'views' | 'recipes'

export function YamlEditorTab({
  fileType,
  fileName,
  onDirtyChange,
}: {
  fileType: YamlEditorFileType | null
  fileName?: string
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [editValue, setEditValue] = useState<string>('')
  const [dirty, setDirty] = useState(false)

  const { data: fileContent, isLoading: contentLoading } = useQuery({
    queryKey: ['semantic', 'file', fileType, fileName],
    queryFn: async () => {
      const res = await apiClient.get<{ content: string }>(`/semantic/files/${fileType}/${fileName}`)
      return res.data
    },
    enabled: Boolean(fileType && fileName),
  })

  useEffect(() => {
    if (fileContent?.content == null) return
    setEditValue(fileContent.content)
    setDirty(false)
  }, [fileContent])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const saveMutation = useMutation({
    mutationFn: async () => apiClient.put(`/semantic/files/${fileType}/${fileName}`, { content: editValue }),
    onSuccess: () => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['semantic'] })
      toast({ title: '保存成功', description: `${fileType}/${fileName}.yml 已更新` })
    },
    onError: (err: Error) => {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' })
    },
  })

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ valid: boolean; diagnostics: Array<{ level: string; message: string }> }>(
        `/semantic/files/${fileType}/${fileName}/validate`,
        { content: editValue },
      )
      return res.data
    },
  })

  const handleSave = useCallback(() => {
    if (!fileType || !fileName) return
    saveMutation.mutate()
  }, [fileName, fileType, saveMutation])

  const handleValidate = useCallback(() => {
    if (!fileType || !fileName) return
    validateMutation.mutate()
  }, [fileName, fileType, validateMutation])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const isDark = document.documentElement.classList.contains('dark')
  const editorLoadingState = (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[rgba(248,250,252,0.96)] px-6 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--workbench-accent))]" />
      <div className="space-y-1">
        <div className="text-sm font-medium text-[hsl(var(--workbench-ink))]">正在加载 YAML 编辑器</div>
        <p className="max-w-sm text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
          首次进入会初始化 Monaco 编辑器。当前区只保留定义文件、校验和保存，不再显示额外面板。
        </p>
      </div>
    </div>
  )

  if (!fileType || !fileName) {
    return (
      <div className="mt-4">
        <SemanticEmptyState
          icon={<FileCode className="h-6 w-6" />}
          title="先在左侧选择可编辑对象"
          description="当前页只支持 Cube / View 的在线 YAML 编辑。选择对象后，这里会展示定义文件、校验结果和保存动作。"
        />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4" data-testid="yaml-editor-tab">
      <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">定义文件</div>
            <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-ink))]">
              {fileType}/{fileName}.yml
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn(
              'rounded-full border px-3 py-1 text-xs',
              dirty
                ? 'border-[hsl(var(--semantic-warn))]/25 bg-[hsl(var(--semantic-warn))]/8 text-[hsl(var(--semantic-warn))]'
                : 'border-[hsl(var(--workbench-outline))] bg-white/88 text-[hsl(var(--workbench-muted-foreground))]',
            )}>
              {dirty ? '有未保存修改' : '未修改'}
            </div>
            <Button variant="outline" size="sm" onClick={handleValidate} disabled={validateMutation.isPending}>
              {validateMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              校验
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending} aria-label="保存 YAML 修改">
              {saveMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              {saveMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[rgba(248,250,252,0.96)]"
        style={{ minHeight: '32rem', height: 'calc(100vh - 22rem)' }}
      >
        {contentLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <Editor
            height="100%"
            language="yaml"
            theme={isDark ? 'vs-dark' : 'vs'}
            value={editValue}
            loading={editorLoadingState}
            onChange={(value) => {
              const nextValue = value ?? ''
              setEditValue(nextValue)
              setDirty(nextValue !== fileContent?.content)
            }}
            options={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        )}
      </div>

      {validateMutation.data ? (
        <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white px-4 py-4">
          <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">校验结果</div>
          <div className="mt-3 space-y-2">
            {validateMutation.data.diagnostics.map((item, index) => (
              <div
                key={`${item.level}-${index}`}
                className={cn(
                  'flex items-center gap-2 text-sm',
                  item.level === 'ok' && 'text-[hsl(var(--semantic-ok))]',
                  item.level === 'error' && 'text-[hsl(var(--semantic-error))]',
                  item.level === 'warn' && 'text-[hsl(var(--semantic-warn))]',
                )}
                role={item.level === 'error' ? 'alert' : undefined}
              >
                {item.level === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {item.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
