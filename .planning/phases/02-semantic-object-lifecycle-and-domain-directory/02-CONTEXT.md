# Phase 2: 语义对象生命周期与领域目录 - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

补齐语义中心中 `Cube / View / Domain / Recipe` 的生命周期感知、维护入口与领域目录治理能力，让语义资产从“已有对象”走向“可组织、可维护、可感知状态”的治理入口。Phase 2 重点是收敛 `Cube` 与 `Domain` 的正式建模体验、明确 `View` 与 `Recipe` 的产品定位、统一目录治理心智，并为后续语义运行闭环打下稳定的对象关系基础；不在本阶段扩展到编译、查询、物化、漂移运行能力本身，也不做同一领域内重复实例化同一个 `Cube` 的高级建模表达。

</domain>

<decisions>
## Implementation Decisions

### 对象定位与正式度
- **D-01:** `Cube` 和 `Domain` 是 Phase 2 的正式建模对象，生命周期、维护入口和治理能力优先围绕这两类对象完善。
- **D-02:** `View` 定位为一种特殊 `Cube`，Phase 2 只在信息架构与展示层尽量并入 `Cube` 体系，不要求立即重做底层对象模型与 API。
- **D-03:** `Recipe` 保持轻量消费对象，Phase 2 只要求具备列表、详情或定义入口、关联 `Cube` 展示，以及基础状态或标签表达，不扩展为重型建模器。

### 生命周期与状态心智
- **D-04:** 生命周期采用“统一展示心智、底层状态允许分化”的策略：用户侧统一感知草稿、可用、停用或归档、需处理等状态心智。
- **D-05:** `Cube / View` 在展示层尽量共用接近的生命周期表达；`Domain` 保持自身治理语义（如 `draft / active / archived`）；`Recipe` 只补最小状态感知。

### 领域归属与关系真相
- **D-06:** `Domain.cubes[]` 与领域画布是 `Cube` 归属关系的唯一真相，后续对象关系以领域定义为准，而不是以单个 `Cube` 字段为准。
- **D-07:** `Cube` 与 `Domain` 的关系按多对多理解，一个 `Cube` 可以被多个领域引用。
- **D-08:** `Cube.domain_id` 保留，但只作为投影字段，不再表示唯一主领域或唯一归属真相。
- **D-09:** Phase 2 暂不支持同一领域内重复实例化同一个 `Cube`；“同一个维度 Cube 在同一领域内以不同 join 条件多次出现”记为后续 join 建模增强主题。

### 领域目录与治理入口
- **D-10:** 领域目录在 Phase 2 主要承担治理看板职责：目录组织、搜索筛选、状态摘要、健康概览和对象发现。
- **D-11:** 领域目录不承担大量重型编辑动作；对象维护、画布编排、发布等操作适度下沉到详情页、建模页或领域画布。

### the agent's Discretion
- `domain_id` 投影字段在前后端接口中的兼容呈现方式，例如是补充 `domain_ids`、`domains` 还是仅在详情态回写摘要。
- `View` 在列表、详情、导航中的并入方式，只要不突破“展示层整合、底层模型暂不大动”的边界即可。
- `Recipe` 的最小状态标签、关联信息密度和详情页呈现方式。
- 领域目录中的 lens、排序、摘要卡片和健康提示文案。

</decisions>

<specifics>
## Specific Ideas

- 用户明确要求把 `Cube` 和 `Domain` 作为正式建模对象来收敛，而不是四类对象完全同级推进。
- 用户判断 `View` 本质上是一种特殊 `Cube`，Phase 2 更应考虑如何并入 `Cube` 体系，而不是继续把它当独立大模块膨胀。
- 用户明确接受 `Recipe` 只做轻量消费对象，不要求复杂编辑器、审批流或版本治理。
- 用户强调 `Cube` 与 `Domain` 本质上是多对多关系，不应再假设“一个 Cube 只有一个主领域”。
- 用户举例说明“事实表 Cube 在一个领域内可能需要多次关联同一维度 Cube 且 join 条件不同”，但接受该能力暂不纳入 Phase 2。
- 用户希望领域目录更像治理看板，而不是把所有生命周期动作都堆在目录页上。

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目范围与阶段目标
- `.planning/PROJECT.md` — 当前 brownfield 约束、语义层优先级和本轮不做事项。
- `.planning/REQUIREMENTS.md` — Phase 2 对应的 `SEM-01` 至 `SEM-05`、`DOM-01` 至 `DOM-04` requirement。
- `.planning/ROADMAP.md` — Phase 2 的目标、成功标准与排序理由。
- `.planning/STATE.md` — 当前项目状态、Phase 1 已锁定前提和 Phase 2 推进顺序。

