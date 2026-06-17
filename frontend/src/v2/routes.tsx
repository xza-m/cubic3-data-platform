// frontend/src/v2/routes.tsx
// 完整路由表。静态路由写在动态路由之前（plan §00 §5 要求）。
//
// 注释格式：// const Xxx = lazy(() => import('@v2/pages/<domain>/Xxx'))
//
// 路由路径对齐 demo（tmp/platform-redesign/src/routes.tsx）路径约定。
import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { useMyPreferences } from '@v2/hooks/userPreferences'
import { AppShell } from '@v2/layout/AppShell'
import ProtectedRoute from '@v2/pages/ProtectedRoute'
import { RouteGuard } from '@v2/components/RouteGuard'
import { RouteErrorBoundary } from '@v2/components/RouteErrorBoundary'
import { t } from '@v2/i18n'

// ── Legacy URL redirects（Round 3 cutover · 2026-04-20） ───────────────────────
// 只保留已上线数据 / 应用模块的历史深链；语义中心仍处于设计收敛期，路由以新 IA 为准。
// Legacy 路径 → v2 等价路径。`:param` 占位符自动从 useParams 取值并替换。
const LEGACY_REDIRECTS: Record<string, string> = {
  '/queries/console': '/queries',
  '/queries/editor': '/queries',
  '/queries/templates': '/queries',
  // 数据域 top 高频旧路径（v1 顶级 IA → data-center 新 IA）
  '/datasources': '/data-center/connections',
  '/datasources/:id': '/data-center/connections/:id',
  '/datasets': '/data-center/assets',
  '/datasets/:id': '/data-center/assets/:id',
  '/extraction': '/data-center/sync/tasks',
}

function LegacyRedirect({ to }: { to: string }) {
  const params = useParams()
  const { search, hash } = useLocation()
  let resolved = to
  for (const [key, value] of Object.entries(params)) {
    if (value) resolved = resolved.replace(`:${key}`, value)
  }
  return <Navigate to={`${resolved}${search}${hash}`} replace />
}

// ── 已实现的页面 ──────────────────────────────────────────────────────────────
const Login = lazy(() => import('@v2/pages/Login'))
const Dashboard = lazy(() => import('@v2/pages/Dashboard'))
const NotFound = lazy(() => import('@v2/pages/NotFound'))
const Forbidden = lazy(() => import('@v2/pages/Forbidden'))
const SettingsPage = lazy(() => import('@v2/pages/settings/Settings'))
const ProfilePage = lazy(() => import('@v2/pages/profile/Profile'))

// ── Data 域（data-center） ─────────────────────────────────────────────────────
const DataCenter = lazy(() => import('@v2/pages/data/DataCenter'))
const DatasourceDetail = lazy(() => import('@v2/pages/data/DatasourceDetail'))
const DatasourceCreate = lazy(() => import('@v2/pages/data/DatasourceCreate'))
const DatasetDetail = lazy(() => import('@v2/pages/data/DatasetDetail'))
const DatasetCreate = lazy(() => import('@v2/pages/data/DatasetCreate'))
const ExtractionTasks = lazy(() => import('@v2/pages/data/ExtractionTasks'))
const ExtractionTaskDetail = lazy(() => import('@v2/pages/data/ExtractionTaskDetail'))
const ExtractionTaskCreate = lazy(() => import('@v2/pages/data/ExtractionTaskCreate'))
const ExtractionRuns = lazy(() => import('@v2/pages/data/ExtractionRuns'))
const ExtractionRunDetail = lazy(() => import('@v2/pages/data/ExtractionRunDetail'))
const ExtractionConfig = lazy(() => import('@v2/pages/data/ExtractionConfig'))

// ── Data Chat 域 ───────────────────────────────────────────────────────────────
const DataChat = lazy(() => import('@v2/pages/chat/DataChat'))

// ── Queries 域 ────────────────────────────────────────────────────────────────
const QueryConsole = lazy(() => import('@v2/pages/queries/QueryConsole'))
const QueriesSaved = lazy(() => import('@v2/pages/queries/QueriesSaved'))
const QueriesSavedDetail = lazy(() => import('@v2/pages/queries/QueriesSavedDetail'))
const QueryHistory = lazy(() => import('@v2/pages/queries/QueryHistory'))
const QueryHistoryDetail = lazy(() => import('@v2/pages/queries/QueryHistoryDetail'))
const QueriesScheduled = lazy(() => import('@v2/pages/queries/QueriesScheduled'))
const QueriesScheduledDetail = lazy(() => import('@v2/pages/queries/QueriesScheduledDetail'))
const QueriesScheduledCreate = lazy(() => import('@v2/pages/queries/QueriesScheduledCreate'))
const QueriesSavedCreate = lazy(() => import('@v2/pages/queries/QueriesSavedCreate'))
const QueryVisual = lazy(() => import('@v2/pages/queries/visual/QueryVisual'))
const QueryExports = lazy(() => import('@v2/pages/queries/QueryExports'))

