## Context
本次变更不是继续做局部页面 polish，而是把已经成型的语义中心工作台抽象成“可持续开发”的前端架构输入。

当前后端主能力来源清晰：

- `app/application/semantic/semantic_definition_service.py`
- `app/application/semantic/cube_modeling_service.py`
- `app/application/semantic/domain_modeling_service.py`
- `app/application/semantic/domain_canvas_service.py`
- `app/application/semantic/semantic_query_service.py`
- `app/application/semantic/schema_sync_service.py`

这些服务已经表明：语义中心不是一组零散对象，而是一个有稳定任务链的工作台：

`物理表 -> Cube 草稿 -> Cube 生命周期 -> 领域目录 -> 领域关系/Join -> 领域发布 -> View 发布 -> DSL 编译/查询 -> Schema 治理`

因此，前端不应继续按“接口分布”或“资源详情页”扩张，而应按“用户任务 + 页面类型 + 后端能力域”冻结信息架构。

## Goals / Non-Goals
- Goals:
  - 将后端能力正式映射为前端可理解的能力域
  - 固定语义中心五类页面模型
  - 为每个主页面提供字段清单、组件清单和职责边界
  - 定义共享前端视图模型与 hook 入口
  - 为实现阶段提供可直接排期的任务拆分
- Non-Goals:
  - 不新增全局导航层级
  - 不重命名现有主路由
  - 不新增独立 `View`、`Recipe`、`Schema Drift` 一级页面
  - 不在本次提案中改动 DSL、Compiler、发布规则等后端业务逻辑

## Decisions
- Decision: 以前端“页面类型”作为第一抽象层，而不是“资源对象类型”
  - Why: 用户任务天然聚合在列表治理、单体编辑、关系建模、开发调试四类页面中
  - Alternatives considered:
    - 以 `Cube / View / Domain / Catalog / Recipe` 为一级页面
      - 缺点：容易回到传统 CRUD 后台，违背当前 workbench 方向

- Decision: 语义中心固定五类页面模型
  - `Overview`
  - `Inventory`
  - `Studio`
  - `Canvas`
  - `Developer Workbench`
  - Why: 能稳定承接当前所有后端能力，符合 `KISS`

- Decision: `Cube` 仍是主库存入口，`View` 与 `Recipe` 不单独升格为一级导航
  - Why: 当前用户核心任务仍围绕 `Cube` 定义、领域关系和治理判断展开
  - Alternatives considered:
    - 统一 `Cube / View` 为一级“语义模型管理”
      - 缺点：会削弱 `Cube` 作为主对象的治理焦点

- Decision: 目录页负责治理，画布页负责关系建模，Studio 负责单模型定义
  - Why: 符合后端服务边界，也符合 `SOLID`
  - Alternatives considered:
    - 让目录页承担单领域全生命周期
      - 缺点：目录页会重新混入重操作流程

- Decision: DevTools 聚合 `文件编辑 / 编译调试 / Schema 同步`
  - Why: 这三项后端能力都属于开发与治理支持，不应拆散

## Backend Capability Domains
### 1. 定义域
- 对象：`Cube / View / Recipe / Domain / Catalog`
- 能力：列出、查看、读取定义、校验、状态摘要
- 前端映射：
  - `Overview`
  - `CubeList`
  - `DomainList`
  - `DevTools / 定义文件`

### 2. 建模域
- 对象：`Cube` 草稿、单模型编辑、领域目录、领域画布
- 能力：草稿生成、来源绑定、结构维护、Join 维护、领域发布
- 前端映射：
  - `CubeStudio`
  - `DomainModelingEntry`
  - `DomainCanvas`

### 3. 运行域
- 对象：DSL、SQL、查询结果
- 能力：编译、执行、返回 Join 路径与主 Cube
- 前端映射：
  - `DevTools / 编译调试`

