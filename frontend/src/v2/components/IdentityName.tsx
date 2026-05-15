import { useMemo } from 'react'
import { identityDisplayName, isPrincipalLike, normalizeIdentity } from '@v2/utils/identity'
import { usePrincipalDisplayNames } from '@v2/hooks/access'

export function IdentityName({
  value,
  displayName,
  className,
  fallback = '未同步用户',
}: {
  value: unknown
  displayName?: string | null
  className?: string
  fallback?: string
}) {
  const identity = normalizeIdentity(value)
  const shouldResolve = !displayName && isPrincipalLike(identity)
  const ids = useMemo(() => (shouldResolve ? [identity] : []), [identity, shouldResolve])
  const { data } = usePrincipalDisplayNames(ids)
  const resolved = identity ? data?.[identity] : null
  const label = identityDisplayName(displayName || resolved, identity, fallback)

  return (
    <span
      className={className}
      title={identity && identity !== label ? identity : undefined}
    >
      {label}
    </span>
  )
}
