// frontend/src/v2/layout/TopBar.tsx
import { type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Command, History, LogOut, Rocket, User } from 'lucide-react'
import { Button, Kbd, Sheet } from '@v2/components/ui'
import { setAccessToken } from '@v2/api/client'
import { useSemanticReleases } from '@v2/hooks/diagnose'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

interface TopBarProps {
  breadcrumbs: string[]
  actions?: ReactNode
  onOpenCommandPalette: () => void
  hideBreadcrumbs?: boolean
}

export function TopBar({ breadcrumbs, actions, onOpenCommandPalette, hideBreadcrumbs = false }: TopBarProps) {
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  return (
    <header
      className="surface flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {hideBreadcrumbs
          ? null
          : breadcrumbs.map((seg, idx) => (
              <span
                key={idx}
                className={`truncate ${idx === breadcrumbs.length - 1 ? 'text-1 font-medium' : 'text-3'}`}
              >
                {seg}
                {idx < breadcrumbs.length - 1 ? <span className="ml-2 text-4">/</span> : null}
              </span>
            ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="fake-input !w-[260px] flex items-center justify-between text-3"
          style={{ background: 'var(--bg-surface-2)' }}
          aria-label={t('topBar.openPalette', '打开命令面板')}
        >
          <span className="flex items-center gap-2">
            <Command size={12} />
            <span>{t('topBar.paletteHint', '跳转、搜索、调用功能…')}</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        {actions}
        <span className="divider-v mx-1" />
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('topBar.history', '历史')}
          onClick={() => navigate('/queries/history')}
        >
          <History size={12} /> {t('topBar.history', '历史')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('topBar.changes', '变更')}
          onClick={() => setNotifOpen(true)}
        >
          <Rocket size={12} /> {t('topBar.changes', '变更')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('topBar.notifications', '通知')}
          onClick={() => setNotifOpen(true)}
        >
          <Bell size={12} />
        </Button>
        {notifOpen ? <NotificationSheet onClose={() => setNotifOpen(false)} /> : null}
        <span className="divider-v mx-1" />
        <div className="flex items-center gap-2 text-[12px] text-2">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: 'var(--accent)' }}
            aria-label={t('topBar.profile', '个人信息')}
            title={t('topBar.profile', '个人信息')}
            onClick={() => navigate('/profile')}
          >
            <User size={12} />
          </button>
          <button
            type="button"
            className="rail-btn"
            aria-label={t('topBar.logout', '退出登录')}
            title={t('topBar.logout', '退出登录')}
            onClick={() => {
              setAccessToken(null)
              navigate('/login', { replace: true })
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  )
}

// 变更/通知面板：展示最近语义发布（平台「有什么新变化」）。仅在打开时挂载并取数。
function NotificationSheet({ onClose }: { onClose: () => void }) {
  const releasesQ = useSemanticReleases({ limit: 10 })
  const items = releasesQ.data?.items ?? []
  return (
    <Sheet open onClose={onClose} title={t('topBar.notif.title', '最近变更')} width={380}>
      {releasesQ.isLoading ? (
        <p className="text-xs text-3">{t('common.loading', '加载中…')}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-3">{t('topBar.notif.empty', '暂无最近发布')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="rounded border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-1">
                  {t('topBar.notif.release', '发布 #{no}', { no: r.release_no })} · {r.namespace}
                </span>
                <span className="text-3">{r.status}</span>
              </div>
              {r.published_at ? <div className="mt-0.5 text-3">{fmtDateTime(r.published_at)}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
