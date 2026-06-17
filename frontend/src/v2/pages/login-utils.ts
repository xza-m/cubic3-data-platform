import type { TokenPair } from '@v2/api/client'

export type LoginResponse =
  | (Partial<TokenPair> & { data?: Partial<TokenPair> })
  | null
  | undefined

export function extractLoginTokenPair(payload: LoginResponse): TokenPair | null {
  const candidate = payload?.data ?? payload
  if (!candidate) return null
  const accessToken = candidate?.access_token
  const refreshToken = candidate?.refresh_token
  if (!accessToken || !refreshToken) return null
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: candidate.expires_in,
    refresh_expires_in: candidate.refresh_expires_in,
    access_expires_at: candidate.access_expires_at,
    refresh_expires_at: candidate.refresh_expires_at,
    token_type: candidate.token_type,
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildCliExchangeCommand(code: string, origin: string): string {
  const baseUrlArg = origin ? ` --base-url ${shellQuote(origin)}` : ''
  return `cubic3-dp${baseUrlArg} auth feishu --exchange-code ${shellQuote(code)}`
}
