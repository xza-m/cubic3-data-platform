import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import {
  FileCode,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  File,
} from 'lucide-react'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface FileTree {
  cubes: string[]
  views: string[]
  recipes: string[]
}

export function YamlEditorTab() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [editValue, setEditValue] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['cubes', 'views', 'recipes'])

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ['semantic', 'files'],
    queryFn: async () => {
      const res = await apiClient.get<FileTree>('/semantic/files')
      return res.data
    },
  })

  const { data: fileContent, isLoading: contentLoading } = useQuery({
    queryKey: ['semantic', 'file', selectedType, selectedName],
    queryFn: async () => {
      const res = await apiClient.get<{ content: string }>(
        `/semantic/files/${selectedType}/${selectedName}`,
      )
      return res.data
    },
    enabled: !!selectedType && !!selectedName,
  })

  useEffect(() => {
    if (fileContent?.content) {
      setEditValue(fileContent.content)
      setDirty(false)
    }
  }, [fileContent])

  useEffect(() => {
    const preferredFile = searchParams.get('file')
    if (!preferredFile || !files) return
    const groups: Array<keyof FileTree> = ['cubes', 'views', 'recipes']
    const matchedGroup = groups.find((group) => files[group]?.includes(preferredFile))
    if (!matchedGroup) return
    if (selectedType === matchedGroup && selectedName === preferredFile) return
    setSelectedType(matchedGroup)
    setSelectedName(preferredFile)
    setDirty(false)
  }, [files, searchParams, selectedName, selectedType])

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiClient.put(`/semantic/files/${selectedType}/${selectedName}`, {
        content: editValue,
      })
    },
    onSuccess: () => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['semantic'] })
      toast({ title: '保存成功', description: `${selectedType}/${selectedName}.yml 已更新` })
    },
    onError: (err: Error) => {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' })
    },
  })

  const validateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ valid: boolean; diagnostics: any[] }>(
        `/semantic/files/${selectedType}/${selectedName}/validate`,
        { content: editValue },
      )
      return res.data
    },
  })

  const handleSave = useCallback(() => {
    saveMutation.mutate()
  }, [saveMutation])

  const handleValidate = useCallback(() => {
    validateMutation.mutate()
  }, [validateMutation])

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
    )
  }

  const selectFile = (type: string, name: string) => {
    if (dirty) {
      if (!window.confirm('有未保存的修改，确认切换文件？')) return
    }
    setSelectedType(type)
    setSelectedName(name)
    setDirty(false)
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (filesLoading) {
    return (
      <div className="flex gap-4 mt-4">
        <Skeleton className="w-48 h-96" />
        <Skeleton className="flex-1 h-96" />
      </div>
    )
  }

  const groups = [
    { key: 'cubes', label: 'Cubes', items: files?.cubes ?? [] },
    { key: 'views', label: 'Views', items: files?.views ?? [] },
    { key: 'recipes', label: 'Recipes', items: files?.recipes ?? [] },
  ]

  const isDark = document.documentElement.classList.contains('dark')

  return (
    <div className="flex gap-4 mt-4" style={{ height: 'calc(100vh - 18rem)' }}>
      {/* 文件树 */}
      <div className="w-48 flex-shrink-0 rounded-lg border overflow-y-auto">
        <nav className="p-2 space-y-1" role="tree">
          {groups.map((g) => (
            <div key={g.key} role="treeitem">
              <button
                onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors rounded"
              >
                {expandedGroups.includes(g.key) ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                {g.label} ({g.items.length})
              </button>
              {expandedGroups.includes(g.key) && (
                <div className="ml-3 space-y-0.5" role="group">
                  {g.items.map((name) => (
                    <button
                      key={name}
                      onClick={() => selectFile(g.key, name)}
                      className={cn(
                        'w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors text-left truncate',
                        selectedType === g.key && selectedName === name
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      role="treeitem"
                    >
                      <File className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{name}</span>
                      {selectedType === g.key && selectedName === name && dirty && (
                        <span className="text-amber-500 ml-auto">*</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* 编辑器 */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedName ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <FileCode className="w-10 h-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              从左侧文件树选择一个 Cube 或 View
            </p>
          </div>
        ) : (
          <>
            {/* 工具栏 */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {selectedType}/{selectedName}.yml
                </span>
                {dirty && (
                  <span className="text-amber-500 ml-2 text-xs">● 有未保存修改</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={validateMutation.isPending}
                >
                  {validateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  )}
                  校验
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!dirty || saveMutation.isPending}
                  aria-label="保存 YAML 修改"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1" />
                  )}
                  {saveMutation.isPending ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>

            {/* Monaco Editor */}
            <div className="rounded-lg border overflow-hidden flex-1">
              {contentLoading ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <Editor
                  height="100%"
                  language="yaml"
                  theme={isDark ? 'vs-dark' : 'vs'}
                  value={editValue}
                  onChange={(v) => {
                    setEditValue(v ?? '')
                    setDirty(v !== fileContent?.content)
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

            {/* 校验结果 */}
            {validateMutation.data && (
              <div className="mt-2 space-y-1">
                {validateMutation.data.diagnostics.map((d: any, i: number) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      d.level === 'ok' && 'text-[hsl(var(--semantic-ok))]',
                      d.level === 'error' && 'text-[hsl(var(--semantic-error))]',
                      d.level === 'warn' && 'text-[hsl(var(--semantic-warn))]',
                    )}
                    role={d.level === 'error' ? 'alert' : undefined}
                  >
                    {d.level === 'ok' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {d.message}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
