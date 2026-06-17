// frontend/src/v2/components/ui/ConfirmDialog.tsx
/* eslint-disable react-refresh/only-export-components -- 与 Toast 相同：组件 / Provider / hook 同文件导出是项目共享约定。 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { t } from '@v2/i18n'

type ConfirmTone = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: ConfirmTone
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

/** 受控确认对话框原语：用于替代 window.confirm / alert 的危险操作确认。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText,
  tone = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      width={400}
      footer={
        <>
          <Button size="sm" onClick={onCancel} disabled={loading}>
            {cancelText ?? t('common.cancel', '取消')}
          </Button>
          <Button
            size="sm"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmText ?? t('common.confirm', '确认')}
          </Button>
        </>
      }
    >
      {description ? <div className="text-2 text-[12px] leading-5">{description}</div> : null}
    </Dialog>
  )
}

type Resolver = (value: boolean) => void

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

/** Promise 风格确认 Provider：`const ok = await confirm({ title, tone: 'danger' })`。 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // 已有未决确认时，先取消旧的，避免 Promise 悬挂
      resolverRef.current?.(false)
      resolverRef.current = resolve
      setOptions(next)
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {options ? (
        <ConfirmDialog
          open
          {...options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // Provider 缺失时回退到原生 confirm，保证功能不被阻断（测试环境可直接 mock）。
    return (options: ConfirmOptions) =>
      Promise.resolve(typeof window !== 'undefined' ? window.confirm(options.title) : false)
  }
  return ctx.confirm
}
