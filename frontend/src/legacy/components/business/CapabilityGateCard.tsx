import { PageCard } from '@/components/business/PageCard'
import { cn } from '@/lib/utils'

interface CapabilityGateCardProps {
  title: string
  reason: string
  className?: string
}

export function CapabilityGateCard({ title, reason, className }: CapabilityGateCardProps) {
  return (
    <PageCard className={cn('border-dashed border-amber-200 bg-amber-50/70 shadow-none', className)}>
      <div className="space-y-2">
        <h3 className="text-[1rem] font-semibold leading-6 text-amber-950">{title}</h3>
        <p className="text-sm leading-6 text-amber-900/80">{reason}</p>
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-amber-700">
          当前阶段未接入后端能力
        </span>
      </div>
    </PageCard>
  )
}
