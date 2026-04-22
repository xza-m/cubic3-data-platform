// frontend/src/v2/pages/queries/QueriesSavedCreate.tsx
//
// 新建已保存查询页面（路由 /queries/saved/new）。
// 接 POST /api/v1/queries  GET /api/v1/datasources（选择数据源）

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useDatasourcesForConsole, useCreateSavedQuery } from '@v2/hooks/queries'
import { CreateSavedQueryForm } from './_shared/saved-query-content'
import { t } from '@v2/i18n'

export default function QueriesSavedCreate() {
  const navigate = useNavigate()
  const { data: datasources = [], isLoading: dsLoading } = useDatasourcesForConsole()
  const createMut = useCreateSavedQuery()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Topbar */}
      <div
        className="flex items-center gap-3 border-b px-4 py-2"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => navigate('/queries/saved')}
          className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> {t('common.backToList', '返回列表')}
        </button>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('queriesSavedCreate.title', '新建查询')}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            POST /api/v1/queries
          </div>
        </div>
      </div>

      {/* Form area */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-xl py-6">
          <div
            className="rounded-lg border"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="border-b px-4 py-3 text-sm font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              {t('queriesSavedCreate.section.info', '查询信息')}
            </div>
            {dsLoading ? (
              <div
                className="flex items-center justify-center py-8 text-xs"
                style={{ color: 'var(--text-3)' }}
              >
                {t('queriesSavedCreate.loadingDatasources', '加载数据源中…')}
              </div>
            ) : datasources.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {t('queriesSavedCreate.noDatasources', '没有可用的数据源，请先添加数据源后再创建查询。')}
                </p>
              </div>
            ) : (
              <CreateSavedQueryForm
                datasources={datasources}
                onSubmit={async (payload) => {
                  const result = await createMut.mutateAsync(payload)
                  navigate(`/queries/saved/${result.id}`)
                }}
                onCancel={() => navigate('/queries/saved')}
                loading={createMut.isPending}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
