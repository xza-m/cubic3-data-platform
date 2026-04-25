# Change: add-measure-descriptions

## Why

当前语义层已经具备基础查询与发布能力，但指标定义仍缺少最基础的人类可读说明。  
这导致前端和 Agent 能看到指标名，却无法稳定理解“这个指标是什么”，影响可用性；同时如果一次性引入口径规则引擎，又会明显增加维护成本。

## What Changes

- 为语义层 `Measure` 增加最小说明字段：`description`
- 为语义层 `Measure` 增加低成本推荐标记：`certified`
- 在 `describe_cube` 返回中透出指标说明信息
- 在前端语义详情页展示指标说明和认证状态
- 保持指标继续定义在 `Cube.measures` 中，不引入独立指标平台

## Impact

- Affected specs: `semantic-layer`
- Affected code:
  - `app/domain/semantic/entities.py`
  - `app/application/semantic/semantic_service.py`
  - `frontend/src/api/semantic.ts`
  - `frontend/src/pages/Semantic/CubeDetail.tsx`

## Out of Scope

- 不新增指标规则引擎
- 不新增 `metrics.yml` 或独立指标平台
- 不修改编译器聚合规则
- 不新增审批、版本、治理流程
