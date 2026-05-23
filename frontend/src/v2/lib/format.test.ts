// frontend/src/v2/lib/format.test.ts
//
// 表现层格式化工具单元测试。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fmtNum, fmtPercent, fmtDate, fmtDateTime, fmtRelative } from './format'

describe('fmtNum', () => {
  it.each([
    [1234, '1,234'],
    [0, '0'],
    [-1234567, '-1,234,567'],
  ])('formats %s as %s', (input, expected) => {
    expect(fmtNum(input)).toBe(expected)
  })

  it('returns fallback for null/undefined/NaN', () => {
    expect(fmtNum(null)).toBe('-')
    expect(fmtNum(undefined)).toBe('-')
    expect(fmtNum(Number.NaN)).toBe('-')
  })

  it('honors custom fallback', () => {
    expect(fmtNum(null, 'N/A')).toBe('N/A')
  })
})

describe('fmtPercent', () => {
  it('formats decimal as percent with default 1 digit', () => {
    expect(fmtPercent(0.1234)).toBe('12.3%')
    expect(fmtPercent(1)).toBe('100.0%')
  })

  it('honors digits param', () => {
    expect(fmtPercent(0.1234, 2)).toBe('12.34%')
    expect(fmtPercent(0.1, 0)).toBe('10%')
  })

  it.each([null, undefined, Number.NaN])('returns fallback for %p', (n) => {
    expect(fmtPercent(n as number | null | undefined)).toBe('-')
  })

  it('honors custom fallback', () => {
    expect(fmtPercent(null, 1, '∅')).toBe('∅')
  })
})

describe('fmtDate', () => {
  it('formats Date object', () => {
    const d = new Date('2026-04-21T08:30:00Z')
    expect(fmtDate(d)).toMatch(/2026/)
  })

  it('formats ISO string', () => {
    expect(fmtDate('2026-04-21T00:00:00Z')).toMatch(/2026/)
  })

  it('returns fallback for null/undefined/empty', () => {
    expect(fmtDate(null)).toBe('-')
    expect(fmtDate(undefined)).toBe('-')
    expect(fmtDate('')).toBe('-')
  })

  it('returns fallback for invalid dates', () => {
    expect(fmtDate('not-a-date')).toBe('-')
  })

  it('honors custom fallback', () => {
    expect(fmtDate(null, '∅')).toBe('∅')
  })
})

describe('fmtDateTime', () => {
  it('formats Date and ISO string', () => {
    expect(fmtDateTime(new Date('2026-04-21T08:30:00Z'))).toMatch(/2026/)
    expect(fmtDateTime('2026-04-21T08:30:00Z')).toMatch(/2026/)
  })

  it('returns fallback for null/undefined/empty', () => {
    expect(fmtDateTime(null)).toBe('-')
    expect(fmtDateTime(undefined)).toBe('-')
    expect(fmtDateTime('')).toBe('-')
  })

  it('returns fallback for invalid', () => {
    expect(fmtDateTime('garbage')).toBe('-')
  })

  it('honors custom fallback', () => {
    expect(fmtDateTime(null, 'N/A')).toBe('N/A')
  })
})

describe('fmtRelative', () => {
  const NOW = new Date('2026-04-21T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns fallback for null/undefined/empty', () => {
    expect(fmtRelative(null)).toBe('-')
    expect(fmtRelative(undefined)).toBe('-')
    expect(fmtRelative('')).toBe('-')
    expect(fmtRelative('garbage')).toBe('-')
    expect(fmtRelative(null, 'N/A')).toBe('N/A')
  })

  it('uses second granularity for <60s', () => {
    const d = new Date(NOW - 30_000)
    expect(fmtRelative(d)).toContain('秒')
  })

  it('uses minute granularity for <1h', () => {
    const d = new Date(NOW - 5 * 60_000)
    expect(fmtRelative(d)).toContain('分钟')
  })

  it('uses hour granularity for <1day', () => {
    const d = new Date(NOW - 2 * 3600_000)
    expect(fmtRelative(d)).toContain('小时')
  })

  it('uses day granularity for >=1day', () => {
    const d = new Date(NOW - 3 * 86400_000)
    expect(fmtRelative(d)).toContain('天')
  })

  it('handles future date (positive diff)', () => {
    const d = new Date(NOW + 5 * 60_000)
    expect(typeof fmtRelative(d)).toBe('string')
  })

  it('accepts ISO string', () => {
    const iso = new Date(NOW - 86400_000).toISOString()
    expect(typeof fmtRelative(iso)).toBe('string')
  })
})
