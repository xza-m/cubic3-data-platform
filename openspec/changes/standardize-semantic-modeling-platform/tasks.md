## 1. 实施
- [x] 1.1 为 `CubeDefinition` 增加 `source_id`、`source_database`、`source_schema`、`status`，并保持 `data_source` 兼容读取
- [x] 1.2 新增 `SemanticRuntimeBindingService`，统一 adapter/inspector/dialect/enum 的按数据源分发
- [x] 1.3 新增 `CubeModelingService`，支持从数据源表生成草稿、创建、更新、激活、弃用 Cube
- [x] 1.4 扩展 `SemanticRegistry` 保存生命周期状态、来源绑定和指标摘要
- [x] 1.5 扩展 `SemanticDefinitionService`、`SemanticQueryService`、`SchemaSyncService`、`ViewPublishService` 以接入生命周期和异构分发规则
- [x] 1.6 扩展语义 API，增加建模接口并收口 query/schema-sync 的运行时分发
- [x] 1.7 将 `/semantic/canvas` 升级为 Cube 建模工作台，并新增 `/semantic/cubes/new`、`/semantic/cubes/:name/edit` 路由
- [x] 1.8 调整 Cube 列表和详情页，展示统一状态摘要、来源绑定和建模动作
- [x] 1.9 新增 `MetricSemanticsService` 并统一 `MetricInfo` 输出
- [x] 1.10 补充后端单测、集成测试、前端类型校验与构建验证

## 2. 验证
- [x] 2.1 `PYTHONPATH=. pytest -q`
- [x] 2.2 `npm exec -- tsc --noEmit --pretty false`
- [x] 2.3 `npm run build`
- [x] 2.4 `openspec validate standardize-semantic-modeling-platform --strict`
