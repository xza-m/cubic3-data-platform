// frontend/src/v2/pages/semantic/cubes/CubeEdit.tsx
//
// Cube 设计器（编辑页）。
// 接口：
//   GET  /api/v1/semantic/files/cubes/:name  — 读取 YAML 原始内容
//   PUT  /api/v1/semantic/files/cubes/:name  — 保存 YAML
//   POST /api/v1/semantic/files/cubes/:name/validate — 校验 YAML
//   POST /api/v1/semantic/cubes/:name/activate — 上线
//
// yaml/monaco editor 必须 lazy import。

import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Save, Send } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, CardHead, Chip } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell, @v2/layout/Inspector
import { useAppShell } from '@v2/layout/AppShell'
import { ContextRow, ContextSection } from '@v2/layout/Inspector'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import {
  useCubeDetail,
  useCubeYaml,
  useWriteCubeYaml,
  useValidateCubeYaml,
  useActivateCube,
} from '@v2/hooks/semantic'

// yaml/monaco editor lazy import（规范：§01 §7 §03 §4.2）
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

type Tab = 'yaml' | 'overview' | 'validate' | 'history'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'overview' },
  { id: 'yaml', label: 'YAML' },
  { id: 'validate', label: 'validate' },
  { id: 'history', label: 'history' },
]

