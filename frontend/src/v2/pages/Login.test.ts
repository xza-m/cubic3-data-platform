import { describe, expect, it } from 'vitest'

import { extractLoginTokenPair } from './login-utils'

describe('Login helpers', () => {
  it('extractLoginTokenPair supports backend envelope token pair', () => {
    expect(
      extractLoginTokenPair({
        data: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          refresh_expires_in: 2592000,
        },
      }),
    ).toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      refresh_expires_in: 2592000,
    })
  })

  it('extractLoginTokenPair supports flat token pair', () => {
    expect(
      extractLoginTokenPair({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    ).toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    })
  })

  it('extractLoginTokenPair returns null for malformed payload', () => {
    expect(extractLoginTokenPair({ data: { access_token: 'access-only' } })).toBeNull()
  })
})