### 语义中心架构与对象承载
- `docs/TECH_STACK_AND_ARCHITECTURE.md` — 当前 `React SPA + Flask API + PostgreSQL/Redis/RQ` 基线与语义中心所在系统边界。
- `docs/architecture/README.md` — 当前架构目录与语义中心相关设计入口。
- `docs/architecture/decisions/ADR-001-platform-baseline.md` — 平台分层、运行角色和不可随意突破的系统基线。
- `docs/architecture/decisions/ADR-002-semantic-assets-in-yaml.md` — `Catalog / Cube / Domain / View / Recipe` 以 YAML 为主承载的约束。
- `docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md` — 语义中心固定工作台页面模型，约束目录、建模、画布和工具页分工。
- `docs/architecture/decisions/ADR-005-domain-oriented-api-boundary.md` — `/api/v1/semantic/*` 的业务域边界和接口组织方式。

### 语义层产品设计输入
- `docs/prd/README.md` — PRD 目录的使用边界，提醒规划时区分设计输入与当前实现。
- `docs/prd/semantic_layer_prd.md` — 语义层对象模型、View/Recipe 设计、工作台页面与语义 API 设计输入。

### 验证与交付约束
- `docs/quality/testing.md` — 仓库统一验证入口与四层校验原则。
- `docs/semantic_verification.md` — 语义中心专项验证路径、浏览器烟测和状态契约。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/Semantic/CubeList.tsx`、`CubeStudio.tsx`、`CubeDetail.tsx`：已经具备 `Cube` 的列表、建模、详情与状态展示骨架，可继续作为正式建模对象的主入口。
- `frontend/src/pages/Semantic/DomainList.tsx`、`DomainModelingEntry.tsx`、`DomainCanvas.tsx`：已经具备目录、建模入口和领域画布，适合作为 Phase 2 的目录治理与关系编排基础。
- `frontend/src/pages/Semantic/ViewDetail.tsx`：已有 `View` 详情与发布摘要骨架，可作为“特殊 Cube”的展示整合起点。
- `frontend/src/pages/Semantic/DevTools.tsx` 与 `frontend/src/components/Semantic/DevTools/SemanticResourceTree.tsx`：已经把 `Recipe` 暴露为轻量定义资源，可扩展为最小可维护入口。
- `frontend/src/api/semantic.ts`：已经集中定义 `Cube / View / Domain / Recipe` 的前端类型和 API 访问，是收敛状态心智和多领域投影字段的主要前端落点。

### Established Patterns
- 后端继续沿用 `interfaces -> application -> domain -> infrastructure` 分层，`app/interfaces/api/v1/semantic.py` 维持薄接口层，具体编排落在 `app/application/semantic/*`。
- 语义资产继续以 YAML 仓储为主，`Cube / Domain / View / Recipe` 都通过语义定义仓储加载，不适合在 Phase 2 绕开现有承载方式另起一套持久化。
- 语义中心前端采用固定工作台模型：目录、Studio、Canvas、DevTools 各自承担不同职责，目录页不应演化为无边界的重型编辑器。
- 当前 `Cube` 详情里的领域归属会通过 `domain_repo` 反查，说明“从领域关系回推对象归属”已经存在现实基础，可据此推进“领域画布是真相”的方向。

### Integration Points
- `app/application/semantic/domain_modeling_service.py`：目录、领域、发布和领域关系变更的核心编排点。
- `app/application/semantic/domain_canvas_service.py`：领域画布节点、边和 `library_cubes` 的输出边界，是多领域关系与画布真相的关键接口。
- `app/application/semantic/semantic_definition_service.py`：`describe_cube`、`describe_view` 和对象摘要输出的中心，可承接 `domain_id` 投影、`View` 展示整合与 `Recipe` 关联回写。
- `app/application/semantic/cube_modeling_service.py`：`Cube` 草稿、创建、更新、激活、弃用的状态入口，是正式建模对象生命周期的现有基础。
- `frontend/src/pages/Semantic/DomainList.tsx`、`DomainCanvas.tsx`、`CubeDetail.tsx`、`ViewDetail.tsx`：Phase 2 前端交互的主要承载面。

</code_context>

<deferred>
## Deferred Ideas

- 同一领域内重复实例化同一个 `Cube`，并允许以不同 join 条件多次出现，延后到后续 join 建模增强阶段。
- 在底层对象模型和 API 层彻底把 `View` 并入 `Cube` 统一对象，当前只确定展示层收敛方向，不在 Phase 2 强推大改。
- `Recipe` 的复杂编辑器、审批流、版本治理或重型生命周期，明确不纳入 Phase 2。

</deferred>

---

*Phase: 02-semantic-object-lifecycle-and-domain-directory*
*Context gathered: 2026-03-25*
