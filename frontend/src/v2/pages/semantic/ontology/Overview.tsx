// frontend/src/v2/pages/semantic/ontology/Overview.tsx
//
// 本体整体概览（在 Workbench 卡片内点进来的概览视图）
// 复用 OntologyObjectContent 共享组件
// 接口：GET /api/v1/ontology/workbench/objects/:name/overview

import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useWorkbenchObjectOverview } from '@v2/hooks/ontology'
import OntologyObjectContent from '../_shared/ontology-object-content'

export default function OntologyOverview() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const overview = useWorkbenchObjectOverview(name!)

  if (overview.isLoading) {
    return <div className="py-8 text-center text-sm text-3">{t('common.loading', '加载中…')}</div>
  }
  if (overview.isError || !overview.data) {
    return (
      <div className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      <Button
        size="sm"
        variant="ghost"
        className="mb-4 w-fit"
        onClick={() => navigate(-1)}
        aria-label={t('common.action.back', '返回')}
      >
        <ArrowLeft size={12} />
        {t('common.action.back', '返回')}
      </Button>
      <OntologyObjectContent overview={overview.data} />
    </div>
  )
}
