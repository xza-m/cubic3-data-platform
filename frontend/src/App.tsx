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
const QueryDashboard = lazy(() => import('./pages/QueryCenter/Dashboard'))
const QueryEditor = lazy(() => import('./pages/QueryCenter/Editor'))
const MyQueries = lazy(() => import('./pages/QueryCenter/MyQueries'))
const QueryHistory = lazy(() => import('./pages/QueryCenter/History'))
const Templates = lazy(() => import('./pages/QueryCenter/Templates'))
const VisualBuilder = lazy(() => import('./pages/QueryCenter/VisualBuilder'))
const ScheduledQueries = lazy(() => import('./pages/QueryCenter/ScheduledQueries'))
const AppMarket = lazy(() => import('./pages/AppCenter/AppMarket'))
const AppDetail = lazy(() => import('./pages/AppCenter/AppDetail'))
const ExecutionMonitor = lazy(() => import('./pages/AppCenter/ExecutionMonitor'))
const Channels = lazy(() => import('./pages/ConfigCenter/Channels'))
const Subscriptions = lazy(() => import('./pages/ConfigCenter/Subscriptions'))
const SemanticOverview = lazy(() => import('./pages/Semantic/Overview'))
const CubeList = lazy(() => import('./pages/Semantic/CubeList'))
const CubeDetail = lazy(() => import('./pages/Semantic/CubeDetail'))
const CubeStudio = lazy(() => import('./pages/Semantic/CubeStudio'))
const DomainList = lazy(() => import('./pages/Semantic/DomainList'))
const DomainModelingEntry = lazy(() => import('./pages/Semantic/DomainModelingEntry'))
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
            <Route path="queries" element={<QueryDashboard />} />
            <Route path="queries/editor" element={<QueryEditor />} />
            <Route path="queries/visual" element={<VisualBuilder />} />
            <Route path="queries/my" element={<MyQueries />} />
            <Route path="queries/history" element={<QueryHistory />} />
            <Route path="queries/templates" element={<Templates />} />
            <Route path="queries/scheduled" element={<ScheduledQueries />} />

            {/* 应用中心 */}
            <Route path="apps" element={<AppMarket />} />
            <Route path="apps/:code" element={<AppDetail />} />
            <Route path="executions" element={<ExecutionMonitor />} />

            {/* 配置中心 */}
            <Route path="config">
              <Route index element={<Navigate to="channels" replace />} />
              <Route path="channels" element={<Channels />} />
              <Route path="subscriptions" element={<Subscriptions />} />
            </Route>

            {/* 语义中心 */}
            <Route path="semantic">
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<SemanticOverview />} />
              <Route path="cubes" element={<CubeList />} />
              <Route path="cubes/new" element={<CubeStudio />} />
              <Route path="cubes/:name/edit" element={<CubeStudio />} />
              <Route path="cubes/:name" element={<CubeDetail />} />
              <Route path="domains" element={<DomainList />} />
              <Route path="modeling" element={<DomainModelingEntry />} />
              <Route path="domains/:id" element={<DomainCanvas />} />
              <Route path="domains/:id/canvas" element={<RedirectLegacyDomainCanvas />} />
              <Route path="views/:name" element={<ViewDetail />} />
              <Route path="tools" element={<DevTools />} />

              <Route path="playground" element={<RedirectSemanticRoute to="/semantic/cubes" />} />
              <Route path="visual-model" element={<RedirectSemanticRoute to="/semantic/domains" />} />
              <Route path="visual-model/:id" element={<RedirectLegacyDomainCanvas />} />
              <Route path="canvas" element={<RedirectSemanticRoute to="/semantic/modeling" />} />
              <Route path="ide" element={<RedirectSemanticRoute to="/semantic/tools" />} />
              <Route path="devtools" element={<RedirectSemanticRoute to="/semantic/tools" />} />
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
