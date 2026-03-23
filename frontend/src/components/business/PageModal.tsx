/**
 * PageModal - 统一的模态框组件
 * 替代 Ant Design Modal
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface PageModalProps {
  open: boolean
  onOpenChange?: (open: boolean) => void  // Made optional
  onClose?: () => void // 向后兼容
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string | number
  className?: string // 支持自定义className
  bodyClassName?: string // 内容区域自定义className
}

export function PageModal({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  footer,
  width,
  className,
  bodyClassName,
}: PageModalProps) {
  // 向后兼容：支持onClose和onOpenChange
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
    if (!newOpen && onClose) {
      onClose()
    }
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("sm:max-w-[425px]", className)}
        style={width ? { maxWidth: typeof width === 'number' ? `${width}px` : width } : undefined}
      >
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div className={cn("py-4", bodyClassName)}>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
