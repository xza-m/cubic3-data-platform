import { expect, test, type Page } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage } from './helpers'

function ok<T>(data: T) {
  return {
    code: 0,
    message: 'ok',
    data,
  }
}

const WORKBENCH_CUBES_FIXTURE = {
  cubes: [
    {
      name: 'fixture_cube_draft',
      title: 'Playwright 订单分析',
      description: '视觉基线固定夹具',
      table: 'orders',
      domain_ids: ['sales'],
      domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 2,
      measure_count: 1,
      status: 'draft',
      source_id: 1,
      source_database: 'dw',
      source_schema: 'public',
      state_summary: {
        sync_status: 'warn',
      },
    },
  ],
  total: 1,
}

const WORKBENCH_CUBE_DETAIL_FIXTURE = {
  name: 'fixture_cube_draft',
  title: 'Playwright 订单分析',
  description: '视觉基线固定夹具',
  table: 'orders',
  domain_id: 'sales',
  domain_name: '销售域',
  domain_ids: ['sales'],
  domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
  domain_count: 1,
  status: 'draft',
  source_id: 1,
  source_database: 'dw',
  source_schema: 'public',
  source_binding_summary: {
    source_id: 1,
    source_name: '学习行为仓',
    database: 'dw',
    schema: 'public',
    display: '学习行为仓 / dw.public',
  },
  dimensions: {
    customer_id: {
      title: '客户',
      type: 'string',
      description: '客户唯一标识',
      source_data_type: 'varchar',
      sql: 'source.customer_id',
    },
    created_at: {
      title: '下单时间',
      type: 'time',
      description: '订单创建时间',
      source_data_type: 'timestamp',
      sql: 'source.created_at',
    },
  },
  measures: {
    total_amount: {
      title: '总金额',
      type: 'sum',
      description: '订单总金额',
      source_data_type: 'decimal(18,2)',
      format: 'currency',
      sql: 'SUM(source.total_amount)',
    },
  },
  segments: {},
  joins: {
    users: {
      target_cube: 'users_cube',
      type: 'left',
      relationship: 'N:1',
      sql: 'source.user_id = users_cube.id',
    },
  },
  default_filters: [
    {
      sql: "source.order_status <> 'cancelled'",
      description: '排除取消订单',
    },
  ],
  grain: 'customer_id',
  entity_key: 'customer_id',
  state_summary: {
    status: 'draft',
  },
}

