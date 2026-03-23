## Context

当前语义层已经具备以下基础能力：

- YAML 驱动的 `Cube / View / Recipe` 定义
- `JoinGraph + QueryCompiler` 的 DSL → SQL 编译
- `ViewPublishService` 负责逻辑发布到 `virtual dataset`
- `SchemaSyncService` 负责 drift 检测
- 前端语义中心已具备列表、详情、DevTools 和发布交互

但语义层仍是“可用但偏中心化”的结构。后续演进应优先解决职责边界、状态合同和消费对象标准化，而不是继续扩大功能面。

## Goals

- 保持现有分层架构，按职责继续拆分应用层
- 用一个最小 registry 收口状态元数据，保证前后端一致交互
- 在不增加 YAML 维护负担的前提下，统一指标语义对象输出
- 保持测试友好，新增组件必须可单测替换依赖

## Non-Goals

- 独立微服务化
- 复杂指标规则引擎
- 多语言 schema source
- 真正物化持久化
- 重型前端治理中心

## Phase 1

### 服务边界

- `SemanticDefinitionService`
  - `list_cubes / describe_cube / list_views / describe_view / validate`
- `SemanticQueryService`
  - `compile / query / compile_and_execute`
- `ViewPublishService`
  - `publish_view / get_publish_status / get_batch_publish_status`
- `SchemaSyncService`
  - `check_all / check_cube`
- `SemanticLayerService`
  - 兼容门面，仅做委托

### Semantic Registry

最小数据模型：

- `object_type`
- `object_name`
- `definition_hash`
- `last_loaded_at`
- `publish_status`
- `last_published_at`
- `last_drift_status`
- `last_drift_checked_at`

设计取舍：

- 直接落数据库表
- 当前仓库没有成熟迁移链路，因此仓储实现允许在首次使用时 `checkfirst` 创建该表，保证运行时和测试闭环
- 不存结果数据，不存编译明细全文

### 统一状态合同

- `CubeDetail.state_summary`
- `ViewDetail.publish_summary`
- `ViewDetail.drift_summary`
- `MaterializeStatus.publish_status`
- `SchemaSyncResult.object_summaries`

前端只展示状态，不自行推导状态语义。

## Phase 2

### 指标语义层

- `MetricSemanticsService`
  - 输入：`Cube.measures`
  - 输出：标准 `MetricInfo`

标准 `MetricInfo` 第一版字段：

- `name`
- `title`
- `type`
- `description`
- `certified`

设计取舍：

- 指标仍定义在 `Cube.measures`
- 不新增 `metrics.yml`
- 不改 compiler 的编译语义，仅标准化消费输出

### 统一消费

- `describe_cube` 中的 `measures` 改为标准化对象 map
- 前端 `CubeDetail`、`Playground`
- Agent `describe_cube`

全部共享同一对象结构，不允许重复解释 measure 原始字段。

## Testing Strategy

### Backend

- registry 仓储单测
- definition/query services 单测
- metric semantics service 单测
- semantic API 集成测试

### Frontend

- TypeScript 类型契约校验
- 页面行为回归依赖接口类型，不引入本地 measure 解释逻辑
- 构建通过作为前端闭环门槛

## Risks

- 现有 API 与 `SemanticLayerService` 耦合较深，需要保证兼容门面完整
- registry 新表缺少迁移链路，必须确保运行时 `checkfirst` 建表逻辑稳定且仅限语义元数据表
- 前端已消费现有 `measures` map，需要保持结构兼容，避免一次性破坏
