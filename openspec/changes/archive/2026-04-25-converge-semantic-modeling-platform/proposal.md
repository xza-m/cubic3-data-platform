# Change: 语义建模平台收敛实施

## Why
当前语义层和领域建模主链路已经具备可用形态，但仍处于“能力已出现、边界未完全冻结”的状态。现有问题集中在：页面职责仍可能回流混用、运行环境一致性不足、前端关键路径烟测尚未形成固定门禁、`SemanticRegistry` 仍偏工程补丁、主链路验收缺少统一收口。继续扩展能力会放大这些问题。

## What Changes
- **ADDED** Semantic Modeling Convergence：冻结 `Cube 管理 / Cube 详情 / Cube Studio / Domain 画布` 的职责边界与跳转链路。
- **ADDED** Runtime Convergence Rules：固定多 Cube 查询、Domain 发布、View 逻辑发布、跨数据源约束等主链路规则。
- **ADDED** Verification Convergence：为语义中心建立固定验证流程，至少包括 `pytest`、`tsc`、`build` 与三条关键浏览器烟测。
- **ADDED** Registry Formalization：将 `SemanticRegistry` 从运行时兼容逻辑收敛为正式迁移管理对象。
- **ADDED** End-to-End Acceptance：要求以三条主链路完成最终验收，而不是只看单测和构建。

## Impact
- Affected specs: `semantic-modeling`, `frontend-ui`
- Affected code:
  - `app/application/semantic/*`
  - `app/domain/semantic/*`
  - `app/domain/entities/semantic_registry_entry.py`
  - `app/infrastructure/repositories/semantic_registry_repository.py`
  - `app/interfaces/api/v1/semantic.py`
  - `frontend/src/pages/Semantic/*`
  - `frontend/src/components/Semantic/*`
  - `frontend/tests/e2e/*`
  - `tests/unit/application/semantic/*`
  - `tests/integration/test_semantic_api.py`
