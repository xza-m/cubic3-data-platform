# Change: 补完语义层生产基础能力

## Why

当前项目已经具备 `Cube / View / Recipe / Compiler / Semantic API / Agent Tool` 的基本形态，但还停留在“可演示的语义层 MVP”。生产主路径仍存在语义正确性、契约约束、逻辑发布追溯、漂移检测深度和测试闭环不足的问题，无法稳定作为 DataAgent 的默认查询基础设施。

本次变更不处理权限治理和多租户隔离，目标是先把语义层补到“生产基础可用”，让定义、校验、编译、执行、逻辑发布、消费和测试形成闭环；同时严格遵守当前分层架构，避免过度设计和职责漂移。

## What Changes

- **MODIFIED** Query Compiler：修正 JOIN 条件替换、默认过滤注入位置、`1:N` JOIN 风险控制、时间范围限制与显式约束执行
- **MODIFIED** Semantic Contract：让 `relationship`、`public`、`max_range_days`、`enum_source`、View 引用完整性从声明变为可执行规则
- **ADDED** Semantic Query API：提供统一的 `DSL -> compile -> execute` 主路径接口，供 Agent 与现有 DevTools 复用
- **MODIFIED** View Publish Flow：将 View 发布为 `virtual dataset`，补充来源 View、字段映射、生成 SQL、定义摘要和更新时间，形成可追溯逻辑发布链路
- **MODIFIED** Schema Drift Detection：从字段漂移扩展到 JOIN 依赖、View 引用、动态枚举来源校验
- **MODIFIED** Semantic Center Frontend：只补最小可观测链路，不扩展复杂建模交互
- **MODIFIED** Application Architecture：按当前六边形/DDD 分层收口语义层职责，明确定义服务、查询服务、发布服务、漂移检测服务的边界
- **ADDED** Delivery Gate：以测试闭环和需求闭环作为完成标准，至少覆盖编译器、服务层、API、真实业务用例四层验证，并保证实现测试友好

## What Will Not Change

- 不引入权限、RBAC、多租户和访问域治理
- 不建设完整可视化建模器
- 不引入预聚合、缓存加速层和多方言完整支持
- 不引入真正物化持久化、物理结果表或异步刷表任务
- 不引入独立 schema compiler 平台、ANTLR/Babel/Jinja 多阶段编译体系
- 不为了语义层补强而打破当前分层架构

## Impact

- Affected specs: `semantic-layer`
- Affected code:
  - `app/domain/semantic/*`
  - `app/application/semantic/*`
  - `app/interfaces/api/v1/semantic.py`
  - `app/application/agent/services/tool_registry.py`
  - `frontend/src/pages/Semantic/*`
  - `frontend/src/components/Semantic/*`
  - `tests/unit/domain/semantic/*`
  - `tests/unit/application/semantic/*`
  - `tests/integration/test_semantic_api.py`

## Success Criteria

- DataAgent 默认走语义层查询主路径
- 关键 Cube 的编译结果不再因 JOIN 或默认过滤失真
- 至少 1 个 View 可稳定发布为 `virtual dataset` 并保留来源追溯信息
- 发布过程不创建任何物理结果表或持久化查询结果
- Drift 检测可发现真实 schema / join / view 引用问题
- 至少 3 个真实 Recipe 完成端到端验证
- 各新增/调整模块职责清晰，可单测替换依赖，无跨层耦合扩散
