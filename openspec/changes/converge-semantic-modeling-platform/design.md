## Context
当前系统已经完成：
- `Cube` 生命周期：`draft -> active -> deprecated`
- `Domain` 生命周期：`draft -> active -> archived`
- 多 Cube 查询显式要求 `domain_code/domain_id`
- `View -> virtual dataset` 逻辑发布
- 基础 drift 检测
- 一条 Playwright 浏览器烟测

这说明平台已经跨过“概念验证”阶段，进入“收敛和固化”阶段。此时继续增加新能力会放大已有不稳定边界，因此本次设计只做收敛，不引入新的业务能力。

## Goals / Non-Goals
- Goals:
  - 冻结页面职责边界与主跳转链路
  - 固定查询、发布、跨数据源和状态输出规则
  - 将语义中心验证流程升级为固定门禁
  - 将 `SemanticRegistry` 纳入正式迁移链路
  - 以真实主链路验收取代“代码通过即完成”
- Non-Goals:
  - 不新增 LLM 主链路
  - 不新增独立指标平台
  - 不新增真实物化
  - 不新增领域相似度智能提示
  - 不新增外部文件自动监听同步

## Decisions
- Decision: 页面职责冻结为四类入口
  - `Cube 管理页`: 索引、筛选、跳转
  - `Cube 详情页`: 单对象档案
  - `Cube Studio`: 单对象编辑器
  - `Domain 画布`: 领域关系建模
  - Why: 避免职责继续回流到画布或列表页

- Decision: 多 Cube 查询必须显式带 `domain_code/domain_id`
  - Why: Join Path 已由领域定义承载，缺少领域上下文会导致语义不确定

- Decision: `View` 继续只做逻辑发布到 `virtual dataset`
  - Why: 保持当前稳定边界，不重新引入真实物化

- Decision: 跨数据源 JOIN 继续禁止
  - Why: 当前运行时虽已支持按 `source_id` 分发，但跨源 Join 仍缺乏统一可靠语义和执行保障

- Decision: `SemanticRegistry` 正式迁移化
  - Why: 运行时补列虽然可用，但不满足长期运维和发布一致性要求

- Decision: 语义中心验证流程固定为分层门禁
  - L1: `pytest`
  - L2: `tsc` + `build`
  - L3: `domain-smoke` + `domain-publish-smoke` + `cube-draft-smoke`
  - Why: 单测和构建不能替代真实浏览器链路验证

## Convergence Scope
### 产品边界收敛
- 画布中不再出现物理表浏览与 Cube 草稿生成流程
- 列表页不再承担复杂编辑
- 详情页不再承担领域关系拖拽
- 跳转链路固定为：
  - `Cube 管理 -> Cube 详情 -> Cube 编辑`
  - `Cube 详情 -> Domain 画布`
  - `Domain 画布 -> Cube 详情`

### 运行模型收敛
- 多 Cube 查询缺少 `domain_code/domain_id` 必须稳定报错
- Domain 发布必须执行：
  - 环路校验
  - 重复边校验
  - `1:N` 聚合策略校验
  - `active Cube` 引用校验
  - 完全重复领域指纹校验
- View 仅逻辑发布，不进入真实物化
- 跨数据源 Join 固定禁止

### 状态模型收敛
后端统一输出：
- `StateSummary`
- `CubeSummary`
- `CubeDetail`
- `DomainSummary`
- `DomainCanvasNode`
- `MetricInfo`

前端不得本地推导语义状态。

### 测试与环境收敛
必须形成一键或文档化固定流程，最少包括：
- `PYTHONPATH=. pytest -q`
- `npm exec -- tsc --noEmit --pretty false`
- `npm run build`
- `npm run e2e:domain-smoke`
- `npm run e2e:domain-publish-smoke`
- `npm run e2e:cube-draft-smoke`

## Acceptance Paths
收敛完成时必须至少验收三条真实主链路：
1. `物理表 -> Cube draft -> Cube active`
2. `Domain draft -> 画布建模 -> 发布 active`
3. `带 domain_code 的多 Cube 查询 -> 编译 -> 执行`

## Risks / Trade-offs
- 风险: 将更多烟测纳入固定流程会增加本地验证时间
  - Mitigation: 只覆盖关键路径，避免烟测泛滥
- 风险: 注册中心迁移化可能影响现有数据兼容
  - Mitigation: 采用增量 migration 和兼容读取策略
- 风险: 收敛期冻结能力可能让新需求推进变慢
  - Mitigation: 明确这是短周期质量收敛，不是长期冻结

## Migration Plan
1. 完成页面职责与文案收口
2. 固化前端验证入口和三条烟测
3. 将 `SemanticRegistry` 纳入正式 migration
4. 完成三条主链路真实验收
5. 以验收结果作为收敛结束标准
