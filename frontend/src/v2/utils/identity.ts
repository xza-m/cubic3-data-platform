// Principal 展示辅助：业务页面不直接展示 Feishu open_id / union_id。

export function normalizeIdentity(value: unknown): string {
  return String(value ?? '').trim()
}

export function isPrincipalLike(value: unknown): boolean {
  const identity = normalizeIdentity(value)
  return (
    identity.startsWith('feishu:') ||
    identity.startsWith('svc:') ||
    identity.startsWith('internal:') ||
    identity.startsWith('ou_') ||
    identity.startsWith('on_')
  )
}

export function identityDisplayName(
  displayName: string | null | undefined,
  rawIdentity: unknown,
  fallback = '未同步用户',
): string {
  const name = normalizeIdentity(displayName)
  if (name) return name
  const raw = normalizeIdentity(rawIdentity)
  if (!raw) return '—'
  return isPrincipalLike(raw) ? fallback : raw
}
