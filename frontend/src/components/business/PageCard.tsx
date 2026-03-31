/**
 * PageCard - 统一的卡片组件
 * 替代 Ant Design Card
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface PageCardProps {
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}

export function PageCard({
  title,
  description,
  children,
  footer,
  className,
  headerAction,
}: PageCardProps) {
  return (
    <Card className={cn("w-full", className)}>
      {(title || description || headerAction) && (
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              {title && <CardTitle className="font-workbench-display text-[1.125rem] font-semibold leading-[1.2] tracking-[-0.02em]">{title}</CardTitle>}
              {description && <CardDescription className="mt-1 text-[0.9375rem] leading-6">{description}</CardDescription>}
            </div>
            {headerAction && <div>{headerAction}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  )
}
