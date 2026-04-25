## 1. Implementation

- [x] 1.1 修正 Query Compiler 的 JOIN 条件替换逻辑，按 `edge.source/edge.target` 生成稳定 SQL
- [x] 1.2 调整 `default_filters` 注入策略，区分主 Cube `WHERE` 与 JOIN 目标 `ON`
- [x] 1.3 让 `relationship`、`public`、`max_range_days`、`enum_source`、View 引用完整性进入运行时校验链路
- [x] 1.4 明确 `1:N` JOIN 的处理策略并在编译器中实现防护
- [x] 1.5 新增统一的语义查询执行 API，并让 Agent 与 DevTools 复用该主路径
- [x] 1.6 下沉 View 发布逻辑到应用层服务，API 层仅保留参数解析与响应封装
- [x] 1.7 将 View 逻辑发布为 `virtual dataset`，保存来源 View、字段映射、生成 SQL、定义摘要、更新时间，且不得创建物理结果表
- [x] 1.8 扩展 Drift 检测，覆盖 JOIN 字段、View 引用、动态枚举来源
- [x] 1.9 补齐 `/semantic` 前端最小闭环：查看、校验、编译执行、发布状态、漂移状态
- [x] 1.10 审核新增/调整模块职责，确保定义、查询、发布、漂移检测符合当前架构分层和单一职责

## 2. Tests

- [x] 2.1 为编译器新增/修订单测，覆盖 JOIN 语义、过滤注入、时间范围限制、`1:N` 防护、错误路径
- [x] 2.2 为应用服务新增/修订单测，覆盖 `describe_cube`、`query`、`publish_view`、`schema_sync`、`enum_source`
- [x] 2.3 为 REST API 新增/修订集成测试，覆盖 `/compile`、`/query`、`/views/:name/materialize`、`/schema-sync`，并验证“只发布 virtual dataset、不创建物理物化”
- [x] 2.4 增加真实业务验收用例，至少 3 个 Recipe 从 DSL 到结果全链路验证
- [x] 2.5 形成回归基线，确保语义层核心测试全部通过后才能交付
- [x] 2.6 审查测试替身设计，确保 repo / adapter / inspector 均可替换，避免为测试引入额外复杂抽象

## 3. Validation

- [x] 3.1 验证 DataAgent 默认优先走语义层查询主路径
- [x] 3.2 验证至少 1 个 View 可稳定发布为 `virtual dataset` 并保留来源追溯信息
- [x] 3.3 验证发布链路不会创建物理结果表或持久化查询结果
- [x] 3.4 验证 Drift 检测能发现真实 schema / join / view 失效问题
- [x] 3.5 审查最终实现是否存在跨层职责漂移和过度设计
- [x] 3.6 运行 `openspec validate update-semantic-layer-production-foundation --strict`
