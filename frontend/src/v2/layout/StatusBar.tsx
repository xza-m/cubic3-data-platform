// frontend/src/v2/layout/StatusBar.tsx
import { type ReactNode } from 'react'
import { Wifi } from 'lucide-react'
import { Kbd } from '@v2/components/ui'
import { t } from '@v2/i18n'

interface StatusBarProps {
  rightExtra?: ReactNode
}

export function StatusBar({
  rightExtra,
}: StatusBarProps) {
  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[11px] text-3"
      style={{ background: 'var(--bg-status)', borderColor: 'var(--border)' }}
    >
      <span className="flex items-center gap-1">
        <Wifi size={11} className="text-[color:var(--success)]" />
        {t('statusBar.online', '服务正常')}
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
