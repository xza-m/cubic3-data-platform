import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import client from './client'
import {
  deleteInstance,
  disableInstance,
  enableInstance,
  executeInstance,
  getApp,
  getApps,
  getCategories,
  getConfigSchema,
  getExecution,
  getExecutions,
  getExecutionStats,
  getInstance,
  getInstances,
  updateInstance,
  createInstance,
  validateConfig,
} from './appCenter'
import {
  applyTemplate,
  createFolder,
  createQuery,
  createTemplate,
  deleteQuery,
  deleteTemplate,
  executeQuery,
  getFolders,
  getHistories,
  getQueries,
  getQuery,
  getStatistics,
  getTemplate,
  getTemplates,
  toggleFavorite,
  updateQuery,
  updateTemplate,
} from './queries'
import {
  createConversation,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  sendMessage,
} from './conversations'
import {
  createChannel,
  deleteChannel,
  getChannel,
  getChannels,
  toggleChannel,
  updateChannel,
} from './channels'
import {
  createDataset,
  deleteDataset,
  getDataset,
  getDatasetFields,
  getDatasets,
  getDatasetStatistics,
  previewDataset,
  syncDatasetSchema,
  updateDataset,
} from './datasets'
import {
  createDataSource,
  deleteDataSource,
  getDataSource,
  getDataSourceDatabases,
  getDataSourceSchemas,
  getDataSources,
  getDataSourceStatistics,
  getDataSourceTables,
  getDataSourceTableSchema,
  getDataSourceTypes,
  previewTableData,
  syncDataSourceCatalog,
  testDataSourceConnection,
  updateDataSource,
} from './datasources'
import {
  createTask,
  deleteTask,
  downloadRun,
  executeTask,
  getRuns,
  getTask,
  getTasks,
  previewData,
  updateTask,
} from './extraction'
import { uploadCSVFile, uploadTabularFile } from './files'
import { getSchemas, getTableSchema } from './schema'
import {
  executeSQL,
  executeSQLSmart,
  getQueryResult,
  getQueryStatus,
  pollQueryUntilComplete,
  submitAsyncQuery,
  validateSQL,
} from './sqllab'
import {
  createSubscription,
  deleteSubscription,
  getSubscription,
  getSubscriptions,
  getSubscriptionsByAppInstance,
  toggleSubscription,
  updateSubscription,
} from './subscriptions'
import {
  activateCube,
  addCubeToDomain,
  addJoinToDomain,
  compileDsl,
  createCatalog,
  createCube,
  createCubeDraftFromSource,
  createDomain,
  deprecateCube,
  deleteCatalog,
  describeCube,
  describeDomain,
  describeView,
  getBatchMaterializeStatus,
  getDomainCanvas,
  getGraph,
  getMaterializeStatus,
  listCubes,
  listDomainCatalogs,
  listDomains,
  listRecipes,
  listViews,
  materializeView,
  publishDomain,
  querySemantic,
  querySemanticInDomain,
  runSchemaSync,
  updateCatalog,
  updateCube,
  updateDomain,
} from './semantic'
import {
  applyOntologyTemplate,
  getBusinessAction,
  getCubeBacklinks,
  getBusinessMetricLinks,
  getOntologyTemplate,
  getPolicyAudit,
  getPolicyImpact,
  getBusinessRelation,
  getExecutionCompilePreview,
  getExecutionExecute,
  getExecutionPlanPreview,
  getOntologyEntityHistory,
  getOntologyEntityImpact,
  getSemanticExecutePlan,
  getSemanticExecutePlanPreview,
  getSemanticPlanPreview,
  getSemanticRoutePreview,
  getSemanticConsistencyReport,
  listBusinessActions,
  listBusinessMetrics,
  listBusinessObjects,
  listBusinessRelations,
  publishOntologyEntity,
  saveBusinessAction,
  saveBusinessMetric,
  saveBusinessRelation,
} from './ontology'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}))

const mockedClient = vi.mocked(client, true)