const WORKBENCH_DATASOURCES_FIXTURE = {
  items: [
    {
      id: 1,
      name: '学习行为仓',
      source_type: 'postgres',
      connection_config: {},
      is_active: true,
      connection_status: 'connected',
      created_at: '2026-04-08T00:00:00Z',
      updated_at: '2026-04-08T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  page_size: 200,
  total_pages: 1,
}

const WORKBENCH_DATASETS_FIXTURE = {
  items: [
    {
      id: 11,
      dataset_code: 'orders_dataset',
      dataset_name: '订单宽表',
      dataset_type: 'physical',
      source_id: 1,
      physical_table: 'dw.public.orders',
      sync_status: 'synced',
      field_count: 3,
      created_at: '2026-04-08T00:00:00Z',
      updated_at: '2026-04-08T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  page_size: 200,
  total_pages: 1,
}

const WORKBENCH_PREVIEW_FIXTURE = {
  preview_limit: 20,
  table_info: {
    database: 'dw',
    table: 'orders',
    comment: '订单事实表',
    row_count: 1024,
    size: 4096,
  },
  fields: [
    {
      field_name: 'customer_id',
      physical_name: 'customer_id',
      data_type: 'varchar',
      business_type: 'dimension',
      sensitivity_level: 'public',
      confidence_score: 0.98,
      matched_rules: [],
      display_name: '客户',
      comment: '客户唯一标识',
      is_partition: false,
      is_measure: false,
      is_sensitive: false,
    },
    {
      field_name: 'created_at',
      physical_name: 'created_at',
      data_type: 'timestamp',
      business_type: 'dimension',
      sensitivity_level: 'public',
      confidence_score: 0.94,
      matched_rules: [],
      display_name: '下单时间',
      comment: '订单创建时间',
      is_partition: false,
      is_measure: false,
      is_sensitive: false,
    },
    {
      field_name: 'total_amount',
      physical_name: 'total_amount',
      data_type: 'decimal(18,2)',
      business_type: 'metric',
      sensitivity_level: 'public',
      confidence_score: 0.99,
      matched_rules: [],
      display_name: '总金额',
      comment: '订单总金额',
      is_partition: false,
      is_measure: true,
      is_sensitive: false,
    },
  ],
  sample_rows: [],
  sample_columns: ['customer_id', 'created_at', 'total_amount'],
  statistics: {
    total_fields: 3,
    partition_fields: 0,
    measure_fields: 1,
    sensitive_fields: 0,
  },
}

const DOMAIN_VISUAL_CATALOGS_FIXTURE = {
  catalogs: [
    {
      code: 'learning',
      name: '学习分析',
      description: '学习行为与答题效果语义资产',
      status: 'active',
      sort_order: 10,
      domain_count: 1,
      active_count: 1,
      draft_count: 0,
      domains: [
        {
          id: 'academic',
          code: 'academic',
          name: '学业分析域',
          catalog_code: 'learning',
          catalog_name: '学习分析',
          description: '覆盖学习过程、答题记录与知识点掌握分析。',
          status: 'active',
          cube_count: 4,
          join_count: 3,
        },
      ],
    },
    {
      code: 'growth',
      name: '成长分析',
      description: '学习成长与学校画像语义资产',
      status: 'active',
      sort_order: 20,
      domain_count: 1,
      active_count: 0,
      draft_count: 1,
      domains: [
        {
          id: 'growth',
          code: 'growth',
          name: '成长观察域',
          catalog_code: 'growth',
          catalog_name: '成长分析',
          description: '聚焦学生成长与校级对比。',
          status: 'draft',
          cube_count: 2,
          join_count: 1,
        },
      ],
    },
  ],
  total: 2,
}

const DOMAIN_VISUAL_DOMAINS_FIXTURE = {
  domains: [
    {
      id: 'academic',
      code: 'academic',
      name: '学业分析域',
      catalog_code: 'learning',
      catalog_name: '学习分析',
      description: '覆盖学习过程、答题记录与知识点掌握分析。',
      status: 'active',
      cube_count: 4,
      join_count: 3,
    },
    {
      id: 'growth',
      code: 'growth',
      name: '成长观察域',
      catalog_code: 'growth',
      catalog_name: '成长分析',
      description: '聚焦学生成长与校级对比。',
      status: 'draft',
      cube_count: 2,
      join_count: 1,
    },
  ],
  total: 2,
  page: 1,
  page_size: 999,
  page_count: 1,
}

const DOMAIN_VISUAL_CANVAS_FIXTURE = {
  domain: {
    id: 'academic',
    code: 'academic',
    name: '学业分析域',
    catalog_code: 'learning',
    catalog_name: '学习分析',
    description: '围绕学习行为、答题记录与知识点掌握度组织建模关系。',
    status: 'active',
    governance_summary: {
      cube_count: 4,
      active_cube_count: 4,
      draft_cube_count: 0,
      deprecated_cube_count: 0,
      join_count: 3,
      dangling_cube_count: 0,
    },
  },
  nodes: [
    {
      id: 'answer_records',
      title: '学生答题记录',
      type: 'fact',
      dimensions: 15,
      measures: 6,
      status: 'active',
    },
    {
      id: 'knowledge_tree',
      title: '知识点',
      type: 'dimension',
      dimensions: 9,
      measures: 2,
      status: 'active',
    },
    {
      id: 'student_profile',
      title: '学生',
      type: 'dimension',
      dimensions: 12,
      measures: 2,
      status: 'active',
    },
    {
      id: 'question_profile',
      title: '题目',
      type: 'dimension',
      dimensions: 7,
      measures: 2,
      status: 'active',
    },
  ],
  edges: [
    {
      id: 'answer_records__knowledge_tree',
      source: 'answer_records',
      target: 'knowledge_tree',
      relationship: 'N:1',
      join_type: 'left',
      aggregation_strategy: 'none',
      source_field: 'knowledge_id',
      target_field: 'node_id',
      description: '定位到知识点层级。',
    },
    {
      id: 'answer_records__student_profile',
      source: 'answer_records',
      target: 'student_profile',
      relationship: 'N:1',
      join_type: 'left',
      aggregation_strategy: 'none',
      source_field: 'student_id',
      target_field: 'user_id',
      description: '补充学生画像与年级信息。',
    },
    {
      id: 'answer_records__question_profile',
      source: 'answer_records',
      target: 'question_profile',
      relationship: 'N:1',
      join_type: 'left',
      aggregation_strategy: 'none',
      source_field: 'question_id',
      target_field: 'question_id',
      description: '映射题目标签与难度。',
    },
  ],
  library_cubes: [
    {
      name: 'answer_records',
      title: '学生答题记录',
      description: '答题明细事实表',
      table: 'dwd_answer_records',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 15,
      measure_count: 6,
      status: 'active',
    },
    {
      name: 'knowledge_tree',
      title: '知识点',
      description: '知识树维表',
      table: 'dim_knowledge_tree',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 9,
      measure_count: 2,
      status: 'active',
    },
    {
      name: 'student_profile',
      title: '学生',
      description: '学生画像维表',
      table: 'dim_student_profile',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 12,
      measure_count: 2,
      status: 'active',
    },
    {
      name: 'question_profile',
      title: '题目',
      description: '题目标签维表',
      table: 'dim_question_profile',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 7,
      measure_count: 2,
      status: 'active',
    },
    {
      name: 'lesson_progress',
      title: 'AI课学习进度',
      description: '课程进度事实表',
      table: 'dwd_lesson_progress',
      domain_ids: [],
      domains: [],
      domain_count: 0,
      dimensions: [],
      measures: [],
      dimension_count: 10,
      measure_count: 5,
      status: 'active',
    },
  ],
}

const CUBE_MANAGEMENT_CUBES_FIXTURE = {
  cubes: [
    {
      name: 'lesson_progress',
      title: 'AI课学习进度',
      description: '课程学习进度事实表',
      table: 'dwd_study_lesson_progress_snap',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 10,
      measure_count: 5,
      status: 'active',
      state_summary: { updated_at: '2026-04-08T00:00:00Z' },
    },
    {
      name: 'student_profile',
      title: '学生',
      description: '学生画像维表',
      table: 'dim_ucenter_user_student_df',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 12,
      measure_count: 2,
      status: 'active',
      state_summary: { updated_at: '2026-04-07T00:00:00Z' },
    },
    {
      name: 'ai_course',
      title: 'AI课程',
      description: '课程画像维表',
      table: 'dim_course_lesson_snap_f',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 9,
      measure_count: 2,
      status: 'active',
      state_summary: { updated_at: '2026-04-06T00:00:00Z' },
    },
    {
      name: 'component_progress',
      title: 'AI课程件进度',
      description: '课程件进度事实表',
      table: 'dwd_study_lesson_widget_snap',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 10,
      measure_count: 3,
      status: 'active',
      state_summary: { updated_at: '2026-04-05T00:00:00Z' },
    },
    {
      name: 'school_profile',
      title: '学校',
      description: '学校画像维表',
      table: 'dim_ucenter_organization_school_df',
      domain_ids: ['growth'],
      domains: [{ id: 'growth', code: 'growth', name: '成长观察域', status: 'draft' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 9,
      measure_count: 2,
      status: 'active',
      state_summary: { updated_at: '2026-04-04T00:00:00Z' },
    },
    {
      name: 'kt_recommend',
      title: 'KT推题记录',
      description: '推题事实表',
      table: 'dwd_kt_rec_answer_record_flow_di',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 11,
      measure_count: 5,
      status: 'active',
      state_summary: { updated_at: '2026-04-03T00:00:00Z' },
    },
    {
      name: 'meta_dictionary',
      title: '元数据字典',
      description: '标准维表',
      table: 'dim_pub_meta_dict_df',
      domain_ids: [],
      domains: [],
      domain_count: 0,
      dimensions: [],
      measures: [],
      dimension_count: 3,
      measure_count: 1,
      status: 'active',
      state_summary: { updated_at: '2026-04-02T00:00:00Z' },
    },
    {
      name: 'knowledge_tree',
      title: '知识点',
      description: '知识点维表',
      table: 'dim_question_all_tree_info_df',
      domain_ids: ['academic'],
      domains: [{ id: 'academic', code: 'academic', name: '学业分析域', status: 'active' }],
      domain_count: 1,
      dimensions: [],
      measures: [],
      dimension_count: 9,
      measure_count: 2,
      status: 'active',
      state_summary: { updated_at: '2026-04-01T00:00:00Z' },
    },
  ],
  total: 8,
}

const CUBE_MANAGEMENT_VIEWS_FIXTURE = {
  views: [
    {
      name: 'student_answer_analysis',
      title: '学生答题分析视图',
      description: '答题分析统一视图',
      public: true,
      cube_count: 3,
      cubes: ['answer_records', 'knowledge_tree', 'student_profile'],
      status: 'published',
    },
  ],
  total: 1,
  page: 1,
  page_size: 200,
  page_count: 1,
}

const VIEW_DETAIL_FIXTURE = {
  name: 'student_answer_analysis',
  title: '学生答题分析视图',
  description: '运营态详情优先展示风险、发布状态和下一步动作。',
  public: true,
  cubes: [
    {
      join_path: 'answer_records',
      includes: ['student_id', 'question_id', 'knowledge_id'],
      excludes: [],
      prefix: false,
    },
    {
      join_path: 'student_profile',
      includes: ['user_name', 'grade_name'],
      excludes: [],
      prefix: true,
    },
    {
      join_path: 'knowledge_tree',
      includes: '*',
      excludes: ['node_path'],
      prefix: false,
    },
  ],
  diagnostics: [
    {
      level: 'error',
      kind: 'join',
      field: 'answer_records.question_id',
      message: '当前 View 诊断存在 error，建议先检查 Join 路径、字段映射或 SQL 预览结果。',
    },
    {
      level: 'warn',
      kind: 'mapping',
      field: 'student_profile.grade_name',
      message: '字段映射别名与下游指标口径未完全对齐，建议发布前复核。',
    },
  ],
  publish_summary: {
    definition_hash: 'view_abc123def456',
    publish_status: 'published',
    last_published_at: '2026-04-08T00:45:00Z',
  },
  drift_summary: {
    last_drift_status: 'warn',
    last_drift_checked_at: '2026-04-08T01:10:00Z',
  },
}

const VIEW_MATERIALIZE_STATUS_FIXTURE = {
  materialized: true,
  publish_status: 'published',
  view_name: 'student_answer_analysis',
  dataset_id: 91,
  dataset_code: 'view_student_answer_analysis',
  dataset_name: '学生答题分析宽表',
  sql_query: 'SELECT answer_records.student_id, answer_records.question_id, knowledge_tree.node_name FROM answer_records',
  updated_at: '2026-04-08T00:50:00Z',
  published_at: '2026-04-08T00:45:00Z',
  source_view: 'student_answer_analysis',
  definition_hash: 'view_abc123def456',
  definition_summary: {
    dimension_count: 9,
    measure_count: 3,
    field_count: 12,
  },
  field_mappings: [
    {
      physical_name: 'student_id',
      source_ref: 'answer_records.student_id',
      source_cube: 'answer_records',
      source_field: 'student_id',
      display_name: '学生 ID',
      business_type: 'dimension',
    },
    {
      physical_name: 'question_id',
      source_ref: 'answer_records.question_id',
      source_cube: 'answer_records',
      source_field: 'question_id',
      display_name: '题目 ID',
      business_type: 'dimension',
    },
    {
      physical_name: 'knowledge_name',
      source_ref: 'knowledge_tree.node_name',
      source_cube: 'knowledge_tree',
      source_field: 'node_name',
      display_name: '知识点名称',
      business_type: 'dimension',
    },
  ],
  state_summary: {
    last_drift_status: 'warn',
  },
}

async function mockWorkbenchVisualApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/semantic/catalogs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          catalogs: [],
          total: 0,
        })),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/domains') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
          total: 1,
        })),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/cubes') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(WORKBENCH_CUBES_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/cubes/fixture_cube_draft') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(WORKBENCH_CUBE_DETAIL_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/views') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          views: [],
          total: 0,
        })),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/recipes') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          recipes: [],
          total: 0,
        })),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(WORKBENCH_DATASOURCES_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasets') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(WORKBENCH_DATASETS_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasets/preview') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(WORKBENCH_PREVIEW_FIXTURE)),
      })
      return
    }

    if (/^\/api\/v1\/data-center\/datasources\/\d+\/databases$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(['dw'])),
      })
      return
    }

    if (/^\/api\/v1\/data-center\/datasources\/\d+\/schemas$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(['public'])),
      })
      return
    }

    if (/^\/api\/v1\/data-center\/datasources\/\d+\/tables$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([{ table_name: 'orders', comment: '订单事实表' }])),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic-mapper/cube-backlinks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          cube_name: 'fixture_cube_draft',
          cube_title: 'Playwright 订单分析',
          linked_objects: [],
          linked_metrics: [],
          status: 'linked',
        })),
      })
      return
    }

    await route.continue()
  })
}

