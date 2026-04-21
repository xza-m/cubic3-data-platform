<!-- docs/superpowers/plans/2026-04-20-platform-redesign/01-frontend-workstream.md -->

# 01 · 前端工作流

> 覆盖 demo 全部页面 + `app/interfaces/api/v1/*` 的所有路由。
> 配合 [00 · architecture](00-architecture.md) §3 数据流 与 §5 路由形态。

---

## 1. 三批次交付节奏

  | 批次 | 周期 | 主题 | 交付项 |
  | --- | --- | --- | --- |
  | **批次 1 · 关键缺口** | W2 | 现 demo 没有但后端关键的能力 | P1, P11, P15, P16, P21, P22 |
  | **批次 2 · 治理与策略** | W3 | 本体治理 + 数据治理 | P4, P5, P6, P7, P8, P10, P19 |
  | **批次 3 · 生产力** | W4 | 提效 / 调度 / 通知 / 配置 | P2, P3, P9, P12, P13, P14, P17, P18, P20 |

  P1~P22 详见本文 §3 覆盖审计。

---

## 2. 业务域 → 页面映射

  五大一级模块 + 配置模块。每个域至少有 L0 列表、L2 Peek、L3 详情；CRUD 场景必有 EntityFormDialog。

  | 模块 | 子域 | 页面（L0/L2/L3） | 表单 | 后端契约 |
  | --- | --- | --- | --- | --- |
  | Dashboard | overview | `Dashboard` | — | `/api/v1/dashboard/*` |
  | Data | datasources | `DatasourcesList` / Peek / `DatasourceDetail` | 创建/编辑 | `/api/v1/datasources` |
  | Data | datasets | `DatasetsList` / Peek / `DatasetDetail` | 创建/导入 | `/api/v1/datasets` |
  | Data | extraction tasks | `ExtractionTasksList` / Peek / `ExtractionTaskDetail` | 创建/编辑/调度 | `/api/v1/extraction/tasks` |
  | Data | extraction runs | `ExtractionRunsList` / Peek / `ExtractionRunDetail` | — | `/api/v1/extraction/runs` |
  | Query | console | `QueryConsole` | — | `/api/v1/queries/execute` |
  | Query | history | `QueryHistory` Peek | — | `/api/v1/queries/history` |
  | Query | saved | `QueriesSaved` / Peek / `QueriesSavedDetail` | 创建/编辑/删除 | `/api/v1/queries/saved` |
  | Query | scheduled | `QueriesScheduled` / Peek / `QueriesScheduledDetail` | 创建/编辑/启停 | `/api/v1/queries/scheduled` *(new-backend)* |
  | Semantic | ontology workbench | `OntologyWorkbench`（对象中心 IA） | 对象/指标/关系编辑 | `/api/v1/ontology/*` |
  | Semantic | cubes | `SemanticCubes` Grid + Peek + `CubeDetail` | 创建/编辑 yaml | `/api/v1/semantic/cubes` |
  | Semantic | views | `SemanticViews` Peek + `ViewDetail` | 创建/物化 | `/api/v1/semantic/views` |
  | Semantic | dev tools | `SemanticDevTools` 诊断 + 历史 Peek | — | `/api/v1/semantic/diagnose` + `/diagnose/runs` *(new-backend)* |
  | Semantic | domain | `DomainCanvas` 域画布 + 发布 | — | `/api/v1/semantic/domains` |
  | Apps | marketplace | `AppsMarketplace` Peek | — | `/api/v1/apps` |
  | Apps | instances | `AppInstancesList` Peek + `InstanceDetail` | 创建/编辑/启停 | `/api/v1/app-instances` |
  | Config | channels | `ConfigChannels` Peek + `ChannelDetail` | 创建/编辑/测试 | `/api/v1/channels` |
  | Config | subscriptions | `ConfigSubscriptions` Peek + `SubscriptionDetail` | 创建/启停 | `/api/v1/subscriptions` |
  | Config | rbac | `ConfigUsers`、`ConfigRoles` | 创建/分配 | `/api/v1/users` `/api/v1/roles` |
  | Auth | login | `Login` | — | `/api/v1/auth/login` |

---

## 3. 前端覆盖审计 P1~P22（重组分类）

  按"是否为后端能力 / 是否需要后端拓展"两个维度归类，每项注明所属批次。