// ── Apps 域 ───────────────────────────────────────────────────────────────────
const Marketplace = lazy(() => import('@v2/pages/apps/Marketplace'))
const AppDetail = lazy(() => import('@v2/pages/apps/AppDetail'))
const Instances = lazy(() => import('@v2/pages/apps/instances/Instances'))
const InstanceCreate = lazy(() => import('@v2/pages/apps/instances/InstanceCreate'))
const InstanceDetail = lazy(() => import('@v2/pages/apps/instances/InstanceDetail'))
const Executions = lazy(() => import('@v2/pages/apps/executions/Executions'))
const ExecutionDetail = lazy(() => import('@v2/pages/apps/executions/ExecutionDetail'))

// ── Config 域 ─────────────────────────────────────────────────────────────────
const Channels = lazy(() => import('@v2/pages/config/channels/Channels'))
const ChannelCreate = lazy(() => import('@v2/pages/config/channels/ChannelCreate'))
const ChannelDetail = lazy(() => import('@v2/pages/config/channels/ChannelDetail'))
const Subscriptions = lazy(() => import('@v2/pages/config/subscriptions/Subscriptions'))
const SubscriptionCreate = lazy(() => import('@v2/pages/config/subscriptions/SubscriptionCreate'))
const SubscriptionDetail = lazy(() => import('@v2/pages/config/subscriptions/SubscriptionDetail'))
const AccessIdentity = lazy(() => import('@v2/pages/config/access/AccessIdentity'))

// ── Semantic 域 ───────────────────────────────────────────────────────────────
const OntologyLayout = lazy(() => import('@v2/pages/semantic/ontology/_layout'))
const OntologyWorkbench = lazy(() => import('@v2/pages/semantic/ontology/Workbench'))
const OntologyObjects = lazy(() => import('@v2/pages/semantic/ontology/Objects'))
const ObjectCreate = lazy(() => import('@v2/pages/semantic/ontology/ObjectCreate'))
const ObjectDetail = lazy(() => import('@v2/pages/semantic/ontology/ObjectDetail'))
const ObjectEdit = lazy(() => import('@v2/pages/semantic/ontology/ObjectEdit'))
const OntologyMetrics = lazy(() => import('@v2/pages/semantic/ontology/Metrics'))
const OntologyRelations = lazy(() => import('@v2/pages/semantic/ontology/Relations'))
const OntologyGovernance = lazy(() => import('@v2/pages/semantic/ontology/Governance'))
const DevTools = lazy(() => import('@v2/pages/semantic/devtools/DevTools'))
const SemanticModelingWorkbench = lazy(() => import('@v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench'))
const AssetLayout = lazy(() => import('@v2/pages/semantic/assets/_layout'))
const Assets = lazy(() => import('@v2/pages/semantic/assets/Assets'))
const AssetTables = lazy(() => import('@v2/pages/semantic/assets/Tables'))
const AssetFields = lazy(() => import('@v2/pages/semantic/assets/Fields'))
const AssetLineage = lazy(() => import('@v2/pages/semantic/assets/Lineage'))
const AssetQuality = lazy(() => import('@v2/pages/semantic/assets/Quality'))
const AssetSyncRuns = lazy(() => import('@v2/pages/semantic/assets/SyncRuns'))
const Cubes = lazy(() => import('@v2/pages/semantic/cubes/Cubes'))
const CubeCreate = lazy(() => import('@v2/pages/semantic/cubes/CubeCreate'))
const CubeDetail = lazy(() => import('@v2/pages/semantic/cubes/CubeDetail'))
const CubeEdit = lazy(() => import('@v2/pages/semantic/cubes/CubeEdit'))
const ViewDetail = lazy(() => import('@v2/pages/semantic/views/ViewDetail'))
const Domains = lazy(() => import('@v2/pages/semantic/domains/Domains'))
const DomainCanvas = lazy(() => import('@v2/pages/semantic/domains/DomainCanvas'))
const RelationCanvas = lazy(() => import('@v2/pages/semantic/relations/RelationCanvas'))

const PageLoader = () => (
  <div className="flex flex-1 items-center justify-center text-[12px] text-3">{t('common.loading', '加载中…')}</div>
)

const wrap = (node: ReactNode) => <Suspense fallback={<PageLoader />}>{node}</Suspense>

