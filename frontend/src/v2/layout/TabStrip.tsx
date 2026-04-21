// frontend/src/v2/layout/TabStrip.tsx
import { type ReactNode } from 'react'
import { X } from 'lucide-react'

export interface TabItem {
  id: string
  label: ReactNode
  closeable?: boolean
  active?: boolean
  meta?: ReactNode
}

interface TabStripProps {
  tabs: TabItem[]
  onSelect?: (id: string) => void
  onClose?: (id: string) => void
  trailing?: ReactNode
}

export function TabStrip({ tabs, onSelect, onClose, trailing }: TabStripProps) {
  return (
    <div
      className="surface flex h-8 shrink-0 items-stretch border-b text-[12px]"
      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-1 overflow-x-auto scroll-thin">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`wb-tab ${tab.active ? 'active' : ''}`}
            onClick={() => onSelect?.(tab.id)}
          >
            <span className="truncate">{tab.label}</span>
            {tab.meta}
            {tab.closeable !== false ? (
              <button
                type="button"
                className="close rail-btn !w-4 !h-4 ml-1"
                aria-label="关闭标签"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose?.(tab.id)
                }}
              >
                <X size={10} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {trailing ? <div className="flex items-center pr-2">{trailing}</div> : null}
    </div>
  )
}
