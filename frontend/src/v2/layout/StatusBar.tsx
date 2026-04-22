// frontend/src/v2/layout/StatusBar.tsx
import { Activity, GitBranch, Wifi } from 'lucide-react'
import { Kbd } from '@v2/components/ui'
import { t } from '@v2/i18n'

interface StatusBarProps {
  envLabel?: string
  branch?: string
  apiTarget?: string
  rightExtra?: React.ReactNode
}

export function StatusBar({
  envLabel = 'preview',
  branch = 'redesign/v0',
  apiTarget = '/api → :81',
  rightExtra,
}: StatusBarProps) {
  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[11px] text-3"
      style={{ background: 'var(--bg-status)', borderColor: 'var(--border)' }}
    >
      <span className="flex items-center gap-1">
        <Wifi size={11} className="text-[color:var(--success)]" />
        {t('statusBar.online', '在线')} · {apiTarget}
      </span>
      <span className="divider-v" />
      <span className="flex items-center gap-1">
        <GitBranch size={11} />
        {branch}
      </span>
      <span className="divider-v" />
      <span className="flex items-center gap-1">
        <Activity size={11} />
        {envLabel}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {rightExtra}
        <Kbd>⌘K</Kbd>
        <span>{t('statusBar.command', '命令')}</span>
        <Kbd>⌘/</Kbd>
        <span>{t('statusBar.shortcuts', '快捷键')}</span>
      </div>
    </footer>
  )
}
