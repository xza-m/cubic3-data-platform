// 当前登录主体的轻量信息页。
// 访问网关在 /config/access，个人偏好在 /settings；这里只承担身份展示和入口聚合。

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, KeyRound, Settings, ShieldCheck, UserCircle2, type LucideIcon } from 'lucide-react'
import { apiClient, getAccessToken } from '@v2/api/client'
import { Card, CardBody, CardHead, Chip, SkeletonRows } from '@v2/components/ui'
import { RefreshButton } from '@v2/components/CommonControls'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'

interface CurrentUser {
  user_id?: string | null
  user_name?: string | null
  roles?: string[]
}

async function getCurrentUser(): Promise<CurrentUser> {
  const res = await apiClient.get<{ data: CurrentUser }>('/auth/me')
  return res.data.data
}

function tokenExpiry(): string {
  const token = getAccessToken()
  if (!token) return '—'
  const payload = decodeJwtPayload(token)
  const exp = typeof payload?.exp === 'number' ? payload.exp : null
  if (!exp) return '当前会话'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(exp * 1000))
  } catch {
    return '当前会话'
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}

function identitySource(userId: string | null | undefined): string {
  if (!userId) return '—'
  if (userId.startsWith('feishu:')) return '飞书 SSO'
  if (userId.startsWith('internal:')) return '内部引导账号'
  if (userId.startsWith('svc:')) return '机器用户'
  return '平台账号'
}

export default function Profile() {
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
  })

  useEffect(() => {
    setBreadcrumbs([t('profile.breadcrumb', '个人信息')])
    setTopBarActions(null)
    return () => {
      setBreadcrumbs([])
      setTopBarActions(null)
    }
  }, [setBreadcrumbs, setTopBarActions])

  const displayName = data?.user_name || data?.user_id || '未识别用户'
  const userId = data?.user_id ?? null
  const roles = data?.roles ?? []

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-1">{t('profile.title', '个人信息')}</h1>
          <p className="mt-1 text-[12px] text-3">
            {t('profile.subtitle', '查看当前登录身份、平台角色和常用个人入口。')}
          </p>
        </div>

        <Card>
          <CardBody className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: 'var(--accent)' }}
                aria-hidden
              >
                <UserCircle2 size={24} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[18px] font-semibold text-1">{displayName}</div>
                <div className="mt-1 truncate font-mono text-[12px] text-3">{userId ?? '—'}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/settings" className="btn btn-sm btn-ghost">
                <Settings size={12} /> 我的偏好
              </Link>
              <Link to="/config/access" className="btn btn-sm btn-primary">
                <ShieldCheck size={12} /> 访问网关
              </Link>
            </div>
          </CardBody>
        </Card>

        {isLoading ? (
          <Card>
            <CardBody>
              <SkeletonRows rows={4} columns={2} />
            </CardBody>
          </Card>
        ) : isError ? (
          <Card>
            <CardBody className="py-10 text-center">
              <div className="text-[13px] text-1">个人信息加载失败</div>
              <div className="mt-3 flex justify-center">
                <RefreshButton
                  onClick={() => refetch()}
                  loading={isFetching}
                  label="重新加载"
                  loadingLabel="重新加载中…"
                  ariaLabel="重新加载个人信息"
                />
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <InfoCard icon={KeyRound} label="身份来源" value={identitySource(userId)} />
            <InfoCard icon={ShieldCheck} label="角色数量" value={`${roles.length} 个`} />
            <InfoCard icon={Clock} label="会话有效期" value={tokenExpiry()} />

            <Card className="lg:col-span-3">
              <CardHead title="平台角色" subtitle="角色来自服务端当前会话，最终权限以访问网关的权限配置为准。" />
              <CardBody>
                {roles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <Chip key={role} tone="accent" className="font-mono">
                        {role}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed px-4 py-8 text-center text-[12px] text-3" style={{ borderColor: 'var(--border)' }}>
                    当前会话没有返回平台角色。
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-3">
          <Icon size={13} />
          {label}
        </div>
        <div className="mt-3 truncate text-[16px] font-semibold text-1">{value}</div>
      </CardBody>
    </Card>
  )
}
