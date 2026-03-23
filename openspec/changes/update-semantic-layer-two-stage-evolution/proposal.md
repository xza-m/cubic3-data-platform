# Change: 语义层两阶段演进

## Why

当前语义层已经完成生产基础可用能力，但仍有三个结构性问题：

- `SemanticLayerService` 同时承担定义浏览、校验、View 展开、查询执行等职责，应用层边界偏重
- 发布状态、漂移状态、定义摘要分散在 `Dataset.file_metadata`、运行时服务和 API 拼装逻辑中，前后端缺少统一状态合同
- 指标虽然已经补充 `description` 和 `certified`，但前端、Agent、API 仍然直接消费 measure 原始结构，缺少统一的指标语义对象

本次变更以“两个阶段、一个 umbrella change”推进，目标是在不引入独立微服务、不做真正物化持久化、不建设重型指标治理平台的前提下，把语义层演进为职责清晰、状态统一、测试友好的稳定子系统。

## What Changes

- **ADDED** 阶段一：按定义服务 / 查询服务 / 发布服务 / 漂移检测服务拆分应用层职责
- **ADDED** 阶段一：新增轻量 `Semantic Registry`，统一记录定义哈希、发布时间、漂移状态和检查时间
- **MODIFIED** 阶段一：统一 `CubeDetail`、`ViewDetail`、`MaterializeStatus`、`SchemaSyncResult` 的状态合同，前后端共享同一状态摘要
- **ADDED** 阶段二：新增 `MetricSemanticsService`，将 `Cube.measures` 转换为统一的指标语义对象
- **MODIFIED** 阶段二：前端语义中心、Agent 和 API 统一消费标准 `MetricInfo`，不再各自解释 measure 原始结构
- **MODIFIED** 测试闭环：新增 registry、服务拆分、指标语义映射与前后端契约回归测试，保证实现测试友好

## What Will Not Change

- 不拆独立微服务
- 不引入真正 metastore 或独立 registry 平台
- 不做真正物化持久化和物理结果表
- 不引入 `metrics.yml` 或独立指标管理后台
- 不实现指标规则引擎、审批流、版本治理系统

## Impact

- Affected specs: `semantic-layer`
- Affected code:
  - `app/application/semantic/*`
  - `app/domain/semantic/*`
  - `app/domain/entities/*`
  - `app/domain/ports/repositories/*`
  - `app/infrastructure/repositories/*`
  - `app/interfaces/api/v1/semantic.py`
  - `app/application/agent/services/tool_registry.py`
  - `frontend/src/api/semantic.ts`
  - `frontend/src/pages/Semantic/*`
  - `frontend/src/components/Semantic/*`
  - `tests/unit/application/semantic/*`
  - `tests/integration/test_semantic_api.py`

## Success Criteria

- 语义层应用服务职责拆分完成，`SemanticLayerService` 不再承担唯一重实现职责
- 发布状态、漂移状态和定义摘要可统一追踪并在前后端回显
- `describe_cube` 返回统一指标语义对象，前端和 Agent 消费一致
- 后端新增服务均可通过依赖注入替换依赖并完成单测
- `pytest`、`tsc`、`build`、`openspec validate --strict` 全部通过
