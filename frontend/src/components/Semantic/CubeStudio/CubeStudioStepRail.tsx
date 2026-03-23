import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CubeStudioStepKey =
  | 'basic'
  | 'source'
  | 'structure'
  | 'rules'
  | 'validation'
  | 'publish'

export interface CubeStudioStepItem {
  key: CubeStudioStepKey
  title: string
  description: string
  done: boolean
}

export function CubeStudioStepRail({
  activeStep,
  steps,
  onSelect,
}: {
  activeStep: CubeStudioStepKey
  steps: CubeStudioStepItem[]
  onSelect: (key: CubeStudioStepKey) => void
}) {
  return (
    <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4 shadow-sm">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
            设计步骤
          </div>
          <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
            当前页只处理单 Cube 定义，把来源绑定、结构校对、规则确认和保存动作压缩到一条工作流里。
          </p>
        </div>

        <div className="space-y-2">
          {steps.map((step, index) => {
            const active = step.key === activeStep
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => onSelect(step.key)}
                data-testid={`cube-studio-step-${index + 1}`}
                className={cn(
                  'w-full rounded-[var(--workbench-radius-sm)] border px-3 py-3 text-left transition-colors',
                  active
                    ? 'border-[hsl(var(--workbench-accent))] bg-[hsl(var(--workbench-accent-soft))]'
                    : step.done
                      ? 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))]'
                      : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))]',
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                      active
                        ? 'border-[hsl(var(--workbench-accent))] bg-[hsl(var(--workbench-surface))] text-[hsl(var(--workbench-accent))]'
                        : step.done
                          ? 'border-[hsl(var(--semantic-ok))]/40 bg-[hsl(var(--semantic-ok))]/10 text-[hsl(var(--semantic-ok))]'
                          : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]',
                    )}
                  >
                    {step.done && !active ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{step.title}</div>
                    <div className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">{step.description}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
