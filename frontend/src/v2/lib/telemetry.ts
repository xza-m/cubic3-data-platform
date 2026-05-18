export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  if (typeof console === 'undefined') return
  console.error('[v2:error]', error, context)
}
