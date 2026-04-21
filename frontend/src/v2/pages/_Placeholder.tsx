// frontend/src/v2/pages/_Placeholder.tsx
//
// 路由占位组件。用于尚未实现 / 等待 BE 拓展上线的入口。
// 不要在 placeholder 中放假数据。

interface PlaceholderProps {
  title: string
  description?: string
  blockerNote?: string
}

export default function Placeholder({ title, description, blockerNote }: PlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="text-base font-medium">{title}</div>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
      {blockerNote ? (
        <p className="max-w-md text-xs text-amber-600 dark:text-amber-400">
          {blockerNote}
        </p>
      ) : null}
    </div>
  )
}
