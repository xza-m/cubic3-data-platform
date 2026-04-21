/**
 * PageDrawer - 统一的抽屉组件
 * 替代 Ant Design Drawer，使用 shadcn/ui Sheet
 */
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface PageDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  width?: string | number
}

export function PageDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  width,
}: PageDrawerProps) {
  const widthClass = width
    ? (typeof width === 'number' ? `w-[${width}px]` : width)
    : 'w-[420px] sm:w-[560px]'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(widthClass, "overflow-y-auto")}
        style={width && typeof width === 'number' ? { width: `${width}px` } : undefined}
      >
        {(title || description) && (
          <SheetHeader className="border-b border-border pb-4">
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        <div className="py-5">{children}</div>
        {footer && <SheetFooter className="border-t border-border pt-4">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
