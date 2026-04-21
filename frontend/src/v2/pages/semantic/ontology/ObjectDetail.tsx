// frontend/src/v2/pages/semantic/ontology/ObjectDetail.tsx
//
// 业务对象详情页。
// 接口：GET /api/v1/ontology/objects/:name
//       GET /api/v1/ontology/workbench/objects/:name/overview (复用 overview)
//       POST /api/v1/ontology/entities/:type/:name/publish

import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit, Share2 } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell
import { useAppShell } from '@v2/layout/AppShell'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useWorkbenchObjectOverview, usePublishEntity } from '@v2/hooks/ontology'
import OntologyObjectContent from '../_shared/ontology-object-content'

export default function ObjectDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const overview = useWorkbenchObjectOverview(name!)
  const publish = usePublishEntity()

  useEffect(() => {
    setBreadcrumbs([
      t('nav.semantic', '语义中心'),
      t('nav.ontology', '本体工作台'),
      t('nav.objects', '业务对象'),
      name!,
    ])
    setTopBarActions(
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/semantic/ontology/objects/${name}/edit`)}
        >
          <Edit size={12} /> {t('action.edit', '编辑')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={publish.isPending}
          onClick={() =>
            publish.mutate({ entityType: 'objects', entityName: name! })
          }
        >
          <Share2 size={12} /> {t('action.publish', '发布')}
        </Button>
      </div>,
    )
  }, [name, setBreadcrumbs, setTopBarActions, navigate, publish])

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      <Button
        size="sm"
        variant="ghost"
        className="mb-4 w-fit"
        onClick={() => navigate('/semantic/ontology/objects')}
        aria-label={t('back', '返回')}
      >
        <ArrowLeft size={12} />
        {t('nav.objects', '业务对象')}
      </Button>

      {overview.isLoading ? (
        <div className="py-8 text-center text-sm text-3">{t('loading', '加载中…')}</div>
      ) : overview.isError ? (
        <div className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
      ) : overview.data ? (
        <OntologyObjectContent overview={overview.data} />
      ) : null}
    </div>
  )
}
