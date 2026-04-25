# Change: 标准化语义建模平台

## Why
当前语义层已经具备查询、逻辑发布、漂移检测和最小指标说明能力，但 `Cube` 生命周期前半段缺失，画布仍偏关系浏览器，异构数据源运行时也没有形成完整闭环。  
这导致 Cube 更像开发者维护的 YAML 文件，而不是平台可管理、可运营的一等建模对象。

## What Changes
- 阶段一：以 `Cube` 为核心补全建模生命周期，引入 `source_id` 强绑定、`draft/active/deprecated` 状态、建模服务和建模 API，并打通 query/schema-sync/enum/dialect 的按数据源分发。
- 阶段一：将 `/semantic/canvas` 升级为建模工作台，支持从现有数据源浏览物理表、生成 Cube 草稿、创建/编辑/激活/弃用 Cube。
- 阶段一：扩展 `SemanticRegistry`，统一沉淀 Cube/View 的来源绑定、生命周期状态、发布状态、drift 状态和指标摘要。
- 阶段二：新增 `MetricSemanticsService`，将 `Cube.measures` 标准化为统一 `MetricInfo`，供前端、Agent 和 API 共用。
- 阶段二：统一前后端对象合同，包括 `CubeSummary`、`CubeDetail`、`CubeNodeState`、`MetricInfo`、`StateSummary`。

## Impact
- Affected specs: `semantic-layer`
- Affected code:
  - `app/domain/semantic/*`
  - `app/application/semantic/*`
  - `app/interfaces/api/v1/semantic.py`
  - `frontend/src/api/semantic.ts`
  - `frontend/src/pages/Semantic/*`
  - `frontend/src/components/Semantic/*`
  - `tests/unit/application/semantic/*`
  - `tests/integration/test_semantic_api.py`
