// frontend/src/v2/components/ui/PromptDialog.tsx
/* eslint-disable react-refresh/only-export-components -- 与 ConfirmDialog 相同：组件 / Provider / hook 同文件导出是项目共享约定。 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Input } from './Input'
import { t } from '@v2/i18n'

export interface PromptOptions {
  title: string
  description?: ReactNode
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

interface PromptDialogProps extends PromptOptions {
  open: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

/** 受控文本输入对话框原语：用于替代 window.prompt（输入为空时禁用确认）。 */
export function PromptDialog({
  open,
  title,
  description,
  defaultValue = '',
  placeholder,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      width={400}
      footer={
        <>
          <Button size="sm" onClick={onCancel}>
            {cancelText ?? t('common.cancel', '取消')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={submit}
            disabled={!value.trim()}
            data-testid="prompt-dialog-confirm"
          >
            {confirmText ?? t('common.confirm', '确认')}
          </Button>
        </>
      }
    >
      {description ? <div className="mb-2 text-2 text-[12px] leading-5">{description}</div> : null}
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
    </Dialog>
  )
}

type Resolver = (value: string | null) => void

interface PromptContextValue {
  prompt: (options: PromptOptions) => Promise<string | null>
}

const PromptContext = createContext<PromptContextValue | null>(null)

/** Promise 风格输入 Provider：`const v = await prompt({ title })`；取消或输入为空返回 null。 */
export function PromptProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<PromptOptions | null>(null)
  const resolverRef = useRef<Resolver | null>(null)

  const settle = useCallback((value: string | null) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const prompt = useCallback((next: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      // 已有未决输入时，先取消旧的，避免 Promise 悬挂。
      resolverRef.current?.(null)
      resolverRef.current = resolve
      setOptions(next)
    })
  }, [])

  const value = useMemo(() => ({ prompt }), [prompt])

  return (
    <PromptContext.Provider value={value}>
      {children}
      {options ? (
        <PromptDialog open {...options} onConfirm={(v) => settle(v)} onCancel={() => settle(null)} />
      ) : null}
    </PromptContext.Provider>
  )
}

export function usePrompt(): PromptContextValue['prompt'] {
  const ctx = useContext(PromptContext)
  if (!ctx) {
    // Provider 缺失时回退到原生 prompt，保证功能不被阻断（测试环境可直接 mock）。
    return (options: PromptOptions) =>
      Promise.resolve(
        typeof window !== 'undefined' ? window.prompt(options.title, options.defaultValue ?? '') : null,
      )
  }
  return ctx.prompt
}
