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
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string | number
  className?: string
  bodyClassName?: string
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
        className={cn("sm:max-w-[28rem]", className)}
        style={width ? { maxWidth: typeof width === 'number' ? `${width}px` : width } : undefined}
      >
        {(title || description) && (
          <DialogHeader className="border-b border-border pb-4">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div className={cn("py-5", bodyClassName)}>{children}</div>
        {footer && <DialogFooter className="border-t border-border pt-4">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
