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

interface PageDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  width?: string | number  // Added width support
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
    : 'w-[400px] sm:w-[540px]';
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side={side} 
        className={`${widthClass} overflow-y-auto`}
        style={width && typeof width === 'number' ? { width: `${width}px` } : undefined}
      >
        {(title || description) && (
          <SheetHeader>
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        <div className="py-4">{children}</div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
