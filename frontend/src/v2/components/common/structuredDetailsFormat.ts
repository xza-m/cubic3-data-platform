export type StructuredDetailsFormat = 'json' | 'sql' | 'text'

export function formatStructuredValue(value: unknown, format: StructuredDetailsFormat = 'json'): string {
  if (value == null || value === '') return ''
  if (format === 'json') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  if (typeof value === 'string') return value
  return String(value)
}
