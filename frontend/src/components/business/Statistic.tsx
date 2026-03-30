/**
 * Statistic - 统计数字显示组件
 * 替代 Ant Design Statistic
 */
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

interface StatisticProps {
  title: string
  value: string | number
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  trend?: {
    value: number
    isPositive?: boolean
  }
  icon?: React.ReactNode
  className?: string
  valueClassName?: string
}

export function Statistic({
  title,
  value,
  prefix,
  suffix,
  trend,
  icon,
  className,
  valueClassName,
}: StatisticProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[0.875rem] font-medium leading-5 text-muted-foreground">{title}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        {prefix && <span className="text-[0.875rem] leading-5 text-muted-foreground">{prefix}</span>}
        <p className={cn("font-workbench-display text-[2rem] font-semibold leading-none tracking-[-0.03em] [font-variant-numeric:tabular-nums]", valueClassName)}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {suffix && <span className="text-[0.875rem] leading-5 text-muted-foreground">{suffix}</span>}
      </div>
      {trend && (
        <div className="flex items-center gap-1">
          {trend.isPositive !== false ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span
            className={cn(
              "text-[0.875rem] font-medium leading-5 [font-variant-numeric:tabular-nums]",
              trend.isPositive !== false ? "text-emerald-600" : "text-red-600"
            )}
          >
            {trend.value > 0 && "+"}
            {trend.value}%
          </span>
        </div>
      )}
    </div>
  )
}
