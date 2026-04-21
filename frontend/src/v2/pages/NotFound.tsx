// frontend/src/v2/pages/NotFound.tsx
import { useNavigate } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { t } from '@v2/i18n'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: 'var(--bg-app)' }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
      >
        <FileQuestion size={28} />
      </div>
      <div>
        <div className="text-[32px] font-semibold text-1">404</div>
        <div className="mt-1 text-[15px] font-medium text-1">
          {t('notfound.title', '页面不存在')}
        </div>
        <div className="mt-1 text-[12px] text-3">
          {t('notfound.desc', '你访问的页面不存在，请检查 URL 或返回上一页。')}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={() => navigate(-1)}>
          {t('action.back', '回到上一页')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard')}>
          {t('action.goHome', '回到总览')}
        </button>
      </div>
    </div>
  )
}