export default function CubeEdit() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const [tab, setTab] = useState<Tab>('yaml')
  const [dirty, setDirty] = useState(false)
  const [localYaml, setLocalYaml] = useState<string | null>(null)

  const detailQuery = useCubeDetail(name)
  const yamlQuery = useCubeYaml(name)
  const cube = detailQuery.data
  const yamlContent = localYaml ?? yamlQuery.data?.content ?? ''

  const writeMutation = useWriteCubeYaml(name ?? '')
  const validateMutation = useValidateCubeYaml(name ?? '')
  const activateMutation = useActivateCube()

  useEffect(() => {
    setBreadcrumbs([
      t('nav.semantic', '语义中心'),
      t('nav.cubes', 'Cube'),
      cube?.title ?? name ?? '',
      t('cube.designer', '设计器'),
    ])
  }, [setBreadcrumbs, cube?.title, name])

  useEffect(() => {
    setTopBarActions(
      <>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/semantic/cubes/${name}`)}>
          <ArrowLeft size={12} /> {t('action.back', '返回详情')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || writeMutation.isPending}
          onClick={async () => {
            if (!name) return
            await writeMutation.mutateAsync(yamlContent)
            setDirty(false)
          }}
          aria-label={t('cube.saveDraft', '保存草稿')}
        >
          <Save size={12} /> {t('cube.saveDraft', '保存草稿')}
          {dirty ? <Chip tone="warning">{t('status.modified', '已修改')}</Chip> : null}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={validateMutation.isPending}
          onClick={() => name && validateMutation.mutate(yamlContent)}
          aria-label={t('cube.validate', '校验')}
        >
          <CheckCircle2 size={12} /> {t('cube.validate', '校验')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={activateMutation.isPending || dirty}
          onClick={() => name && activateMutation.mutate(name)}
          aria-label={t('cube.activate', '上线')}
        >
          <Send size={12} /> {t('cube.activate', '上线')}
        </Button>
      </>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, name, dirty, yamlContent, writeMutation, validateMutation, activateMutation])

  useEffect(() => {
    if (!cube) return
    const dims = cube.dimensions ?? []
    const measures = cube.measures ?? []
    setContextPanel({
      title: cube.title,
      subtitle: cube.domain_name ? `Cube · ${cube.domain_name}` : 'Cube',
      body: (
        <>
          <ContextSection title={t('cube.contextBasic', '基础')}>
            <ContextRow label="Cube" value={<code>{cube.name}</code>} />
            {cube.domain_name ? <ContextRow label={t('cube.domain', '业务域')} value={cube.domain_name} /> : null}
            {cube.fact_table ? (
              <ContextRow
                label={t('cube.factTable', '事实表')}
                value={<code className="font-mono text-xs">{cube.fact_table}</code>}
              />
            ) : null}
            <ContextRow label={t('cube.dimensions', '维度')} value={dims.length} />
            <ContextRow label={t('cube.measures', '度量')} value={measures.length} />
          </ContextSection>
          {validateMutation.data ? (
            <ContextSection title={t('cube.validateResult', '校验结果')}>
              {validateMutation.data.diagnostics.map((d, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <Chip tone={d.level === 'ok' ? 'success' : d.level === 'error' ? 'danger' : 'warning'}>
                    {d.level.toUpperCase()}
                  </Chip>
                  <span className="text-2 leading-4">{d.message}</span>
                </div>
              ))}
            </ContextSection>
          ) : null}
        </>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, cube, validateMutation.data])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 头部 tab 栏 */}
      <div
        className="border-b px-4 py-2"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <div className="obj-dot" style={{ background: 'var(--violet)' }}>CB</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-1">
              {cube?.title ?? name}
              {dirty ? <Chip tone="warning">{t('status.modified', '已修改')}</Chip> : null}
            </div>
            <div className="truncate text-xs text-3">
              <code>{name}</code>
              {cube?.domain_name ? ` · ${cube.domain_name}` : ''}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1">
          {TABS.map((tab_item) => (
            <button
              key={tab_item.id}
              type="button"
              onClick={() => setTab(tab_item.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: tab === tab_item.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === tab_item.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {t(`cube.tab.${tab_item.id}`, tab_item.label)}
            </button>
          ))}
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-auto scroll-thin">
        {tab === 'yaml' ? (
          <div className="h-full min-h-80">
            {yamlQuery.isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-3">{t('loading', '加载中…')}</div>
            ) : (
              <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-3">{t('loading', '加载编辑器…')}</div>}>
                <MonacoEditor
                  height="100%"
                  language="yaml"
                  value={yamlContent}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                  }}
                  onChange={(v) => {
                    setLocalYaml(v ?? '')
                    setDirty(true)
                  }}
                />
              </Suspense>
            )}
          </div>
        ) : tab === 'overview' ? (
          <div className="p-4 space-y-3">
            {cube ? (
              <Card>
                <CardHead title={t('cube.basicInfo', '基础信息')} />
                <CardBody>
                  <dl className="divide-y rounded-md border text-xs" style={{ borderColor: 'var(--border)' }}>
                    {[
                      [t('cube.name', '名称'), cube.name],
                      [t('cube.title', '标题'), cube.title],
                      [t('cube.domain', '业务域'), cube.domain_name ?? '—'],
                      [t('cube.factTable', '事实表'), cube.fact_table ?? '—'],
                      [t('cube.status', '状态'), cube.status ?? '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                        <dt className="text-3">{label}</dt>
                        <dd className="font-mono text-1">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border px-2 py-2 text-center" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-base font-semibold text-1" style={{ color: 'var(--violet)' }}>
                        {(cube.dimensions ?? []).length}
                      </div>
                      <div className="text-xs text-3">{t('cube.dimensions', '维度')}</div>
                    </div>
                    <div className="rounded-md border px-2 py-2 text-center" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-base font-semibold text-1" style={{ color: 'var(--accent)' }}>
                        {(cube.measures ?? []).length}
                      </div>
                      <div className="text-xs text-3">{t('cube.measures', '度量')}</div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <div className="py-8 text-center text-sm text-3">{t('loading', '加载中…')}</div>
            )}
          </div>
        ) : tab === 'validate' ? (
          <div className="p-4">
            <Card>
              <CardHead
                title={t('cube.validatePanel', '校验结果')}
                extra={
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={validateMutation.isPending}
                    onClick={() => name && validateMutation.mutate(yamlContent)}
                  >
                    {validateMutation.isPending ? t('loading', '校验中…') : t('cube.runValidate', '运行校验')}
                  </Button>
                }
              />
              <CardBody>
                {validateMutation.isIdle ? (
                  <p className="text-xs text-3">{t('cube.validateIdle', '点击"运行校验"检查 YAML 语法与 Schema。')}</p>
                ) : validateMutation.isError ? (
                  <p className="text-xs text-danger">{t('error.validateFailed', '校验请求失败，请重试。')}</p>
                ) : validateMutation.data ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Chip tone={validateMutation.data.valid ? 'success' : 'danger'}>
                        {validateMutation.data.valid ? t('cube.validatePass', '通过') : t('cube.validateFail', '失败')}
                      </Chip>
                    </div>
                    <div className="space-y-1.5">
                      {validateMutation.data.diagnostics.map((d, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs">
                          <Chip tone={d.level === 'ok' ? 'success' : d.level === 'error' ? 'danger' : 'warning'}>
                            {d.level.toUpperCase()}
                          </Chip>
                          <span className="text-2">{d.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </div>
        ) : tab === 'history' ? (
          <div className="p-4">
            <Card>
              <CardHead title={t('cube.history', '变更历史')} />
              <CardBody>
                {/* 变更历史基于 YAML 文件；目前后端无专用 history API，通过 git log 实现需 B-back-* 支持 */}
                <p className="text-xs text-3">
                  {t('cube.historyPlaceholder', 'YAML 文件的变更历史将在版本管理接入后显示。')}
                </p>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}
