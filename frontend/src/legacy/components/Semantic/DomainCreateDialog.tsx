import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDomain, type DomainCatalogSummary, type DomainDetail } from '@/api/semantic'
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

interface DomainCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogs: DomainCatalogSummary[]
  initialCatalogCode?: string
  onSuccess?: (domain: DomainDetail) => void
}

export function DomainCreateDialog({
  open,
  onOpenChange,
  catalogs,
  initialCatalogCode,
  onSuccess,
}: DomainCreateDialogProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [catalogCode, setCatalogCode] = useState(initialCatalogCode || catalogs[0]?.code || 'default')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setCatalogCode(initialCatalogCode || catalogs[0]?.code || 'default')
    setName('')
  }, [catalogs, initialCatalogCode, open])

  const mutation = useMutation({
    mutationFn: async () => {
      return (
        await createDomain({
          name: name.trim(),
          catalog_code: catalogCode || undefined,
        })
      ).data
    },
    onSuccess: async (domain) => {
      toast({ title: '领域草稿已创建' })
      await queryClient.invalidateQueries({ queryKey: ['semantic', 'catalogs'] })
      onOpenChange(false)
      onSuccess?.(domain)
    },
    onError: (err) => {
      toast({
        title: '创建领域失败',
        description: (err as Error).message,
        variant: 'destructive',
      })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建领域</DialogTitle>
          <DialogDescription>
            这里只创建领域草稿并确定所属目录。关系编排和发布会在领域设计页完成。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">所属目录</label>
            <Select value={catalogCode} onValueChange={setCatalogCode}>
              <SelectTrigger data-testid="domain-create-catalog-select">
                <SelectValue placeholder="选择目录" />
              </SelectTrigger>
              <SelectContent>
                {catalogs.map((catalog) => (
                  <SelectItem key={catalog.code} value={catalog.code}>
                    {catalog.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="domain-create-name" className="text-sm font-medium">
              领域名称
            </label>
            <Input
              id="domain-create-name"
              data-testid="domain-create-name"
              placeholder="例如：答题分析、课程画像、教学运营"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            data-testid="domain-create-submit"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
          >
            创建并进入领域设计
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