async function mockDomainVisualApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/semantic/catalogs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(DOMAIN_VISUAL_CATALOGS_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/domains') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(DOMAIN_VISUAL_DOMAINS_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/domains/academic/canvas') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(DOMAIN_VISUAL_CANVAS_FIXTURE)),
      })
      return
    }

    await route.continue()
  })
}

async function mockCubeManagementVisualApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/semantic/cubes') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(CUBE_MANAGEMENT_CUBES_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/views') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(CUBE_MANAGEMENT_VIEWS_FIXTURE)),
      })
      return
    }

    await route.continue()
  })
}

async function mockViewDetailVisualApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/semantic/views/student_answer_analysis') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(VIEW_DETAIL_FIXTURE)),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/views/student_answer_analysis/materialize-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(VIEW_MATERIALIZE_STATUS_FIXTURE)),
      })
      return
    }

    await route.continue()
  })
}

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('领域目录首屏视觉基线', async ({ page }) => {
  await mockDomainVisualApis(page)
  await gotoSemantic(page, '/semantic/domains/academic?panel=catalog')
  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
  await expect(page.getByRole('button', { name: '领域目录' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-domain-management.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('领域设计首屏视觉基线', async ({ page }) => {
  await mockDomainVisualApis(page)
  await gotoSemantic(page, '/semantic/domains/academic')
  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
  await expect(page.getByText('Cube 库')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-domain-design.png', { fullPage: true })
})

test('Cube 管理首屏视觉基线', async ({ page }) => {
  await mockCubeManagementVisualApis(page)
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-cube-management.png', { fullPage: true, maxDiffPixels: 200 })
})

test('Cube 工作台首屏视觉基线', async ({ page }) => {
  await mockWorkbenchVisualApis(page)
  await gotoSemantic(page, '/semantic/workbench')
  await expect(page.getByTestId('semantic-workbench-title')).toHaveText('语义工作台')
  await expect(page.getByText('选择资源后开始建模')).toBeVisible()
  await expect(page.getByTestId('semantic-resource-pane')).toBeVisible()
  await expect(page.getByTestId('semantic-inspector-pane')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-cube-design.png', { fullPage: true })
})

test('View 详情首屏视觉基线', async ({ page }) => {
  await mockViewDetailVisualApis(page)
  await gotoSemantic(page, '/semantic/views/student_answer_analysis')
  await expect(page.getByTestId('view-related-cubes')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-view-detail.png', { fullPage: true, maxDiffPixels: 220 })
})

test('语义工作台建模态视觉基线', async ({ page }) => {
  await mockWorkbenchVisualApis(page)
  await gotoSemantic(page, '/semantic/workbench?cube=fixture_cube_draft&tab=modeling')
  await expect(page).toHaveURL(/\/semantic\/workbench\?cube=fixture_cube_draft&tab=modeling$/)
  await expect(page.getByTestId('semantic-workbench-title')).toHaveText('Playwright 订单分析')
  await expect(page.getByRole('button', { name: 'Measures' })).toHaveAttribute('data-state', 'active')
  await expect(page.getByLabel('Measure name')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-devtools.png', {
    maxDiffPixels: 200,
    caret: 'hide',
  })
})
