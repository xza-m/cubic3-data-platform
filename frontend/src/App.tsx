import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import AppLayout from './components/Layout/AppLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { Toaster } from '@/components/business'

// Lazy load all page components for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Datasources = lazy(() => import('./pages/Datasources'))
const Datasets = lazy(() => import('./pages/Datasets'))
const DatasetDetail = lazy(() => import('./pages/DatasetDetail'))
const DatasetRegister = lazy(() => import('./pages/DatasetRegister'))
const FileDatasetRegister = lazy(() => import('./pages/FileDatasetRegister'))
const ExtractionTasks = lazy(() => import('./pages/ExtractionTasks'))
const ExtractionTaskConfig = lazy(() => import('./pages/ExtractionTaskConfig'))
const ExtractionRuns = lazy(() => import('./pages/ExtractionRuns'))
const DataChat = lazy(() => import('./pages/DataChat'))
const QueryCenterDashboard = lazy(() => import('./pages/QueryCenter/Dashboard'))
const AppMarket = lazy(() => import('./pages/AppCenter/AppMarket'))
const ExecutionMonitor = lazy(() => import('./pages/AppCenter/ExecutionMonitor'))
const Channels = lazy(() => import('./pages/ConfigCenter/Channels'))
const Subscriptions = lazy(() => import('./pages/ConfigCenter/Subscriptions'))
const CubeList = lazy(() => import('./pages/Semantic/CubeList'))
const RelationCanvas = lazy(() => import('./pages/Semantic/RelationCanvas'))
const DomainList = lazy(() => import('./pages/Semantic/DomainList'))
const ModelingRedirect = lazy(() => import('./pages/Semantic/ModelingRedirect'))
const DomainCanvas = lazy(() => import('./pages/Semantic/DomainCanvas'))
const ViewDetail = lazy(() => import('./pages/Semantic/ViewDetail'))
const DevTools = lazy(() => import('./pages/Semantic/DevTools'))
const Login = lazy(() => import('./pages/Login'))

// Loading component for Suspense fallback
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
      }}
    >
      Loading...
    </div>
  )
}

function RedirectSemanticRoute({ to }: { to: string }) {
  const location = useLocation()
  return <Navigate to={{ pathname: to, search: location.search }} replace />
}

function RedirectLegacyDomainCanvas() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  return (
    <Navigate
      to={{
        pathname: id ? `/semantic/domains/${id}` : '/semantic/domains',
        search: location.search,
      }}
      replace
    />
  )
}

function RedirectLegacyCubeDetailRoute() {
  const { name } = useParams<{ name: string }>()
  const location = useLocation()
  return (
    <Navigate
      to={{
        pathname: name ? `/semantic/cubes/${name}/edit` : '/semantic/cubes',
        search: location.search,
      }}
      replace
    />
  )
}

function RedirectLegacyQueryRoute({ legacy }: { legacy: string }) {
  const location = useLocation()
  const params = new URLSearchParams()
  params.set('legacy', legacy)
  const currentParams = new URLSearchParams(location.search)
  currentParams.forEach((value, key) => {
    if (key === 'legacy') return
    params.append(key, value)
  })
  const search = params.toString()
  return <Navigate to={{ pathname: '/queries', search: search ? `?${search}` : '' }} replace />
}

function App() {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* 登录页 - 独立布局，不使用 AppLayout */}
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />

            {/* 数据中心 */}
            <Route path="data-center">
              <Route index element={<Navigate to="datasources" replace />} />
              <Route path="datasources" element={<Datasources />} />
              <Route path="datasets" element={<Datasets />} />
              <Route path="datasets/:id" element={<DatasetDetail />} />
              <Route path="datasets/register" element={<DatasetRegister />} />
              <Route path="datasets/register/table" element={<DatasetRegister />} />
              <Route path="datasets/register/file" element={<FileDatasetRegister />} />
            </Route>

            <Route path="extraction-tasks" element={<ExtractionTasks />} />
            <Route path="extraction/config" element={<ExtractionTaskConfig />} />
            <Route path="extraction/runs" element={<ExtractionRuns />} />
            <Route path="data-chat" element={<DataChat />} />
            <Route path="queries" element={<QueryCenterDashboard />} />
            <Route path="queries/editor" element={<RedirectLegacyQueryRoute legacy="editor" />} />
            <Route path="queries/visual" element={<RedirectLegacyQueryRoute legacy="visual" />} />
            <Route path="queries/my" element={<RedirectLegacyQueryRoute legacy="my" />} />
            <Route path="queries/history" element={<RedirectLegacyQueryRoute legacy="history" />} />
            <Route path="queries/templates" element={<RedirectLegacyQueryRoute legacy="templates" />} />
            <Route path="queries/scheduled" element={<RedirectLegacyQueryRoute legacy="scheduled" />} />

            {/* 应用中心 */}
            <Route path="apps" element={<AppMarket />} />
            <Route path="apps/:code" element={<Navigate to="/apps" replace />} />
            <Route path="executions" element={<ExecutionMonitor />} />

            {/* 配置中心 */}
            <Route path="config">
              <Route index element={<Navigate to="channels" replace />} />
              <Route path="channels" element={<Channels />} />
              <Route path="subscriptions" element={<Subscriptions />} />
            </Route>

            {/* 语义中心 */}
            <Route path="semantic">
              <Route index element={<Navigate to="workbench" replace />} />
              <Route path="workbench" element={<DevTools />} />
              <Route path="overview" element={<RedirectSemanticRoute to="/semantic/workbench" />} />
              <Route path="cubes" element={<CubeList />} />
              <Route path="cubes/new" element={<RelationCanvas />} />
              <Route path="cubes/:name/edit" element={<RelationCanvas />} />
              <Route path="cubes/:name" element={<RedirectLegacyCubeDetailRoute />} />
              <Route path="domains" element={<DomainList />} />
              <Route path="modeling" element={<ModelingRedirect />} />
              <Route path="domains/:id" element={<DomainCanvas />} />
              <Route path="domains/:id/canvas" element={<RedirectLegacyDomainCanvas />} />
              <Route path="views/:name" element={<ViewDetail />} />
              <Route path="tools" element={<RedirectSemanticRoute to="/semantic/workbench" />} />

              <Route path="playground" element={<RedirectSemanticRoute to="/semantic/cubes" />} />
              <Route path="visual-model" element={<RedirectSemanticRoute to="/semantic/domains" />} />
              <Route path="visual-model/:id" element={<RedirectLegacyDomainCanvas />} />
              <Route path="canvas" element={<RedirectSemanticRoute to="/semantic/modeling" />} />
              <Route path="ide" element={<RedirectSemanticRoute to="/semantic/workbench" />} />
              <Route path="devtools" element={<RedirectSemanticRoute to="/semantic/workbench" />} />
            </Route>
          </Route>
          </Route>

          {/* 未匹配路由重定向到首页 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}

export default App
