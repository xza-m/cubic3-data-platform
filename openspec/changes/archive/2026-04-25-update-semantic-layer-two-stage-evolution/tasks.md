## 1. 阶段一：服务拆分与状态合同

- [x] 1.1 新增 `SemanticDefinitionService`，收口定义浏览、校验与 View 展开逻辑
- [x] 1.2 新增 `SemanticQueryService`，收口编译与查询执行逻辑
- [x] 1.3 新增 `Semantic Registry` 实体、端口与仓储实现
- [x] 1.4 将 `ViewPublishService` 和 `SchemaSyncService` 接入 registry，回写发布/漂移状态
- [x] 1.5 将 `SemanticLayerService` 收敛为兼容门面
- [x] 1.6 统一 API 输出状态合同并移除 API 层隐藏依赖
- [x] 1.7 前端语义页面接入状态摘要展示
- [x] 1.8 补充 registry、definition/query service、semantic API 测试

## 2. 阶段二：指标语义独立与统一消费对象

- [x] 2.1 新增 `MetricSemanticsService`
- [x] 2.2 将 `describe_cube` 的指标输出切换为标准 `MetricInfo`
- [x] 2.3 Agent 改为消费统一指标对象
- [x] 2.4 前端 `CubeDetail`、`Playground` 改为消费统一指标对象
- [x] 2.5 补充 metric semantics、Agent 一致性与前端类型回归测试

## 3. 验证

- [x] 3.1 `pytest -q` 通过
- [x] 3.2 `npm exec -- tsc --noEmit --pretty false` 通过
- [x] 3.3 `npm run build` 通过
- [x] 3.4 `openspec validate update-semantic-layer-two-stage-evolution --strict` 通过