// 根路由重定向：读取用户偏好 default_landing，加载中显示 PageLoader
function DefaultLandingRedirect() {
  const { data: prefs, isLoading } = useMyPreferences()
  if (isLoading) return <PageLoader />
  return <Navigate to={prefs?.default_landing ?? '/dashboard'} replace />
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* 公开页面 */}
      <Route path="/login" element={wrap(<Login />)} />

      {/* 认证保护的页面 */}
      <Route path="/" element={<ProtectedRoute />}>
        <Route element={<AppShell />} errorElement={<RouteErrorBoundary />}>
          <Route index element={<DefaultLandingRedirect />} />

          {/* 总览 */}
          <Route path="dashboard" element={wrap(<Dashboard />)} />

          {/* ── 数据中心（概览 + 连接管理 + 资产目录 + 同步任务 + 影响分析） ── */}
          <Route path="data-center">
            <Route index element={wrap(<DataCenter />)} />
            <Route path="overview" element={<Navigate to="/data-center" replace />} />
            <Route path="connections">
              <Route index element={wrap(<DataCenter />)} />
              <Route path="new" element={wrap(<DatasourceCreate />)} />
              <Route path=":id/edit" element={wrap(<DatasourceCreate mode="edit" />)} />
              <Route path=":id" element={wrap(<DatasourceDetail />)} />
            </Route>
            <Route path="assets">
              <Route index element={wrap(<DataCenter />)} />
              <Route path="register">
                <Route index element={wrap(<DatasetCreate />)} />
                <Route path="table" element={wrap(<DatasetCreate />)} />
                <Route path="file" element={wrap(<DatasetCreate />)} />
              </Route>
              <Route path=":id" element={wrap(<DatasetDetail />)} />
            </Route>
            <Route path="sync">
              <Route index element={wrap(<DataCenter />)} />
              <Route path="tasks">
                <Route index element={wrap(<ExtractionTasks />)} />
                <Route path="new" element={wrap(<ExtractionTaskCreate />)} />
                <Route path=":id" element={wrap(<ExtractionTaskDetail />)} />
              </Route>
              <Route path="runs">
                <Route index element={wrap(<ExtractionRuns />)} />
                <Route path=":id" element={wrap(<ExtractionRunDetail />)} />
              </Route>
              <Route path="config" element={wrap(<ExtractionConfig />)} />
            </Route>
            <Route path="impact" element={wrap(<DataCenter />)} />
          </Route>

          {/* ── 数据对话 ── */}
          <Route path="data-chat" element={wrap(<DataChat />)} />

          {/* ── 查询中心 ── */}
          <Route path="queries">
            <Route index element={wrap(<QueryConsole />)} />
            <Route path="visual" element={wrap(<QueryVisual />)} />
            <Route path="my">
              <Route index element={wrap(<QueriesSaved />)} />
              <Route path="new" element={wrap(<QueriesSavedCreate />)} />
              <Route path=":id" element={wrap(<QueriesSavedDetail />)} />
            </Route>
            {/* Legacy: /queries/my/* → /queries/my/* */}
            <Route path="saved">
              <Route index element={<Navigate to="/queries/my" replace />} />
              <Route path="new" element={<Navigate to="/queries/my/new" replace />} />
              <Route path=":id" element={<LegacyRedirect to="/queries/my/:id" />} />
            </Route>
            <Route path="history">
              <Route index element={wrap(<QueryHistory />)} />
              <Route path=":id" element={wrap(<QueryHistoryDetail />)} />
            </Route>
            <Route path="scheduled">
              <Route index element={wrap(<QueriesScheduled />)} />
              <Route path="new" element={wrap(<QueriesScheduledCreate />)} />
              <Route path=":id" element={wrap(<QueriesScheduledDetail />)} />
            </Route>
            <Route path="exports" element={wrap(<QueryExports />)} />
          </Route>

          {/* ── 应用市场 ── 静态 instances 段必须在动态 :code 之前 */}
          <Route path="apps">
            <Route index element={wrap(<Marketplace />)} />
            <Route path="instances">
              <Route index element={wrap(<Instances />)} />
              <Route path="new" element={wrap(<InstanceCreate />)} />
              <Route path=":id" element={wrap(<InstanceDetail />)} />
            </Route>
            <Route path="executions">
              <Route index element={wrap(<Executions />)} />
              <Route path=":id" element={wrap(<ExecutionDetail />)} />
            </Route>
            <Route path=":code" element={wrap(<AppDetail />)} />
          </Route>

          {/* Legacy 重定向：/executions → /apps/executions，避免旧链接丢失应用侧边栏 */}
          <Route path="executions">
            <Route index element={<Navigate to="/apps/executions" replace />} />
            <Route path=":id" element={<LegacyRedirect to="/apps/executions/:id" />} />
          </Route>

          {/* ── 配置中心 ── */}
          <Route path="config">
            <Route index element={<Navigate to="/config/access" replace />} />

            <Route path="access">
              <Route index element={wrap(<RouteGuard required="access.read"><AccessIdentity view="permissions" /></RouteGuard>)} />
              <Route path="audit" element={wrap(<RouteGuard required="access.audit.read"><AccessIdentity view="audit" /></RouteGuard>)} />
              <Route path="observability" element={wrap(<RouteGuard required="access.gateway.read"><AccessIdentity view="observability" /></RouteGuard>)} />
            </Route>

            <Route path="channels">
              <Route index element={wrap(<Channels />)} />
              <Route path="new" element={wrap(<ChannelCreate />)} />
              <Route path=":id" element={wrap(<ChannelDetail />)} />
            </Route>

            <Route path="subscriptions">
              <Route index element={wrap(<Subscriptions />)} />
              <Route path="new" element={wrap(<SubscriptionCreate />)} />
              <Route path=":id" element={wrap(<SubscriptionDetail />)} />
            </Route>

          </Route>

          {/* ── 语义中心 ── */}
          <Route path="semantic">
            <Route index element={<Navigate to="/semantic/ontology" replace />} />

            {/* 本体工作台（OntologyLayout 提供二级导航 + Outlet） */}
            <Route path="ontology" element={wrap(<OntologyLayout />)}>
              <Route index element={wrap(<OntologyWorkbench />)} />
              {/* 对象：静态 new 必须在动态 :name 之前 */}
              <Route path="objects">
                <Route index element={wrap(<OntologyObjects />)} />
                <Route path="new" element={wrap(<ObjectCreate />)} />
                <Route path=":name">
                  <Route index element={wrap(<ObjectDetail />)} />
                  <Route path="edit" element={wrap(<ObjectEdit />)} />
                </Route>
              </Route>
              <Route path="metrics" element={wrap(<OntologyMetrics />)} />
              <Route path="relations" element={wrap(<OntologyRelations />)} />
              <Route path="governance" element={wrap(<OntologyGovernance />)} />
            </Route>

            {/* 语义诊断工作台 */}
            <Route path="workbench" element={wrap(<DevTools />)} />

            {/* 顶层语义建设工作台：不归属于 Cube 层级 */}
            <Route path="modeling-workbench" element={wrap(<SemanticModelingWorkbench />)} />
            <Route path="modeling-workbench/quick" element={wrap(<SemanticModelingWorkbench />)} />
            <Route path="modeling-workbench/:projectId/candidate/:candidateId" element={wrap(<SemanticModelingWorkbench />)} />

            {/* 数据资产底座 */}
            <Route path="assets" element={wrap(<AssetLayout />)}>
              <Route index element={wrap(<Assets />)} />
              <Route path="tables" element={wrap(<AssetTables />)} />
              <Route path="table-profile" element={wrap(<AssetQuality />)} />
              <Route path="field-profile" element={wrap(<AssetFields />)} />
              <Route path="lineage-usage" element={wrap(<AssetLineage />)} />
              <Route path="sync" element={wrap(<AssetSyncRuns />)} />
            </Route>

            {/* Cube：静态 new 在动态 :name 前；edit 作为 :name 的子路由 */}
            <Route path="cubes">
              <Route index element={wrap(<Cubes />)} />
              <Route path="new" element={wrap(<CubeCreate />)} />
              <Route path=":name">
                <Route index element={wrap(<CubeDetail />)} />
                <Route path="edit" element={wrap(<CubeEdit />)} />
              </Route>
            </Route>

            {/* 视图详情 */}
            <Route path="views/:name" element={wrap(<ViewDetail />)} />

            {/* 业务上下文 */}
            <Route path="domains">
              <Route index element={wrap(<Domains />)} />
              <Route path=":id" element={wrap(<DomainCanvas />)} />
            </Route>

            {/* P6: 语义关系画布（Cube Join 图） */}
            <Route path="relations" element={wrap(<RelationCanvas />)} />
          </Route>

          {/* ── 设置 ── */}
          <Route path="settings" element={wrap(<SettingsPage />)} />
          <Route path="profile" element={wrap(<ProfilePage />)} />

          {/* ── Legacy redirect 表（cutover 兼容） ── */}
          {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
            <Route key={from} path={from.slice(1)} element={<LegacyRedirect to={to} />} />
          ))}

          {/* 特殊页面 */}
          <Route path="forbidden" element={wrap(<Forbidden />)} />
          <Route path="not-found" element={wrap(<NotFound />)} />
          <Route path="*" element={wrap(<NotFound />)} />
        </Route>
      </Route>

      {/* 兜底 */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