### 3.1 直接对接现有后端（align）

  | # | 能力 | 现状 | 计划 | 批次 |
  | --- | --- | --- | --- | --- |
  | P1 | 应用实例 list / detail / 启停 / 编辑 | demo 缺 | 新 `AppInstancesList` + Peek + Detail，复用 `EntityFormDialog` | 批次 1 |
  | P2 | 数据源连接测试 | demo 缺 | 详情页加 "测试连接" 按钮，调用现有 `POST /datasources/:id/test` | 批次 3 |
  | P3 | 数据集字段画像（distinct/null 比） | demo 缺 | 详情 Tab "字段" 加分布渲染，对接 `GET /datasets/:id/profile` | 批次 3 |
  | P4 | 本体对象的字段类型校验提示 | demo 缺 | 编辑 Tab 内联校验 + toast | 批次 2 |
  | P5 | 本体指标公式编辑 + 预览 | demo 弱 | OntologyWorkbench 指标 Tab 加公式编辑器 + dry-run 预览 | 批次 2 |
  | P6 | 本体关系（Object↔Object）维护 | demo 缺 | OntologyWorkbench 关系 Tab + 关系画布 | 批次 2 |
  | P7 | 本体发布 / 回滚 | demo 缺 | DomainCanvas 顶栏加发布按钮 + 历史抽屉 | 批次 2 |
  | P8 | 语义视图物化执行历史 | demo 缺 | View Detail 加 "物化" Tab + 列表 | 批次 2 |
  | P9 | 查询历史筛选（用户/时间/状态/SQL like） | demo 弱 | QueryHistory 加左侧筛选栏 | 批次 3 |
  | P10 | 抽取任务调度配置（cron / 触发） | demo 缺 | ExtractionTaskDetail 调度 Tab + 表单 | 批次 2 |
  | P12 | 通知通道测试发送 | demo 缺 | ChannelDetail 加 "发送测试" 按钮 | 批次 3 |
  | P13 | 订阅启停 + 历史 | demo 缺 | SubscriptionDetail Tab "投递历史" | 批次 3 |
  | P14 | 用户 / 角色管理 | demo 缺 | `ConfigUsers`、`ConfigRoles` 双页面 | 批次 3 |
  | P17 | 抽取 Run 日志查看 + 重跑 | demo 弱 | ExtractionRunDetail 加日志面板 + 重跑按钮 | 批次 3 |
  | P18 | 抽取 Run 失败快速跳源 | demo 缺 | Run Detail 报错块加 "查看源任务" 跳转 | 批次 3 |
  | P20 | 应用市场分类筛选 / 关键字 | demo 弱 | Marketplace 加 facet 与 search | 批次 3 |

### 3.2 需要后端 extend-backend 配合（详见 [02 · backend](02-backend-workstream.md)）

  | # | 能力 | 后端拓展 | 前端动作 |
  | --- | --- | --- | --- |
  | P11 | 语义 view 物化（材料化标记 + 触发） | B-back-3 加 `materialized_at` 字段 + POST 触发接口 | View Detail "物化" 按钮，列表 chip 反映状态 |
  | P15 | 数据源测试连接结果详情（含耗时、报错） | B-back-4 增强返回 schema | 测试结果弹窗展示完整字段 |
  | P16 | 数据源元数据浏览（库 / 表 / 字段） | B-back-5 新增 `GET /datasources/:id/schema` | DatasourceDetail "结构" Tab |
  | P19 | 本体对象搜索（跨域名 + 跨字段） | B-back-6 加 `q` 与 `field` 参数 | OntologyWorkbench 顶部全局搜索 |
  | P21 | 用户偏好（默认主题 / 默认页签） | B-back-1 `/users/me/preferences` GET/PUT | 设置页 + 切换持久化 |
  | P22 | 应用实例运行健康度 | B-back-2 `health` 字段 | InstanceDetail Header chip + dashboard 汇总 |

### 3.3 需要 new-backend 实体（详见 [02 · backend](02-backend-workstream.md)）

  | # | 能力 | 后端新建 | 前端动作 |
  | --- | --- | --- | --- |
  | (Q-sched) | 调度查询 | `scheduled_query` 表 + `/queries/scheduled` CRUD（B-back-8） | `QueriesScheduled` 整页 |
  | (Diag-history) | 语义诊断历史 | `semantic_diagnose_runs` 表 + `/semantic/diagnose/runs`（B-back-9） | `SemanticDevTools` 历史区 + Peek |

### 3.4 drop-frontend（demo 有但后端没规划，删除）

  - `App.rating` / `App.installs`（市场卡片评分与装机数）
  - `App.capabilities` 假标签
  - 应用 "安装 / 卸载" 按钮（后端无装机概念，改为"创建实例"）
  - Cube 卡片虚构的 "下游 BI 数量"（保留但仅当 B-back-7 上线后展示真实派生）

  删除 commit 必须留注释：`// drop-frontend: backend has no design for X — see plan §3.4`

---

