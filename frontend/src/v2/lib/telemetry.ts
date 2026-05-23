import { obs } from '@v2/observability'
import type { ObsErrorContext } from '@v2/observability'

export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  obs.error(error, { kind: 'react', ...context } as ObsErrorContext)
}

export function track(name: string, fields?: Record<string, unknown>): void {
  obs.track({
    name,
    level: 'info',
    ts: Date.now(),
    fields,
  })
}
