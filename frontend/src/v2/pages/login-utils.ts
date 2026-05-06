type LoginResponse =
  | { access_token?: string; token?: string; data?: { access_token?: string; token?: string } }
  | null
  | undefined

export function extractLoginToken(payload: LoginResponse): string | null {
  return payload?.access_token ?? payload?.token ?? payload?.data?.access_token ?? payload?.data?.token ?? null
}
