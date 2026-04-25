## Context
当前语义层已经沿 `domain / application / infrastructure / interfaces` 分层实现，但仍存在三个结构性缺口：

1. `Cube` 没有标准化建模入口，只能靠 YAML 编辑器或手工维护。
2. `data_source` 只是字符串标签，运行时并未与现有数据源体系形成强绑定。
3. 画布页面仍以结构浏览为主，无法承接完整建模流程。

本次设计目标不是重写语义层，而是在现有架构内把 Cube 升级为一等建模对象，并让画布成为标准建模主入口。

## Goals
- 让 `Cube` 具备完整生命周期：`draft -> active -> deprecated`
- 让 `Cube` 绑定真实数据源，并让 query/schema-sync/enum/dialect 按绑定数据源分发
- 让 `/semantic/canvas` 成为基于 Cube 的建模主入口
- 让前后端共享统一的语义对象和状态摘要
- 让指标仍定义在 `Cube.measures` 中，但通过独立服务输出统一 `MetricInfo`
- 保持测试友好，新增服务均为显式依赖注入

## Non-Goals
- 不拆微服务
- 不做真实物化持久化
- 不做审批流
- 不新建独立指标平台
- 不新增第二套数据源体系

## 当前架构与目标架构
当前：
- YAML repo 驱动定义
- `SemanticLayerService` 负责大部分定义、执行、描述
- `RelationCanvas` 主要做关系浏览
- query/schema-sync 运行时仍有 MaxCompute 默认路径

目标：
- `CubeModelingService` 管理建模生命周期
- `SemanticRuntimeBindingService` 管理真实数据源绑定和运行时分发
- `MetricSemanticsService` 统一指标输出对象
- `RelationCanvas` 变成建模工作台
- `SemanticRegistry` 统一状态摘要

## 生命周期设计
### Cube 生命周期
`select source -> browse table -> draft -> edit/validate -> active -> consume -> drift -> deprecated`

- `draft`：可编辑，不进入默认消费链路
- `active`：可进入 query/view/agent/画布默认消费链路
- `deprecated`：仍可被读取，但不推荐新引用

### View 生命周期
`draft -> validate -> publish(logical) -> consume -> drift-aware -> deprecated`

- View 依附 Cube 存在
- 依赖的 Cube 全部 `active` 时，View 才允许进入默认发布/消费链路
- 若依赖 `deprecated` 或非 `active` Cube，需返回诊断提示

### Metric 生命周期
`defined in cube -> normalized by semantics -> consumed by UI/Agent/API`

- Metric 仍定义在 `Cube.measures`
- `MetricSemanticsService` 输出统一 `MetricInfo`
- 当前只统一说明与认证，不做规则引擎

## 核心对象设计
### CubeDefinition
- 新增 `source_id`
- 新增 `source_database`
- 新增 `source_schema`
- 新增 `status`
- 保留 `data_source` 作为兼容字段

### StateSummary
统一由后端生成，至少包含：
- `definition_hash`
- `status`
- `source_id`
- `source_binding_summary`
- `publish_status`
- `last_published_at`
- `last_drift_status`
- `last_drift_checked_at`
- `measure_summary_snapshot`
- `certified_measure_list`

### MetricInfo
- `name`
- `title`
- `type`
- `description`
- `certified`

### CubeNodeState
画布节点的统一输出对象，至少包含：
- Cube 基础信息
- 生命周期状态
- 数据源绑定摘要
- drift 摘要
- 维度/指标数量

## 服务边界
### CubeModelingService
负责：
- 从数据源表生成草稿
- 创建/更新/激活/弃用 Cube

不负责：
- query 执行
- drift 检测
- 物理 schema 适配细节

### SemanticRuntimeBindingService
负责：
- 解析 `source_id -> datasource`
- 为 Cube 选择 adapter / inspector / dialect
- 生成来源绑定摘要

### MetricSemanticsService
负责：
- 将 `MeasureDef` 转换为统一 `MetricInfo`

### SemanticDefinitionService
负责：
- `list/describe/validate`
- 同步 registry 状态摘要

### SemanticQueryService
负责：
- 编译和执行 query
- 校验 query 只使用 `active` Cube
- 校验不发生跨数据源 JOIN

## 前端交互设计
### 画布作为主入口
`/semantic/canvas` 升级为建模工作台：
- 左侧：数据源与表结构浏览
- 中间：Cube 画布
- 右侧：属性面板与建模动作

### 列表页作为索引
`/semantic/cubes` 负责：
- 搜索
- 数据源过滤
- 状态过滤
- 跳转画布定位

### 详情页作为精细查看
`CubeDetail` 与画布共享同一套对象：
- `CubeDetail`
- `MetricInfo`
- `StateSummary`

前端不自行推导语义状态，只做展示与轻交互。

## 测试友好约束
### 后端
- 新增服务必须显式注入依赖
- 运行时分发逻辑必须能通过 mock datasource repo / adapter factory 单测
- API 层只做参数解析、调用服务、错误映射

### 前端
- 页面只依赖统一 API 类型
- 新增状态字段必须先更新 `/frontend/src/api/semantic.ts`
- 所有语义页面改动必须通过 `tsc` 和 `build`

## 验收
- 至少 1 个 Cube 可从现有数据源表生成 draft，并激活为 active
- 至少 1 个 View 依赖生命周期约束被正确诊断
- 至少 1 个指标说明从 YAML 到 API 到前端到 Agent 全链路一致
- 至少 1 个 drift 状态能从后端回显到画布和详情页
