import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCatalog, updateCatalog, type DomainCatalogDetail, type DomainCatalogSummary } from '@/api/semantic'
import { useToast } from '@/components/business'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

interface CatalogEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog?: DomainCatalogSummary | null
  onSuccess?: (catalog: DomainCatalogDetail) => void
}

export function CatalogEditorDialog({
  open,
  onOpenChange,
  catalog,
  onSuccess,
}: CatalogEditorDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'active' | 'archived'>('active')

  useEffect(() => {
    setName(catalog?.name || '')
    setCode(catalog?.code || '')
    setDescription(catalog?.description || '')
    setStatus((catalog?.status as 'active' | 'archived') || 'active')
  }, [catalog, open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (catalog) {
        return (
          await updateCatalog(catalog.code, {
            name: name.trim(),
            description: description.trim(),
            status,
          })
        ).data
      }
      return (
        await createCatalog({
          code: code.trim() || undefined,
          name: name.trim(),
          description: description.trim(),
          status,
        })
      ).data
    },
    onSuccess: async (savedCatalog) => {
      toast({ title: catalog ? '目录已更新' : '目录已创建' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semantic', 'catalogs'] }),
        queryClient.invalidateQueries({ queryKey: ['semantic', 'domains'] }),
      ])
      onOpenChange(false)
      onSuccess?.(savedCatalog)
    },
    onError: (err) => {
      toast({
        title: catalog ? '更新目录失败' : '创建目录失败',
        description: (err as Error).message,
        variant: 'destructive',
      })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{catalog ? '编辑目录' : '新建目录'}</DialogTitle>
          <DialogDescription>
            目录只负责按业务归类领域。这里不做多级树，不做复杂权限。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="catalog-editor-name" className="text-sm font-medium">
              目录名称
            </label>
            <Input
              id="catalog-editor-name"
              data-testid="catalog-editor-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：学习分析"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="catalog-editor-code" className="text-sm font-medium">
              目录编码
            </label>
            <Input
              id="catalog-editor-code"
              data-testid="catalog-editor-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="例如：learning"
              disabled={Boolean(catalog)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="catalog-editor-description" className="text-sm font-medium">
              目录说明
            </label>
            <Textarea
              id="catalog-editor-description"
              data-testid="catalog-editor-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="补充当前目录适用的业务边界"
              className="min-h-[96px] resize-y"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">目录状态</label>
            <Select value={status} onValueChange={(value: 'active' | 'archived') => setStatus(value)}>
              <SelectTrigger data-testid="catalog-editor-status">
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{getSemanticStatusLabel('active')}</SelectItem>
                <SelectItem value="archived">{getSemanticStatusLabel('archived')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            data-testid="catalog-editor-submit"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || (!catalog && !code.trim()) || mutation.isPending}
          >
            {catalog ? '保存目录' : '创建目录'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