### 4. 治理域
- 对象：发布状态、来源绑定、漂移、阻塞项、提示项
- 能力：发布状态查询、Schema Drift 检测、注册表摘要
- 前端映射：
  - `CubeList`
  - `DomainList`
  - `DomainCanvas`
  - `DevTools / Schema 同步`

## Page Type Model
### 1. Overview
- 作用：解释模块职责和当前整体状态
- 规则：不做分诊、不做入口矩阵、不做推荐流程

### 2. Inventory
- 作用：找对象、筛对象、判状态
- 页面：
  - `CubeList`
  - `DomainList`

### 3. Studio
- 作用：维护单个对象定义
- 页面：
  - `CubeStudio`

### 4. Canvas
- 作用：组织关系网络、维护 Join、执行发布前检查
- 页面：
  - `DomainCanvas`

### 5. Developer Workbench
- 作用：定义文件、编译调试、Schema 同步
- 页面：
  - `DevTools`

## Route To Responsibility Mapping
- `/semantic/overview`
  - 模块职责和整体状态
- `/semantic/cubes`
  - Cube 库存治理
- `/semantic/cubes/new`
  - 新建 Cube
- `/semantic/cubes/:name/edit`
  - 编辑 Cube
- `/semantic/domains`
  - 目录治理和领域筛选
- `/semantic/modeling`
  - 创建领域草稿与选择已有领域
- `/semantic/domains/:id`
  - 领域关系建模
- `/semantic/tools`
  - 定义文件、编译调试、Schema 同步

## Shared Frontend Abstractions
### View Models
```ts
type SemanticObjectSummary = {
  kind: 'cube' | 'view' | 'domain' | 'catalog' | 'recipe'
  id: string
  code: string
  title: string
  description?: string
  status: string
}

type SemanticGovernanceState = {
  lifecycle: 'draft' | 'active' | 'deprecated'
  sourceBinding?: 'bound' | 'unbound' | 'invalid'
  syncStatus?: 'ok' | 'warn' | 'error' | 'unknown'
  blockers: string[]
  hints: string[]
}

type SemanticStructureSummary = {
  dimensionCount?: number
  measureCount?: number
  joinCount?: number
  cubeCount?: number
  viewCount?: number
}

type WorkbenchContextItem = {
  label: string
  value: string | number
  tone?: 'default' | 'accent' | 'warning'
}
```

### Hook Contracts
- `useCubeInventory`
- `useCubeStudio`
- `useDomainGovernance`
- `useDomainCanvas`
- `useSemanticDevTools`

### Shared Components
- `SemanticPageHeader`
- `SemanticWorkbenchContextBar`
- `SemanticSurface`
- `SemanticInspectorPanel`
- `SemanticIssueList`
- `SemanticActionBar`
- `SemanticPreviewPanel`

## Page Field Blueprint
完整字段清单与组件清单单独放在 `page-fields.md`，作为开发输入文档。

核心规则：
- 页头只写功能，不写流程
- 上下文条只写范围、状态、规模
- 每页只保留一个主任务区
- Inspector 只在需要时显示
- `View / Recipe` 通过详情区或 DevTools 挂载，不单独升格一级导航

## Risks / Trade-offs
- 将 IA 正式冻结后，局部页面自由发挥空间会变小
  - Mitigation: 用共享组件和字段清单提供明确扩展边界

- 不把 `View` 升为一级入口，可能会影响少数以 `View` 为主的管理需求
  - Mitigation: 在 `Cube` 预览、详情和 `DevTools` 中增强 `View` 可见性

- 新增共享 view model 层会增加一次抽象成本
  - Mitigation: 仅为语义中心建立，不扩散到全站，符合 `YAGNI`

## Implementation Plan
1. 先固化共享 view model、状态模型和 workbench 页面约束
2. 统一 `Overview / CubeList / DomainList` 的 Inventory/Overview 语义
3. 统一 `CubeStudio / DomainCanvas` 的 Studio/Canvas 语义
4. 统一 `DevTools` 的 Developer Workbench 语义
5. 最后补 `View / Recipe` 的挂载点，而不是新增一级页
