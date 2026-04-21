// frontend/src/v2/pages/Forbidden.tsx
import { useNavigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { t } from '@v2/i18n'

export default function Forbidden() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { required?: string } | null

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: 'var(--bg-app)' }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
      >
        <ShieldAlert size={28} />
      </div>
      <div>
        <div className="text-[32px] font-semibold text-1">403</div>
        <div className="mt-1 text-[15px] font-medium text-1">
          {t('forbidden.title', '无访问权限')}
        </div>
        <div className="mt-1 text-[12px] text-3">
          {t('forbidden.desc', '你没有权限访问此页面，请联系管理员授权。')}
        </div>
        {state?.required ? (
          <div className="mt-2 text-[11px] text-4">
            {t('forbidden.required', '所需权限')}：<code>{state.required}</code>
          </div>
        ) : null}
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
