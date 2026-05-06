import { describe, expect, it } from 'vitest'

import { extractLoginToken } from './login-utils'

describe('Login helpers', () => {
  it('extractLoginToken supports backend envelope token', () => {
    expect(extractLoginToken({ data: { token: 'jwt-token' } })).toBe('jwt-token')
  })

  it('extractLoginToken keeps compatibility with flat access_token', () => {
    expect(extractLoginToken({ access_token: 'legacy-token' })).toBe('legacy-token')
  })

  it('extractLoginToken returns null for malformed payload', () => {
    expect(extractLoginToken({ data: {} })).toBeNull()
  })
})
