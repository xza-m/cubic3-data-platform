import { describe, expect, it } from 'vitest'
import { identityDisplayName, isPrincipalLike, normalizeIdentity } from './identity'

describe('identity display helpers', () => {
  it('normalizes empty values', () => {
    expect(normalizeIdentity(null)).toBe('')
    expect(normalizeIdentity('  张三  ')).toBe('张三')
  })

  it('detects platform principal ids', () => {
    expect(isPrincipalLike('feishu:tenant:on_001')).toBe(true)
    expect(isPrincipalLike('ou_001')).toBe(true)
    expect(isPrincipalLike('on_001')).toBe(true)
    expect(isPrincipalLike('svc:tenant:bot:dw_query')).toBe(true)
    expect(isPrincipalLike('internal:local:admin')).toBe(true)
    expect(isPrincipalLike('plain-user')).toBe(false)
  })

  it('prefers display name over raw identity', () => {
    expect(identityDisplayName('张三', 'feishu:tenant:on_001')).toBe('张三')
  })

  it('does not expose principal-like ids when display name is missing', () => {
    expect(identityDisplayName(null, 'feishu:tenant:on_001')).toBe('未同步用户')
    expect(identityDisplayName(null, 'ou_001')).toBe('未同步用户')
    expect(identityDisplayName(null, 'plain-user')).toBe('plain-user')
    expect(identityDisplayName(null, '')).toBe('—')
  })
})
