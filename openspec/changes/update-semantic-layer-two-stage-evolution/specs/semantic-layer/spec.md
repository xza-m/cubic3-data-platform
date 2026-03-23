## ADDED Requirements

### Requirement: Semantic Object State Tracking
The system MUST 为语义对象提供统一、可追踪的状态摘要，以便前端、Agent 和 API 使用相同状态视图。

#### Scenario: Cube details expose state summary
- **WHEN** 客户端请求 `describe_cube`
- **THEN** 响应中包含该 Cube 的 `state_summary`
- **AND** 至少包含定义哈希、最近 drift 状态和最近 drift 检查时间

#### Scenario: View details expose publish and drift summaries
- **WHEN** 客户端请求 `describe_view`
- **THEN** 响应中包含 `publish_summary` 和 `drift_summary`
- **AND** 发布状态与最近发布时间来自统一的 registry 元数据

### Requirement: Application Services Are Split By Responsibility
The system MUST 按定义、查询、发布、漂移检测拆分语义层应用服务，避免单个服务承担多种变化原因。

#### Scenario: Semantic layer facade remains compatible
- **WHEN** 现有调用方继续通过语义层门面调用 `list_cubes`、`describe_cube`、`query`
- **THEN** 行为保持兼容
- **AND** 门面内部只做委托，不再承载核心实现逻辑

### Requirement: Semantic Metric Info Is Standardized
The system MUST 向前端、Agent 和 API 输出统一的指标语义对象，而不是让各消费方直接解释 measure 原始结构。

#### Scenario: Cube details return standardized metric objects
- **WHEN** 客户端请求 `describe_cube`
- **THEN** `measures` 中的每个指标对象至少包含 `name`、`title`、`type`、`description`、`certified`

#### Scenario: Agent and frontend consume the same metric fields
- **WHEN** Agent 和前端分别消费同一个 Cube 的指标信息
- **THEN** 两者看到的指标说明和认证状态保持一致

### Requirement: Semantic APIs Must Be Test Friendly
The system MUST 通过显式依赖注入提供可替换的查询和漂移检测依赖，避免 API 层直接依赖隐藏静态实现。

#### Scenario: Query API can be tested without patching internal static methods
- **WHEN** 集成测试构造语义层 Blueprint
- **THEN** 可以通过注入 provider 完成查询依赖替换
- **AND** 不需要 patch 内部静态方法才能覆盖 `/semantic/query`