describe('api wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('queries api', () => {
    it('executeQuery 透传 post 响应', async () => {
      const response = { code: 0, message: 'ok' }
      mockedClient.post.mockResolvedValueOnce(response as never)

      await expect(executeQuery({ source_id: 1, sql_query: 'select 1' })).resolves.toBe(response)
      expect(mockedClient.post).toHaveBeenCalledWith('/queries/execute', { source_id: 1, sql_query: 'select 1' })
    })

    it('getQueries 返回 response.data', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1, page: 1, page_size: 20, total_pages: 1 } } as never)

      await expect(getQueries({ search: 'cube' })).resolves.toEqual({ items: [{ id: 1 }], total: 1, page: 1, page_size: 20, total_pages: 1 })
      expect(mockedClient.get).toHaveBeenCalledWith('/queries', { params: { search: 'cube' } })
    })

    it('getQuery 返回单个查询详情', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { id: 9, query_name: '日报' } } as never)

      await expect(getQuery(9)).resolves.toEqual({ id: 9, query_name: '日报' })
      expect(mockedClient.get).toHaveBeenCalledWith('/queries/9')
    })

    it('createQuery 创建查询', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 3, query_code: 'Q3', query_name: '周报' } } as never)

      await expect(createQuery({ query_name: '周报', source_id: 2, sql_query: 'select 2' })).resolves.toEqual({
        id: 3,
        query_code: 'Q3',
        query_name: '周报',
      })
      expect(mockedClient.post).toHaveBeenCalledWith('/queries', { query_name: '周报', source_id: 2, sql_query: 'select 2' })
    })

    it('updateQuery 更新查询', async () => {
      mockedClient.put.mockResolvedValueOnce({ data: { id: 3, query_name: '新版周报' } } as never)

      await expect(updateQuery(3, { query_name: '新版周报' })).resolves.toEqual({ id: 3, query_name: '新版周报' })
      expect(mockedClient.put).toHaveBeenCalledWith('/queries/3', { query_name: '新版周报' })
    })

    it('deleteQuery 删除查询', async () => {
      mockedClient.delete.mockResolvedValueOnce(undefined as never)

      await expect(deleteQuery(5)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/queries/5')
    })

    it('toggleFavorite 切换收藏', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { is_favorite: true } } as never)

      await expect(toggleFavorite(6)).resolves.toEqual({ is_favorite: true })
      expect(mockedClient.post).toHaveBeenCalledWith('/queries/6/favorite')
    })

    it('getFolders 获取文件夹列表', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: [{ id: 1, folder_name: '默认' }] } as never)

      await expect(getFolders()).resolves.toEqual([{ id: 1, folder_name: '默认' }])
      expect(mockedClient.get).toHaveBeenCalledWith('/queries/folders')
    })

    it('createFolder 创建文件夹', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 2, folder_name: '报表' } } as never)

      await expect(createFolder({ folder_name: '报表' })).resolves.toEqual({ id: 2, folder_name: '报表' })
      expect(mockedClient.post).toHaveBeenCalledWith('/queries/folders', { folder_name: '报表' })
    })

    it('getHistories 获取查询历史', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1, page: 1, page_size: 20, total_pages: 1 } } as never)

      await expect(getHistories({ status: 'success' })).resolves.toEqual({ items: [{ id: 1 }], total: 1, page: 1, page_size: 20, total_pages: 1 })
      expect(mockedClient.get).toHaveBeenCalledWith('/queries/histories', { params: { status: 'success' } })
    })

    it('getStatistics 获取统计数据', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { query_count_week: 7 } } as never)

      await expect(getStatistics()).resolves.toEqual({ query_count_week: 7 })
      expect(mockedClient.get).toHaveBeenCalledWith('/queries/statistics')
    })

    it('getTemplates 获取模板列表', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1, page: 1, page_size: 20, total_pages: 1 } } as never)

      await expect(getTemplates({ category: '分析' })).resolves.toEqual({ items: [{ id: 1 }], total: 1, page: 1, page_size: 20, total_pages: 1 })
      expect(mockedClient.get).toHaveBeenCalledWith('/queries/templates', { params: { category: '分析' } })
    })

    it('getTemplate 获取模板详情', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { id: 8, template_name: '明细模板' } } as never)

      await expect(getTemplate(8)).resolves.toEqual({ id: 8, template_name: '明细模板' })
      expect(mockedClient.get).toHaveBeenCalledWith('/queries/templates/8')
    })

    it('createTemplate 创建模板', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 12, template_name: '新模板' } } as never)

      await expect(createTemplate({ template_name: '新模板', sql_template: 'select 1' })).resolves.toEqual({ id: 12, template_name: '新模板' })
      expect(mockedClient.post).toHaveBeenCalledWith('/queries/templates', { template_name: '新模板', sql_template: 'select 1' })
    })

    it('updateTemplate 更新模板', async () => {
      mockedClient.put.mockResolvedValueOnce({ data: { id: 12, template_name: '更新模板' } } as never)

      await expect(updateTemplate(12, { template_name: '更新模板' })).resolves.toEqual({ id: 12, template_name: '更新模板' })
      expect(mockedClient.put).toHaveBeenCalledWith('/queries/templates/12', { template_name: '更新模板' })
    })

    it('deleteTemplate 删除模板', async () => {
      mockedClient.delete.mockResolvedValueOnce(undefined as never)

      await expect(deleteTemplate(12)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/queries/templates/12')
    })

    it('applyTemplate 使用模板生成 SQL', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { sql_query: 'select *', template_name: '模板' } } as never)

      await expect(applyTemplate(12, { start_date: '2026-03-01' })).resolves.toEqual({ sql_query: 'select *', template_name: '模板' })
      expect(mockedClient.post).toHaveBeenCalledWith('/queries/templates/12/use', { start_date: '2026-03-01' })
    })
  })

  describe('conversations api', () => {
    it('createConversation 创建对话', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 1 } } as never)

      await expect(createConversation(3, '学习会话', '描述')).resolves.toEqual({ data: { id: 1 } })
      expect(mockedClient.post).toHaveBeenCalledWith('/conversations', {
        dataset_id: 3,
        title: '学习会话',
        description: '描述',
      })
    })

    it('listConversations 使用默认分页', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [], offset: 0, limit: 20, total: 0 } } as never)

      await expect(listConversations()).resolves.toEqual({ data: { items: [], offset: 0, limit: 20, total: 0 } })
      expect(mockedClient.get).toHaveBeenCalledWith('/conversations', { params: { offset: 0, limit: 20 } })
    })

    it('getConversation 获取详情', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { id: 9, messages: [] } } as never)

      await expect(getConversation(9)).resolves.toEqual({ data: { id: 9, messages: [] } })
      expect(mockedClient.get).toHaveBeenCalledWith('/conversations/9')
    })

    it('deleteConversation 删除对话', async () => {
      mockedClient.delete.mockResolvedValueOnce(undefined as never)

      await expect(deleteConversation(9)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/conversations/9')
    })

    it('sendMessage 发送消息', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { user_message: { id: 1 }, ai_message: { id: 2 } } } as never)

      await expect(sendMessage(9, '你好')).resolves.toEqual({ data: { user_message: { id: 1 }, ai_message: { id: 2 } } })
      expect(mockedClient.post).toHaveBeenCalledWith('/conversations/9/messages', { content: '你好' })
    })

    it('getMessages 从对话详情提取消息数组', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { id: 9, messages: [{ id: 2, content: 'hi' }] } } as never)

      await expect(getMessages(9)).resolves.toEqual([{ id: 2, content: 'hi' }])
    })
  })

  describe('channels api', () => {
    it('getChannels 获取渠道列表', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [], total: 0 } } as never)

      await expect(getChannels({ enabled: true })).resolves.toEqual({ data: { items: [], total: 0 } })
      expect(mockedClient.get).toHaveBeenCalledWith('/channels', { params: { enabled: true } })
    })

    it('getChannel 获取单个渠道', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { id: 1 } } as never)

      await expect(getChannel(1)).resolves.toEqual({ data: { id: 1 } })
      expect(mockedClient.get).toHaveBeenCalledWith('/channels/1')
    })

    it('createChannel 创建渠道', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 2 } } as never)

      await expect(createChannel({ channel_type: 'webhook', channel_name: '飞书' } as never)).resolves.toEqual({ data: { id: 2 } })
      expect(mockedClient.post).toHaveBeenCalledWith('/channels', { channel_type: 'webhook', channel_name: '飞书' })
    })

    it('updateChannel 更新渠道', async () => {
      mockedClient.put.mockResolvedValueOnce({ data: { id: 2 } } as never)

      await expect(updateChannel(2, { channel_name: '新版飞书' } as never)).resolves.toEqual({ data: { id: 2 } })
      expect(mockedClient.put).toHaveBeenCalledWith('/channels/2', { channel_name: '新版飞书' })
    })

    it('deleteChannel 删除渠道', async () => {
      mockedClient.delete.mockResolvedValueOnce(undefined as never)

      await expect(deleteChannel(2)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/channels/2')
    })

    it('toggleChannel 切换启用状态', async () => {
      mockedClient.put.mockResolvedValueOnce({ data: { id: 2, enabled: false } } as never)

      await expect(toggleChannel(2, false)).resolves.toEqual({ data: { id: 2, enabled: false } })
      expect(mockedClient.put).toHaveBeenCalledWith('/channels/2', { enabled: false })
    })
  })

  describe('datasources api', () => {
    it('getDataSources 获取分页列表', async () => {
      const response = { data: { items: [{ id: 1 }], total: 1 } }
      mockedClient.get.mockResolvedValueOnce(response as never)

      await expect(getDataSources({ source_type: 'postgresql' })).resolves.toEqual(response)
      expect(mockedClient.get).toHaveBeenCalledWith('/data-center/datasources', {
        params: { source_type: 'postgresql' },
      })
    })

    it('getDataSource 获取详情', async () => {
      const response = { data: { id: 7, name: 'dw' } }
      mockedClient.get.mockResolvedValueOnce(response as never)

      await expect(getDataSource(7)).resolves.toEqual(response)
      expect(mockedClient.get).toHaveBeenCalledWith('/data-center/datasources/7')
    })

    it('createDataSource 和 updateDataSource 透传 body', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 9 } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 9, name: '新版' } } as never)

      await expect(
        createDataSource({
          name: 'dw',
          source_type: 'postgresql',
          connection_config: { host: 'localhost', port: 5432 },
        }),
      ).resolves.toEqual({ data: { id: 9 } })
      expect(mockedClient.post).toHaveBeenCalledWith('/data-center/datasources', {
        name: 'dw',
        source_type: 'postgresql',
        connection_config: { host: 'localhost', port: 5432 },
      })

      await expect(updateDataSource(9, { name: '新版' })).resolves.toEqual({ data: { id: 9, name: '新版' } })
      expect(mockedClient.put).toHaveBeenCalledWith('/data-center/datasources/9', { name: '新版' })
    })

    it('deleteDataSource 删除数据源', async () => {
      mockedClient.delete.mockResolvedValueOnce(undefined as never)

      await expect(deleteDataSource(11)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/data-center/datasources/11')
    })

    it('testDataSourceConnection 与 syncDataSourceCatalog 返回业务数据', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { success: true, message: 'ok' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { job_id: 'job-1', status: 'queued' } } as never)

      await expect(testDataSourceConnection(4)).resolves.toEqual({ data: { success: true, message: 'ok' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/data-center/datasources/4/test')

      await expect(syncDataSourceCatalog(4)).resolves.toEqual({ job_id: 'job-1', status: 'queued' })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/data-center/datasources/4/sync-catalog')
    })

    it('获取统计、数据库、表、schema、表结构、预览和类型列表', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { total: 2, active: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: ['db1', 'db2'] } as never)
      mockedClient.get.mockResolvedValueOnce({ data: [{ table_name: 'answer records' }] } as never)
      mockedClient.get.mockResolvedValueOnce({ data: ['public'] } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { table_name: 'users', columns: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { columns: [], data: [], row_count: 0, table_name: 'answer records' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: [{ type: 'postgresql', display_name: 'PostgreSQL' }] } as never)

      await expect(getDataSourceStatistics()).resolves.toEqual({ data: { total: 2, active: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/data-center/datasources/statistics')

      await expect(getDataSourceDatabases(3)).resolves.toEqual({ data: ['db1', 'db2'] })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/data-center/datasources/3/databases')

      await expect(getDataSourceTables(3, 'dw')).resolves.toEqual({ data: [{ table_name: 'answer records' }] })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/data-center/datasources/3/tables', {
        params: { database: 'dw' },
      })

      await expect(getDataSourceSchemas(3, 'dw')).resolves.toEqual({ data: ['public'] })
      expect(mockedClient.get).toHaveBeenNthCalledWith(4, '/data-center/datasources/3/schemas', {
        params: { database: 'dw' },
      })

      await expect(getDataSourceTableSchema(3, 'dw', 'users', 'public')).resolves.toEqual({
        data: { table_name: 'users', columns: [] },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(5, '/data-center/datasources/3/table-schema', {
        params: { database: 'dw', table: 'users', schema: 'public' },
      })

      await expect(previewTableData(3, 'dw', 'answer records')).resolves.toEqual({
        data: { columns: [], data: [], row_count: 0, table_name: 'answer records' },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(
        6,
        '/data-center/datasources/3/tables/answer%20records/preview',
        { params: { database: 'dw' } },
      )

      await expect(getDataSourceTypes()).resolves.toEqual({
        data: [{ type: 'postgresql', display_name: 'PostgreSQL' }],
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(7, '/data-center/datasources/types')
    })
  })

  describe('datasets api', () => {
    it('获取列表、详情和字段', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 1, dataset_name: '成绩明细' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: [{ id: 2, field_name: 'score' }] } as never)

      await expect(getDatasets({ search: '成绩' })).resolves.toEqual({ data: { items: [{ id: 1 }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/data-center/datasets', { params: { search: '成绩' } })

      await expect(getDataset(1, false)).resolves.toEqual({ data: { id: 1, dataset_name: '成绩明细' } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/data-center/datasets/1', {
        params: { include_fields: false },
      })

      await expect(getDatasetFields(1)).resolves.toEqual({ data: [{ id: 2, field_name: 'score' }] })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/data-center/datasets/1/fields')
    })

    it('创建、更新、删除和同步数据集', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { id: 1 } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 1, dataset_name: '新版成绩明细' } } as never)
      mockedClient.delete.mockResolvedValueOnce(undefined as never)
      mockedClient.post.mockResolvedValueOnce({ data: { status: 'queued' } } as never)

      await expect(createDataset({ dataset_name: '成绩明细' })).resolves.toEqual({ data: { id: 1 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/data-center/datasets', { dataset_name: '成绩明细' })

      await expect(updateDataset(1, { dataset_name: '新版成绩明细' })).resolves.toEqual({
        data: { id: 1, dataset_name: '新版成绩明细' },
      })
      expect(mockedClient.put).toHaveBeenCalledWith('/data-center/datasets/1', { dataset_name: '新版成绩明细' })

      await expect(deleteDataset(1)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/data-center/datasets/1')

      await expect(syncDatasetSchema(1)).resolves.toEqual({ status: 'queued' })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/data-center/datasets/1/sync-schema')
    })

    it('获取统计和预览数据集', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { total: 3, synced: 2 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { fields: [], sample_rows: [] } } as never)

      await expect(getDatasetStatistics()).resolves.toEqual({ data: { total: 3, synced: 2 } })
      expect(mockedClient.get).toHaveBeenCalledWith('/data-center/datasets/statistics')

      await expect(previewDataset({ datasource_id: 2, database: 'dw', table: 'answers' })).resolves.toEqual({
        data: { fields: [], sample_rows: [] },
      })
      expect(mockedClient.post).toHaveBeenCalledWith('/data-center/datasets/preview', {
        datasource_id: 2,
        database: 'dw',
        table: 'answers',
      })
    })
  })

  describe('extraction api', () => {
    it('任务相关包装层透传请求', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 2, task_name: '日报抽取' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 3 } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 2, task_name: '新版日报抽取' } } as never)
      mockedClient.delete.mockResolvedValueOnce(undefined as never)
      mockedClient.post.mockResolvedValueOnce({ data: { run_id: 8, status: 'queued' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 8 }], total: 1 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { sql: 'select 1', data: [], total: 0 } } as never)

      await expect(getTasks({ dataset_id: 2 })).resolves.toEqual({ data: { items: [{ id: 1 }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/extraction/tasks', { params: { dataset_id: 2 } })

      await expect(getTask(2)).resolves.toEqual({ data: { id: 2, task_name: '日报抽取' } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/extraction/tasks/2')

      await expect(createTask({ task_name: '日报抽取' } as never)).resolves.toEqual({ data: { id: 3 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/extraction/tasks', { task_name: '日报抽取' })

      await expect(updateTask(2, { task_name: '新版日报抽取' } as never)).resolves.toEqual({
        data: { id: 2, task_name: '新版日报抽取' },
      })
      expect(mockedClient.put).toHaveBeenCalledWith('/extraction/tasks/2', { task_name: '新版日报抽取' })

      await expect(deleteTask(2)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/extraction/tasks/2')

      await expect(executeTask(2, { limit: 100 } as never)).resolves.toEqual({ data: { run_id: 8, status: 'queued' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/extraction/tasks/2/execute', { limit: 100 })

      await expect(getRuns({ status: 'success' })).resolves.toEqual({ data: { items: [{ id: 8 }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/extraction/runs', { params: { status: 'success' } })

      await expect(
        previewData({ dataset_id: 2, select_fields: ['id'], filter_conditions: {}, limit: 10 }),
      ).resolves.toEqual({ data: { sql: 'select 1', data: [], total: 0 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/extraction/preview', {
        dataset_id: 2,
        select_fields: ['id'],
        filter_conditions: {},
        limit: 10,
      })
    })

    it('downloadRun 会写入下载地址', () => {
      const location = { href: '' }
      vi.stubGlobal('window', { location } as never)

      downloadRun(42)

      expect(location.href).toBe('/api/v1/extraction/runs/42/download')
    })
  })

  describe('files api', () => {
    it('uploadTabularFile 使用 FormData 和 multipart 头', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { file_id: 'file-1' } } as never)
      const file = new File(['id,name\n1,Alice'], 'demo.csv', { type: 'text/csv' })

      await expect(uploadTabularFile(file)).resolves.toEqual({ file_id: 'file-1' })

      const [url, formData, config] = mockedClient.post.mock.calls[0]!
      expect(url).toBe('/files/upload')
      expect(formData).toBeInstanceOf(FormData)
      expect((formData as FormData).get('file')).toBe(file)
      expect(config).toEqual({
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    })

    it('uploadCSVFile 复用 uploadTabularFile', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { file_id: 'file-2' } } as never)

      await expect(uploadCSVFile(new File(['a'], 'demo.csv'))).resolves.toEqual({ file_id: 'file-2' })
    })
  })

  describe('schema api', () => {
    it('getSchemas 和 getTableSchema 透传 params', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: ['public'] } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { table_name: 'users', columns: [] } } as never)

      await expect(getSchemas(3, 'dw')).resolves.toEqual({ data: ['public'] })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/data-center/datasources/3/schemas', {
        params: { database: 'dw' },
      })

      await expect(getTableSchema(3, 'dw', 'users')).resolves.toEqual({ data: { table_name: 'users', columns: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/data-center/datasources/3/table-schema', {
        params: { database: 'dw', table: 'users' },
      })
    })
  })

  describe('subscriptions api', () => {
    it('订阅包装层透传请求', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 1 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 2 } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 2, enabled: true } } as never)
      mockedClient.delete.mockResolvedValueOnce(undefined as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 2, enabled: false } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 3 }], total: 1 } } as never)

      await expect(getSubscriptions({ enabled: true })).resolves.toEqual({ data: { items: [{ id: 1 }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/subscriptions', { params: { enabled: true } })

      await expect(getSubscription(1)).resolves.toEqual({ data: { id: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/subscriptions/1')

      await expect(createSubscription({ channel_id: 1 } as never)).resolves.toEqual({ data: { id: 2 } })
      expect(mockedClient.post).toHaveBeenCalledWith('/subscriptions', { channel_id: 1 })

      await expect(updateSubscription(2, { cron: '0 0 * * *' } as never)).resolves.toEqual({
        data: { id: 2, enabled: true },
      })
      expect(mockedClient.put).toHaveBeenNthCalledWith(1, '/subscriptions/2', { cron: '0 0 * * *' })

      await expect(deleteSubscription(2)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/subscriptions/2')

      await expect(toggleSubscription(2, false)).resolves.toEqual({ data: { id: 2, enabled: false } })
      expect(mockedClient.put).toHaveBeenNthCalledWith(2, '/subscriptions/2', { enabled: false })

      await expect(getSubscriptionsByAppInstance(9)).resolves.toEqual({ data: { items: [{ id: 3 }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/app-instances/9/subscriptions')
    })
  })

  describe('app center api', () => {
    it('应用与配置相关接口返回 response.data', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: [{ code: 'daily-report' }] } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { code: 'daily-report', name: '日报' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { properties: {} } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: [{ category: 'ops' }] } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { is_valid: true, errors: [] } } as never)

      await expect(getApps({ category: 'ops' })).resolves.toEqual([{ code: 'daily-report' }])
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/apps', { params: { category: 'ops' } })

      await expect(getApp('daily-report')).resolves.toEqual({ code: 'daily-report', name: '日报' })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/apps/daily-report')

      await expect(getConfigSchema('daily-report')).resolves.toEqual({ properties: {} })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/apps/daily-report/config-schema')

      await expect(getCategories()).resolves.toEqual([{ category: 'ops' }])
      expect(mockedClient.get).toHaveBeenNthCalledWith(4, '/apps/categories')

      await expect(validateConfig('daily-report', { cron: '0 0 * * *' })).resolves.toEqual({
        is_valid: true,
        errors: [],
      })
      expect(mockedClient.post).toHaveBeenCalledWith('/apps/daily-report/validate', {
        config: { cron: '0 0 * * *' },
      })
    })

    it('实例相关接口返回 response.data', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 1, page: 1, page_size: 20, pages: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 1, name: '日报任务' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 2, name: '日报任务' } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 2, name: '新版日报任务' } } as never)
      mockedClient.delete.mockResolvedValueOnce(undefined as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 2, enabled: true } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 2, enabled: false } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { execution_id: 99 } } as never)

      await expect(getInstances({ owner: 'alice' })).resolves.toEqual({
        items: [{ id: 1 }],
        total: 1,
        page: 1,
        page_size: 20,
        pages: 1,
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/app-instances', { params: { owner: 'alice' } })

      await expect(getInstance(1)).resolves.toEqual({ id: 1, name: '日报任务' })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/app-instances/1')

      await expect(createInstance({
        app_code: 'daily-report',
        name: '日报任务',
        config: {},
        schedule_type: 'manual',
      })).resolves.toEqual({ id: 2, name: '日报任务' })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/app-instances', {
        app_code: 'daily-report',
        name: '日报任务',
        config: {},
        schedule_type: 'manual',
      })

      await expect(updateInstance(2, { name: '新版日报任务' })).resolves.toEqual({ id: 2, name: '新版日报任务' })
      expect(mockedClient.put).toHaveBeenCalledWith('/app-instances/2', { name: '新版日报任务' })

      await expect(deleteInstance(2)).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/app-instances/2')

      await expect(enableInstance(2)).resolves.toEqual({ id: 2, enabled: true })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/app-instances/2/enable')

      await expect(disableInstance(2)).resolves.toEqual({ id: 2, enabled: false })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/app-instances/2/disable')

      await expect(executeInstance(2)).resolves.toEqual({ execution_id: 99 })
      expect(mockedClient.post).toHaveBeenNthCalledWith(4, '/app-instances/2/execute')
    })

    it('执行记录相关接口返回 response.data', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ id: 3 }], total: 1, page: 1, page_size: 20, pages: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 3, status: 'success' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { total_executions: 3, success_rate: 100 } } as never)

      await expect(getExecutions({ instance_id: 2 })).resolves.toEqual({
        items: [{ id: 3 }],
        total: 1,
        page: 1,
        page_size: 20,
        pages: 1,
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/app-executions', { params: { instance_id: 2 } })

      await expect(getExecution(3)).resolves.toEqual({ id: 3, status: 'success' })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/app-executions/3')

      await expect(getExecutionStats({ days: 7 })).resolves.toEqual({ total_executions: 3, success_rate: 100 })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/app-executions/stats', { params: { days: 7 } })
    })
  })

  describe('sqllab api', () => {
    it('执行、提交、查询状态、查询结果和校验 SQL', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { columns: ['id'] } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { query_id: 7, status: 'pending' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 7, status: 'running' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 7, status: 'completed', result: { columns: ['id'], data: [[1]], row_count: 1, execution_time_ms: 10 } } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { valid: true, errors: [] } } as never)

      await expect(executeSQL({ source_id: 1, sql_query: 'select 1' })).resolves.toEqual({ data: { columns: ['id'] } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/sql_lab/execute', { source_id: 1, sql_query: 'select 1' })

      await expect(submitAsyncQuery({ source_id: 1, sql_query: 'select 1' })).resolves.toEqual({ query_id: 7, status: 'pending' })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/sql_lab/execute', {
        source_id: 1,
        sql_query: 'select 1',
        async: true,
      })

      await expect(getQueryStatus(7)).resolves.toEqual({ id: 7, status: 'running' })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/sql_lab/query/7/status')

      await expect(getQueryResult(7)).resolves.toEqual({
        id: 7,
        status: 'completed',
        result: { columns: ['id'], data: [[1]], row_count: 1, execution_time_ms: 10 },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/sql_lab/query/7/result')

      await expect(validateSQL({ sql_query: 'select 1' })).resolves.toEqual({ valid: true, errors: [] })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/sql_lab/validate', { sql_query: 'select 1' })
    })

    it('pollQueryUntilComplete 轮询直到完成并回调状态', async () => {
      vi.useFakeTimers()
      mockedClient.get.mockResolvedValueOnce({ data: { id: 7, status: 'pending', execution_time_ms: null, row_count: null, error_message: null } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 7, status: 'completed', execution_time_ms: 10, row_count: 1, error_message: null } } as never)
      mockedClient.get.mockResolvedValueOnce({
        data: {
          id: 7,
          status: 'completed',
          source_id: 1,
          created_at: '2026-03-26',
          started_at: '2026-03-26',
          completed_at: '2026-03-26',
          execution_time_ms: 10,
          row_count: 1,
          error_message: null,
          result: { columns: ['id'], data: [[1]], row_count: 1, execution_time_ms: 10 },
        },
      } as never)
      const onStatusChange = vi.fn()

      const promise = pollQueryUntilComplete(7, onStatusChange, 10, 3)
      await vi.runAllTimersAsync()

      await expect(promise).resolves.toMatchObject({
        id: 7,
        status: 'completed',
        result: { columns: ['id'], data: [[1]], row_count: 1, execution_time_ms: 10 },
      })
      expect(onStatusChange).toHaveBeenCalledTimes(2)
    })

    it('pollQueryUntilComplete 超时会抛出错误', async () => {
      vi.useFakeTimers()
      mockedClient.get.mockResolvedValueOnce({
        data: { id: 8, status: 'pending', execution_time_ms: null, row_count: null, error_message: null },
      } as never)

      const promise = pollQueryUntilComplete(8, undefined, 10, 1)
      const assertion = expect(promise).rejects.toThrow('查询超时，请稍后重试')
      await vi.runAllTimersAsync()

      await assertion
    })

    it('executeSQLSmart 支持同步和异步成功路径', async () => {
      mockedClient.post.mockResolvedValueOnce({ data: { columns: ['id'], data: [[1]], row_count: 1, execution_time_ms: 3 } } as never)

      await expect(executeSQLSmart({ source_id: 1, sql_query: 'select 1' }, false)).resolves.toEqual({
        columns: ['id'],
        data: [[1]],
        row_count: 1,
        execution_time_ms: 3,
      })

      vi.useFakeTimers()
      mockedClient.post.mockResolvedValueOnce({ data: { query_id: 9, status: 'pending' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 9, status: 'completed', execution_time_ms: 9, row_count: 2, error_message: null } } as never)
      mockedClient.get.mockResolvedValueOnce({
        data: {
          id: 9,
          status: 'completed',
          source_id: 1,
          created_at: '2026-03-26',
          started_at: '2026-03-26',
          completed_at: '2026-03-26',
          execution_time_ms: 9,
          row_count: 2,
          error_message: null,
          result: { columns: ['name'], data: [['alice']], row_count: 1, execution_time_ms: 9 },
        },
      } as never)

      const promise = executeSQLSmart({ source_id: 1, sql_query: 'select name from users' }, true)
      await vi.runAllTimersAsync()

      await expect(promise).resolves.toEqual({
        columns: ['name'],
        data: [['alice']],
        row_count: 1,
        execution_time_ms: 9,
      })
    })

    it('executeSQLSmart 在异步失败时抛出错误', async () => {
      vi.useFakeTimers()
      mockedClient.post.mockResolvedValueOnce({ data: { query_id: 10, status: 'pending' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 10, status: 'failed', execution_time_ms: 5, row_count: 0, error_message: 'boom' } } as never)
      mockedClient.get.mockResolvedValueOnce({
        data: {
          id: 10,
          status: 'failed',
          source_id: 1,
          created_at: '2026-03-26',
          started_at: '2026-03-26',
          completed_at: '2026-03-26',
          execution_time_ms: 5,
          row_count: 0,
          error_message: 'boom',
        },
      } as never)

      const promise = executeSQLSmart({ source_id: 1, sql_query: 'select broken' }, true)
      const assertion = expect(promise).rejects.toThrow('boom')
      await vi.runAllTimersAsync()

      await assertion
    })
  })

  describe('semantic api', () => {
    it('cube 相关接口透传请求', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { cubes: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { name: 'answer_records' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'draft_cube' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'answer_records' } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { name: 'answer_records', title: '新版标题' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'answer_records', status: 'active' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'answer_records', status: 'deprecated' } } as never)

      await expect(listCubes({ q: 'answer' })).resolves.toEqual({ data: { cubes: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/semantic/cubes', { params: { q: 'answer' } })

      await expect(describeCube('answer_records')).resolves.toEqual({ data: { name: 'answer_records' } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/semantic/cubes/answer_records')

      await expect(
        createCubeDraftFromSource({
          source_kind: 'physical_table',
          source_id: 1,
          database: 'dw',
          table: 'answer_records',
        }),
      ).resolves.toEqual({ data: { name: 'draft_cube' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/semantic/cubes/draft-from-source', {
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        table: 'answer_records',
      })

      await expect(createCube({ name: 'answer_records' } as never)).resolves.toEqual({ data: { name: 'answer_records' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/semantic/cubes', { name: 'answer_records' })

      await expect(updateCube('answer_records', { title: '新版标题' })).resolves.toEqual({
        data: { name: 'answer_records', title: '新版标题' },
      })
      expect(mockedClient.put).toHaveBeenCalledWith('/semantic/cubes/answer_records', { title: '新版标题' })

      await expect(activateCube('answer_records')).resolves.toEqual({ data: { name: 'answer_records', status: 'active' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/semantic/cubes/answer_records/activate')

      await expect(deprecateCube('answer_records')).resolves.toEqual({
        data: { name: 'answer_records', status: 'deprecated' },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(4, '/semantic/cubes/answer_records/deprecate')
    })

    it('view、recipe、compile 和 query 相关接口透传请求', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { views: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { name: 'student_view' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { dataset_id: 3 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { dataset_id: 3 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { materialized: true } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { student_view: { materialized: true } } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { recipes: [], total: 0 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { sql: 'select 1' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { columns: ['id'], data: [[1]] } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { columns: ['id'], data: [[1]] } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { drift_count: 0 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { drift_count: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { nodes: [], edges: [] } } as never)

      await expect(listViews({ include_private: true })).resolves.toEqual({ data: { views: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/semantic/views', { params: { include_private: true } })

      await expect(describeView('student_view')).resolves.toEqual({ data: { name: 'student_view' } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/semantic/views/student_view')

      await expect(materializeView('student_view')).resolves.toEqual({ data: { dataset_id: 3 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/semantic/views/student_view/materialize', {})

      await expect(materializeView('student_view', 9)).resolves.toEqual({ data: { dataset_id: 3 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/semantic/views/student_view/materialize', { source_id: 9 })

      await expect(getMaterializeStatus('student_view')).resolves.toEqual({ data: { materialized: true } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/semantic/views/student_view/materialize-status')

      await expect(getBatchMaterializeStatus()).resolves.toEqual({ data: { student_view: { materialized: true } } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(4, '/semantic/views/materialize-status')

      await expect(listRecipes()).resolves.toEqual({ data: { recipes: [], total: 0 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(5, '/semantic/recipes')

      await expect(compileDsl({ measures: ['count'] })).resolves.toEqual({ data: { sql: 'select 1' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/semantic/compile', { dsl: { measures: ['count'] } })

      await expect(querySemantic({ measures: ['count'] })).resolves.toEqual({ data: { columns: ['id'], data: [[1]] } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(4, '/semantic/query', { dsl: { measures: ['count'] } })

      await expect(querySemanticInDomain({ measures: ['count'] }, 'learning')).resolves.toEqual({
        data: { columns: ['id'], data: [[1]] },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(5, '/semantic/query', {
        dsl: { measures: ['count'], domain_code: 'learning' },
      })

      await expect(runSchemaSync()).resolves.toEqual({ data: { drift_count: 0 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(6, '/semantic/schema-sync', {})

      await expect(runSchemaSync('answer_records')).resolves.toEqual({ data: { drift_count: 1 } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(7, '/semantic/schema-sync', { cube_name: 'answer_records' })

      await expect(getGraph()).resolves.toEqual({ data: { nodes: [], edges: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(6, '/semantic/graph')
    })

    it('catalog、domain 和 canvas 相关接口透传请求', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { domains: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { catalogs: [], total: 0 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { code: 'learning', name: '学习域' } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { code: 'learning', status: 'archived' } } as never)
      mockedClient.delete.mockResolvedValueOnce(undefined as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 'domain-1', name: '学习域' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { id: 'domain-1', name: '学习域' } } as never)
      mockedClient.put.mockResolvedValueOnce({ data: { id: 'domain-1', name: '新版学习域' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { domain: { id: 'domain-1' }, cubes: [], joins: [] } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 'domain-1', cubes: ['answer_records'] } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 'domain-1', joins: [{ name: 'join_1' }] } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { id: 'domain-1', status: 'active' } } as never)

      await expect(listDomains({ catalog_code: 'learning' })).resolves.toEqual({ data: { domains: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/semantic/domains', { params: { catalog_code: 'learning' } })

      await expect(listDomainCatalogs()).resolves.toEqual({ data: { catalogs: [], total: 0 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/semantic/catalogs')

      await expect(createCatalog({ name: '学习域' })).resolves.toEqual({ data: { code: 'learning', name: '学习域' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/semantic/catalogs', { name: '学习域' })

      await expect(updateCatalog('learning', { status: 'archived' })).resolves.toEqual({
        data: { code: 'learning', status: 'archived' },
      })
      expect(mockedClient.put).toHaveBeenCalledWith('/semantic/catalogs/learning', { status: 'archived' })

      await expect(deleteCatalog('learning')).resolves.toBeUndefined()
      expect(mockedClient.delete).toHaveBeenCalledWith('/semantic/catalogs/learning')

      await expect(createDomain({ name: '学习域', catalog_code: 'learning' })).resolves.toEqual({
        data: { id: 'domain-1', name: '学习域' },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/semantic/domains', {
        name: '学习域',
        catalog_code: 'learning',
      })

      await expect(describeDomain('domain-1')).resolves.toEqual({ data: { id: 'domain-1', name: '学习域' } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/semantic/domains/domain-1')

      await expect(updateDomain('domain-1', { name: '新版学习域' } as never)).resolves.toEqual({
        data: { id: 'domain-1', name: '新版学习域' },
      })
      expect(mockedClient.put).toHaveBeenNthCalledWith(2, '/semantic/domains/domain-1', { name: '新版学习域' })

      await expect(getDomainCanvas('domain-1')).resolves.toEqual({
        data: { domain: { id: 'domain-1' }, cubes: [], joins: [] },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(4, '/semantic/domains/domain-1/canvas')

      await expect(addCubeToDomain('domain-1', 'answer_records')).resolves.toEqual({
        data: { id: 'domain-1', cubes: ['answer_records'] },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/semantic/domains/domain-1/cubes', {
        cube_name: 'answer_records',
      })

      const joinPayload = {
        name: 'join_1',
        source_cube: 'answer_records',
        target_cube: 'student_profile',
        source_field: 'student_id',
        target_field: 'id',
        join_type: 'left' as const,
        cardinality: 'N:1' as const,
        aggregation_strategy: 'none' as const,
      }
      await expect(addJoinToDomain('domain-1', joinPayload)).resolves.toEqual({
        data: { id: 'domain-1', joins: [{ name: 'join_1' }] },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(4, '/semantic/domains/domain-1/joins', joinPayload)

      await expect(
        publishDomain('domain-1', { cubes: ['answer_records'], joins: [joinPayload] }),
      ).resolves.toEqual({ data: { id: 'domain-1', status: 'active' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(5, '/semantic/domains/domain-1/publish', {
        cubes: ['answer_records'],
        joins: [joinPayload],
      })
    })
  })

  describe('ontology api', () => {
    it('Ontology 与编译预览接口透传请求', async () => {
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ name: 'order', title: '订单' }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ name: 'gmv', title: 'GMV' }], total: 1 } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'gmv', title: 'GMV' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { metric_name: 'gmv', linked_measures: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ name: 'order_submit_order', title: '客户下单' }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { name: 'order_submit_order', title: '客户下单' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'order_submit_order', title: '客户下单' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { items: [{ name: 'pay', title: '支付' }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { name: 'pay', title: '支付' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { name: 'pay', title: '支付' } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { summary: { issue_count: 0 }, items: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { cube_name: 'orders', linked_objects: [], linked_metrics: [] } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { target_type: 'metric', target_name: 'gmv', linked_entity_count: 2 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { entity_type: 'metrics', entity_name: 'gmv', items: [{ id: 'evt-1', action: 'saved' }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { policy_name: 'gmv_policy', items: [{ id: 'audit-1', decision: 'allow' }], total: 1 } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { name: 'order-domain', title: '订单域模板', summary: { objects: 2 } } } as never)
      mockedClient.get.mockResolvedValueOnce({ data: { entity_type: 'metrics', entity_name: 'gmv', projection: { targets: [] }, consistency: { status: 'ok', issues: [] } } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { status: 'ready', pseudo_sql: 'SELECT 1' } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { entity: { name: 'gmv', status: 'active' }, validation: { preview_status: 'ok', issues: [] } } } as never)
      mockedClient.post.mockResolvedValueOnce({ data: { template: 'order-domain', summary: { created: 10, skipped: 0 } } } as never)

      await expect(listBusinessObjects()).resolves.toEqual({ data: { items: [{ name: 'order', title: '订单' }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(1, '/ontology/objects')

      await expect(listBusinessMetrics()).resolves.toEqual({ data: { items: [{ name: 'gmv', title: 'GMV' }], total: 1 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(2, '/ontology/metrics')

      await expect(saveBusinessMetric({ name: 'gmv', title: 'GMV' })).resolves.toEqual({ data: { name: 'gmv', title: 'GMV' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(1, '/ontology/metrics', { name: 'gmv', title: 'GMV' })

      await expect(getBusinessMetricLinks('gmv')).resolves.toEqual({ data: { metric_name: 'gmv', linked_measures: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(3, '/ontology/metrics/gmv/links')

      await expect(listBusinessRelations()).resolves.toEqual({
        data: { items: [{ name: 'order_submit_order', title: '客户下单' }], total: 1 },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(4, '/ontology/relations')

      await expect(getBusinessRelation('order_submit_order')).resolves.toEqual({
        data: { name: 'order_submit_order', title: '客户下单' },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(5, '/ontology/relations/order_submit_order')

      await expect(saveBusinessRelation({ name: 'order_submit_order', title: '客户下单' })).resolves.toEqual({
        data: { name: 'order_submit_order', title: '客户下单' },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(2, '/ontology/relations', {
        name: 'order_submit_order',
        title: '客户下单',
      })

      await expect(listBusinessActions()).resolves.toEqual({
        data: { items: [{ name: 'pay', title: '支付' }], total: 1 },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(6, '/ontology/actions')

      await expect(getBusinessAction('pay')).resolves.toEqual({ data: { name: 'pay', title: '支付' } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(7, '/ontology/actions/pay')

      await expect(saveBusinessAction({ name: 'pay', title: '支付' })).resolves.toEqual({
        data: { name: 'pay', title: '支付' },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(3, '/ontology/actions', {
        name: 'pay',
        title: '支付',
      })

      await expect(getSemanticConsistencyReport()).resolves.toEqual({ data: { summary: { issue_count: 0 }, items: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(8, '/semantic-mapper/consistency-report')

      await expect(getCubeBacklinks('orders')).resolves.toEqual({ data: { cube_name: 'orders', linked_objects: [], linked_metrics: [] } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(9, '/semantic-mapper/cube-backlinks', {
        params: { cube_name: 'orders' },
      })

      await expect(getPolicyImpact('gmv_policy')).resolves.toEqual({ data: { target_type: 'metric', target_name: 'gmv', linked_entity_count: 2 } })
      expect(mockedClient.get).toHaveBeenNthCalledWith(10, '/ontology/policies/gmv_policy/impact')

      await expect(getOntologyEntityHistory('metrics', 'gmv')).resolves.toEqual({
        data: { entity_type: 'metrics', entity_name: 'gmv', items: [{ id: 'evt-1', action: 'saved' }], total: 1 },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(11, '/ontology/metrics/gmv/history')

      await expect(getPolicyAudit('gmv_policy', { decision: 'allow', route_type: 'direct' })).resolves.toEqual({
        data: { policy_name: 'gmv_policy', items: [{ id: 'audit-1', decision: 'allow' }], total: 1 },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(12, '/ontology/policies/gmv_policy/audit', {
        params: {
          target_type: undefined,
          target_name: undefined,
          decision: 'allow',
          route_type: 'direct',
        },
      })

      await expect(getOntologyTemplate('order-domain')).resolves.toEqual({
        data: { name: 'order-domain', title: '订单域模板', summary: { objects: 2 } },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(13, '/ontology/templates/order-domain')

      await expect(getOntologyEntityImpact('metrics', 'gmv')).resolves.toEqual({
        data: { entity_type: 'metrics', entity_name: 'gmv', projection: { targets: [] }, consistency: { status: 'ok', issues: [] } },
      })
      expect(mockedClient.get).toHaveBeenNthCalledWith(14, '/ontology/metrics/gmv/impact')

      await expect(getExecutionCompilePreview('gmv', ['finance'])).resolves.toEqual({ data: { status: 'ready', pseudo_sql: 'SELECT 1' } })
      expect(mockedClient.post).toHaveBeenNthCalledWith(4, '/execution-compiler/compile-preview', {
        metric_name: 'gmv',
        viewer_roles: ['finance'],
      })

      await expect(publishOntologyEntity('metrics', 'gmv')).resolves.toEqual({
        data: { entity: { name: 'gmv', status: 'active' }, validation: { preview_status: 'ok', issues: [] } },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(5, '/ontology/metrics/gmv/publish', {})

      await expect(applyOntologyTemplate('order-domain')).resolves.toEqual({
        data: { template: 'order-domain', summary: { created: 10, skipped: 0 } },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(6, '/ontology/templates/order-domain/apply', {})

      mockedClient.post.mockResolvedValueOnce({
        data: {
          metric_name: 'gmv',
          target_type: 'sql',
          steps: [{ step_type: 'compile_sql', title: 'SQL 预览', status: 'ready' }],
        },
      } as never)
      await expect(getExecutionPlanPreview('gmv')).resolves.toEqual({
        data: {
          metric_name: 'gmv',
          target_type: 'sql',
          steps: [{ step_type: 'compile_sql', title: 'SQL 预览', status: 'ready' }],
        },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(7, '/execution-compiler/plan-preview', {
        metric_name: 'gmv',
      })

      mockedClient.post.mockResolvedValueOnce({
        data: {
          status: 'executed',
          target_type: 'sql',
          governance_trace: { status: 'allow', execution_status: 'executed' },
        },
      } as never)
      await expect(getExecutionExecute('gmv', ['finance'])).resolves.toEqual({
        data: {
          status: 'executed',
          target_type: 'sql',
          governance_trace: { status: 'allow', execution_status: 'executed' },
        },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(8, '/execution-compiler/execute', {
        metric_name: 'gmv',
        viewer_roles: ['finance'],
      })

      mockedClient.post.mockResolvedValueOnce({ data: { route_type: 'cube', targets: ['cube'] } } as never)
      await expect(getSemanticRoutePreview('查看 GMV', ['finance'])).resolves.toEqual({
        data: { route_type: 'cube', targets: ['cube'] },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(9, '/semantic-router/route', {
        question: '查看 GMV',
        viewer_roles: ['finance'],
      })

      mockedClient.post.mockResolvedValueOnce({ data: { route: { route_type: 'hybrid' }, steps: [] } } as never)
      await expect(getSemanticPlanPreview('解释 GMV 口径并查看趋势', ['finance'])).resolves.toEqual({
        data: { route: { route_type: 'hybrid' }, steps: [] },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(10, '/semantic-router/plan', {
        question: '解释 GMV 口径并查看趋势',
        viewer_roles: ['finance'],
      })

      mockedClient.post.mockResolvedValueOnce({
        data: {
          execution_targets: [{ target_type: 'sql', target_name: 'orders.gmv' }],
        },
      } as never)
      await expect(getSemanticExecutePlanPreview('解释 GMV 口径并查看趋势', ['finance'])).resolves.toEqual({
        data: {
          execution_targets: [{ target_type: 'sql', target_name: 'orders.gmv' }],
        },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(11, '/semantic-router/execute-plan-preview', {
        question: '解释 GMV 口径并查看趋势',
        viewer_roles: ['finance'],
      })

      mockedClient.post.mockResolvedValueOnce({
        data: {
          execution_results: [{ status: 'executed', target_type: 'sql' }],
        },
      } as never)
      await expect(getSemanticExecutePlan('解释 GMV 口径并查看趋势', ['finance'])).resolves.toEqual({
        data: {
          execution_results: [{ status: 'executed', target_type: 'sql' }],
        },
      })
      expect(mockedClient.post).toHaveBeenNthCalledWith(12, '/semantic-router/execute-plan', {
        question: '解释 GMV 口径并查看趋势',
        viewer_roles: ['finance'],
      })
    })
  })
})