## 4. 路由总表（v2/routes.tsx 规范）

  - 静态路由（如 `/new`、`/import`）必须**先于**动态路由（`/:id`）声明。
  - 所有 detail 页面对应 query key `['<domain>', 'detail', id]`，便于 mutation invalidate。
  - tab 注册责任：**只有 L3 detail 页面**通过 `openTab` 注册 tab，L2 Peek 不创建 tab。

  Domain 路由命名约定：

  ```text
  /<domain>             list (L0)
  /<domain>/new         create form
  /<domain>/:id         detail (L3)
  /<domain>/:id/edit    edit form（可选，多数走详情内联编辑）
  ```

---

## 5. 状态管理（react-query）

  | 类别 | 默认 | 例外 | 备注 |
  | --- | --- | --- | --- |
  | staleTime | 30s | 配置类 5min；执行类 0 | 见 hook 注释 |
  | retry | 1 | mutation 0 | 失败 toast |
  | refetchOnWindowFocus | true（list） / false（detail） | 编辑态 false | 防止覆盖输入 |
  | mutation invalidate | 必须 invalidate `['<domain>']` 整域 | 列表巨大时按 filter 精确 invalidate | review 重点 |

  query key 规范（强制）：

  ```ts
  ['datasources']                                    // 域根
  ['datasources', 'list', { page, q }]               // 列表
  ['datasources', 'detail', id]                      // 详情
  ['datasources', 'detail', id, 'schema']            // 详情 sub-resource
  ```

  禁止：`useQuery(['ds-list-' + page], ...)` 这类拼接 string。

---

## 6. 错误处理 / 加载态

  - 全局：`AppShell` 包一层 `ErrorBoundary`，路由级再包一层 `RouteErrorBoundary`。
  - 网络错误：axios interceptor 统一转 `{ code, message }` → react-query `error`。
  - UI 反馈：
    - 列表加载：Skeleton（默认 5 行）。
    - 列表失败：内嵌 `ErrorState` 组件 + Retry 按钮，不弹 toast。
    - mutation 失败：toast（红色）+ 表单字段级错误（如有）。
    - mutation 成功：toast（绿色）+ 自动刷新列表。
  - 401：interceptor 清除 token，跳 `/login?redirect=<current>`。
  - 403：路由级 `<Forbidden />` 页面，不跳登录。
  - 404：路由级 `<NotFound />`。

详细规范见 [03 · cross-cutting](03-cross-cutting-concerns.md) §状态与错误。

---

## 7. 性能预算

  | 指标 | 预算 | 检测 | 守门 |
  | --- | --- | --- | --- |
  | 首屏 JS gzipped | ≤ 350 KB | `vite build --report` + CI 工件 | size-limit GH Action 阈值 |
  | 列表首次渲染 | P50 ≤ 200ms / 100 行 | dev tools profiler 抽样 | 月度回归 |
  | Peek 打开 → 内容可见 | ≤ 300ms（含网络） | 关键路径埋点（详见 §03 可观测） | 周巡检 |
  | Monaco editor | lazy chunk | `import('@monaco-editor/react')` 动态导入 | 默认不进入 main chunk |
  | 表格 > 500 行 | 必须虚拟化（`@tanstack/virtual`） | code review checklist | review |
  | 图标 | tree-shake `lucide-react` | 单次 import 一个 icon，不允许 `import * as Icons` | lint 规则 |

---

## 8. 测试

  - 单元（vitest）：组件内部逻辑（reducer、hook、纯函数），覆盖率门槛 80%。
  - 集成（vitest + msw）：每个域至少 1 个集成测试覆盖 list+detail+CRUD。
  - 视觉（Playwright snapshot）：5 大模块首屏 + Peek 打开态，每次 PR 对比。
  - E2E（Playwright）：P1~P22 关键流程逐项一条 happy path。

详细测试金字塔与 CI gate 见 [03 · cross-cutting](03-cross-cutting-concerns.md) §测试金字塔。

---

## 9. 红线（PR 模板必勾）

1. 不允许 `display:none` / `hidden` 隐藏后端不支持的字段；走 `drop-frontend` 删除。
2. 不允许新写入 `lib/mocks.ts`；新数据靠 `v2/api/*` 拉真接口。
3. 不允许在 hook 之外的层调用 `axios.*`；统一走 `v2/api/*`。
4. 不允许 `enrich*` / `decorate*` 适配器把后端 payload 改字段名；改名走 ts 类型层。
5. 不允许在页面里直接调用 `setQueryData`；mutation 必须 invalidate。
6. 删除"假数据 / 假按钮"必须留 `// drop-frontend:` 注释，注明出处。
