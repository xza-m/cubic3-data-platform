// frontend/src/v2/layout/TopBar.tsx
import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Command, History, LogOut, Rocket, User } from 'lucide-react'
import { Button, Kbd } from '@v2/components/ui'
import { setAccessToken } from '@v2/api/client'
import { t } from '@v2/i18n'

interface TopBarProps {
  breadcrumbs: string[]
  actions?: ReactNode
  onOpenCommandPalette: () => void
  hideBreadcrumbs?: boolean
}

export function TopBar({ breadcrumbs, actions, onOpenCommandPalette, hideBreadcrumbs = false }: TopBarProps) {
  const navigate = useNavigate()
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
          title={t('topBar.changesPending', '变更中心暂未接入')}
          disabled
        >
          <Rocket size={12} /> {t('topBar.changes', '变更')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('topBar.notifications', '通知')}
          title={t('topBar.notificationsPending', '通知中心暂未接入')}
          disabled
        >
          <Bell size={12} />
        </Button>
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
