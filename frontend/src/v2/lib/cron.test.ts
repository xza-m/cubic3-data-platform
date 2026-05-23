// frontend/src/v2/lib/cron.test.ts
//
// 简化版 cron 解析单元测试。
import { describe, it, expect } from 'vitest'
import { parseCron, nextRun, nextRuns, cronPresets } from './cron'

describe('parseCron - valid expressions', () => {
  it.each([
    '* * * * *',
    '0 * * * *',
    '0 0 * * *',
    '0 9 * * 1-5',
    '*/5 * * * *',
    '0,15,30,45 * * * *',
    '0 0 1 * *',
    '0 8-18/2 * * *',
  ])('parses %s', (expr) => {
    const r = parseCron(expr)
    expect(r.ok).toBe(true)
    expect(r.fields).toHaveLength(5)
  })

  it('all preset expressions parse', () => {
    for (const p of cronPresets()) {
      expect(parseCron(p.value).ok).toBe(true)
    }
  })
})

describe('parseCron - invalid expressions', () => {
  it('rejects wrong number of fields', () => {
    expect(parseCron('* * * *').ok).toBe(false)
    expect(parseCron('* * * * * *').ok).toBe(false)
    expect(parseCron('').ok).toBe(false)
  })

  it('rejects out-of-range values', () => {
    expect(parseCron('60 * * * *').ok).toBe(false)
    expect(parseCron('* 24 * * *').ok).toBe(false)
    expect(parseCron('* * 32 * *').ok).toBe(false)
    expect(parseCron('* * * 13 *').ok).toBe(false)
    expect(parseCron('* * * * 7').ok).toBe(false)
  })

  it('rejects invalid step', () => {
    expect(parseCron('*/0 * * * *').ok).toBe(false)
    expect(parseCron('*/abc * * * *').ok).toBe(false)
  })

  it('rejects non-numeric values', () => {
    expect(parseCron('foo * * * *').ok).toBe(false)
    expect(parseCron('a-b * * * *').ok).toBe(false)
  })

  it('rejects reverse range', () => {
    expect(parseCron('30-10 * * * *').ok).toBe(false)
  })

  it('rejects empty list element', () => {
    expect(parseCron('1,,2 * * * *').ok).toBe(false)
  })

  it('returns Chinese error messages', () => {
    const r = parseCron('60 * * * *')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('分钟')
  })
})

describe('nextRun', () => {
  it('returns Date for every minute', () => {
    const from = new Date('2026-04-21T12:00:30Z')
    const next = nextRun('* * * * *', from)
    expect(next).toBeInstanceOf(Date)
    expect(next!.getSeconds()).toBe(0)
    expect(next!.getTime()).toBeGreaterThan(from.getTime())
  })

  it('returns Date for hourly cron', () => {
    const from = new Date('2026-04-21T12:00:00Z')
    const next = nextRun('0 * * * *', from)
    expect(next).toBeInstanceOf(Date)
    expect(next!.getMinutes()).toBe(0)
  })

  it('returns Date for daily 0 * * *', () => {
    const next = nextRun('0 0 * * *', new Date('2026-04-21T08:00:00Z'))
    expect(next).toBeInstanceOf(Date)
    expect(next!.getHours()).toBe(0)
    expect(next!.getMinutes()).toBe(0)
  })

  it('returns Date for monthly first day', () => {
    const next = nextRun('0 0 1 * *', new Date('2026-04-21T00:00:00'))
    expect(next).toBeInstanceOf(Date)
    expect(next!.getDate()).toBe(1)
  })

  it('returns Date for weekday 1-5 9am', () => {
    const next = nextRun('0 9 * * 1-5', new Date('2026-04-21T08:00:00'))
    expect(next).toBeInstanceOf(Date)
    const dow = next!.getDay()
    expect(dow >= 1 && dow <= 5).toBe(true)
    expect(next!.getHours()).toBe(9)
  })

  it('uses default Date.now when from omitted', () => {
    const next = nextRun('* * * * *')
    expect(next).toBeInstanceOf(Date)
  })

  it('returns null for invalid expr', () => {
    expect(nextRun('garbage')).toBeNull()
    expect(nextRun('60 * * * *')).toBeNull()
  })
})

describe('nextRuns', () => {
  it('returns N future Dates in order', () => {
    const from = new Date('2026-04-21T12:00:00Z')
    const list = nextRuns('* * * * *', 5, from)
    expect(list).toHaveLength(5)
    for (let i = 1; i < list.length; i++) {
      expect(list[i].getTime()).toBeGreaterThan(list[i - 1].getTime())
    }
  })

  it('returns empty array for invalid expr', () => {
    expect(nextRuns('garbage', 3)).toEqual([])
  })

  it('uses default from when omitted', () => {
    const list = nextRuns('* * * * *', 2)
    expect(list).toHaveLength(2)
  })

  it('returns 0 items when n=0', () => {
    expect(nextRuns('* * * * *', 0)).toEqual([])
  })
})

describe('cronPresets()', () => {
  it('has labels and values', () => {
    const presets = cronPresets()
    expect(presets.length).toBeGreaterThan(0)
    for (const p of presets) {
      expect(typeof p.label).toBe('string')
      expect(typeof p.value).toBe('string')
    }
  })
})
