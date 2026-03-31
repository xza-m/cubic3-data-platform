# Phase 2: 语义对象生命周期与领域目录 - Research

**Date:** 2026-03-25
**Status:** Complete

## Objective

回答一个问题：为了把 Phase 2 规划好，我必须先看清哪些现有语义资产、对象关系约束和前后端治理边界。

## Current Baseline

- 语义中心的对象与 API 骨架已经存在，并不需要从零造新模块：
  - `app/interfaces/api/v1/semantic.py`
  - `app/application/semantic/semantic_definition_service.py`
  - `app/application/semantic/cube_modeling_service.py`
  - `app/application/semantic/domain_modeling_service.py`
  - `app/application/semantic/domain_canvas_service.py`
  - `app/application/semantic/view_publish_service.py`
- 前端已经具备固定工作台页面模型，页面职责基本成型：
  - `frontend/src/pages/Semantic/CubeList.tsx`
  - `frontend/src/pages/Semantic/CubeStudio.tsx`
  - `frontend/src/pages/Semantic/CubeDetail.tsx`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainModelingEntry.tsx`
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `frontend/src/pages/Semantic/ViewDetail.tsx`
  - `frontend/src/pages/Semantic/DevTools.tsx`
- 语义资产仍然以 YAML 仓储为主承载，当前 Phase 2 没有必要新增第二套持久化：
  - `docs/architecture/decisions/ADR-002-semantic-assets-in-yaml.md`
- 当前验证资产已经覆盖语义服务、API、页面与浏览器烟测：
  - `tests/unit/application/semantic/test_domain_modeling_service.py`
  - `tests/unit/application/semantic/test_domain_canvas_service.py`
  - `tests/unit/application/semantic/test_semantic_definition_service.py`
  - `tests/unit/application/semantic/test_view_publish_service.py`
  - `tests/integration/test_semantic_api.py`
  - `frontend/src/pages/Semantic/DomainList.page.test.tsx`
  - `frontend/src/pages/Semantic/CubeList.page.test.tsx`
  - `frontend/src/pages/Semantic/DevTools.page.test.tsx`
  - `frontend/tests/e2e-node/domain-catalog.spec.ts`
  - `frontend/tests/e2e-node/domain-publish.spec.ts`
  - `frontend/tests/e2e-node/cube-browse.spec.ts`
  - `frontend/tests/e2e-node/semantic.visual.spec.ts`

## Key Findings

### 1. `Cube / Domain` 已经是正式建模入口，但“归属真相”和“投影字段”仍然混在一起

- `DomainModelingService` 已把 `Domain.cubes[]` 和领域发布作为对象关系真相。
- `DomainCanvasService` 也是按 `domain.cubes` 生成领域节点与 `library_cubes`。
- 但 `SemanticDefinitionService._resolve_cube_domain()` 仍只返回单个 `domain_id / domain_name` 投影，前端类型也仍然以单领域心智消费。
- 这意味着 Phase 2 不该推翻现有模型，而应该：
  - 保持 `Domain.cubes[]` / 领域画布是真相
  - 保留 `Cube.domain_id` 兼容投影
  - 额外补出多领域摘要，让目录和详情页不再假装“一对一”

### 2. `View` 已经在行为上接近“特殊 Cube”，但只适合做展示层收敛

- 当前 `View` 有自己的详情页、发布链路、物化状态和漂移摘要。
- `SemanticDefinitionService.describe_view()` 已能输出 `publish_summary` 与 `drift_summary`。
- `ViewPublishService` 也已经把 `View` 发布到数据集注册表，而不是简单静态对象。
- 因此 Phase 2 最合理的范围是：
  - 在信息架构、状态标签和关联展示上尽量并入 `Cube`
  - 不在本阶段重做底层仓储、API 或对象模型统一

### 3. `Recipe` 现在只具备轻量消费资产雏形，适合继续保持轻量

- 目前后端只提供 `recipes` 列表接口；前端主要通过 `DevTools` 树查看。
- `SemanticDefinitionService.describe_cube()` 已经能把 `Recipe` 示例回挂到 `Cube` 详情。
- 这说明 `Recipe` 已经具备“被消费”的基础，但还不是完整建模对象。
- Phase 2 更适合补：
  - 最小状态标签
  - 关联 `Cube` 摘要
  - 轻量定义浏览入口
- 不适合把 `Recipe` 扩成新的复杂编辑器或审批流。

### 4. 领域目录已经是治理看板，不应倒退回“大而全的目录页”

- `DomainList.page.test.tsx` 已明确约束：领域目录不承载内联新建领域表单，重动作要跳到建模入口。
- 当前目录页已经具备目录浏览、搜索、摘要面板和治理透镜。
- 这与用户在 discuss 阶段锁定的方向一致：目录页负责发现、组织、状态概览和导航，而非所有编辑动作。
- 规划上应该继续加强目录治理心智，而不是把画布、建模、发布都重新塞回目录页。

### 5. 生命周期状态已经存在，但四类对象的状态语义并不一致

- `Cube`：`draft / active / deprecated`
- `Domain`：`draft / active / archived`
- `View`：更多依赖 `publish_status`、`drift_summary`
- `Recipe`：几乎没有显式生命周期表达
- 因此 Phase 2 不应强行统一底层状态枚举，而应统一：
  - 列表 / 详情 / 目录的展示心智
  - `state_summary` 的主要字段
  - “可用 / 待处理 / 已停用”这类用户可感知标签

### 6. 现有测试资产足够支撑 Phase 2，不需要新发明验证框架

- 仓库已经有语义中心固定验证入口：
  - `make test-regression-semantic`
  - `make verify-semantic`
- 后端服务层和 API 层已有覆盖，前端也已有目录、画布、Cube 列表、DevTools 的页面测试和视觉/浏览器回归。
- Phase 2 的主要验证缺口不在“缺框架”，而在：
  - `ViewDetail` 的页面回归
  - `CubeDetail` 的领域投影与跨页导航回归
  - 多领域投影字段的 API 契约测试

## Recommended Implementation Shape

### Backend

- 继续复用现有 YAML 仓储与 `interfaces -> application -> domain -> infrastructure` 分层，不新增数据库表或新的语义持久化方式。
- 以 `Domain.cubes[]` 和领域画布作为关系真相，围绕 `SemanticDefinitionService` 增加多领域投影摘要，例如：
  - 保留 `domain_id / domain_name`
  - 增补 `domain_ids`、`domains` 或等价摘要字段
- 把生命周期对齐重点放在 `state_summary` 与摘要接口，而不是试图统一 `Cube / View / Domain / Recipe` 的底层状态机。
- `View` 继续走现有对象模型与发布服务，但在摘要、导航与详情结构上向 `Cube` 靠拢。
- `Recipe` 继续保持轻量，只补足列表/详情或定义入口、关联对象和最小状态。

### Frontend

- 保持现有工作台页面职责：
  - 目录页做治理和导航
  - Studio / Canvas 做建模与编排
  - DevTools 做定义与工具浏览
- `CubeList / CubeDetail / CubeStudio` 需要从“单领域归属”升级为“多领域摘要 + 单字段投影兼容”。
- `DomainList` 继续强化目录、搜索、透镜和治理摘要，不新增内联重型编辑。
- `ViewDetail` 应补入统一的对象摘要、状态与跨页关系链接。
- `DevTools` 继续承担 `Recipe` 的轻量浏览与消费入口，并补足关联感知。

### Docs / Runtime

- Phase 2 不改平台运行拓扑，不新增调度或异步执行底座。
- 需要同步回写的文档重点会是：
  - `docs/semantic_verification.md`
  - `docs/TECH_STACK_AND_ARCHITECTURE.md`
  - `docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md`
  - `docs/prd/semantic_layer_prd.md`（如果当前实现与设计输入差异需要标注）

## Risks And Planning Consequences

### 风险 1：如果强行把 `View` 彻底并入 `Cube`，Phase 2 会变成对象模型重构

- 后果：范围直接从“生命周期与目录治理”膨胀到 API 与仓储统一。
- 规划结论：只做展示层和摘要层收敛，不做底层统一。

### 风险 2：如果仍然只返回单 `domain_id`，前端无法真实表达多领域引用

- 后果：目录、详情和后续问数上下文会继续基于错误的一对一心智。
- 规划结论：保留 `domain_id`，但必须补多领域投影摘要。

### 风险 3：如果把领域目录做成重型编辑器，会与建模页和画布职责冲突

- 后果：信息架构混乱，维护点重复。
- 规划结论：目录页做治理看板，重动作下沉。

### 风险 4：如果在 Phase 2 就支持“同领域重复实例化同一 Cube”，范围会失控

- 后果：需要引入 join 别名、节点实例 ID 和更复杂的领域关系表达。
- 规划结论：该能力继续延期，不进入当前计划。

## Recommended Plan Split

### Wave 1

- `02-01` 语义对象关系真相与生命周期摘要后端对齐
- `02-02` 领域目录 / 画布契约与 `View / Recipe` 轻量治理入口收敛

### Wave 2

- `02-03` 语义工作台前端对齐与跨页导航收敛

### Wave 3

- `02-04` 语义专项回归、浏览器 smoke 与文档收口

## Validation Architecture

- 快速反馈优先使用语义专项回归入口：
  - `make test-regression-semantic`
- 后端定向回归可复用：
  - `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_domain_modeling_service.py tests/unit/application/semantic/test_domain_canvas_service.py tests/unit/application/semantic/test_semantic_definition_service.py tests/integration/test_semantic_api.py`
- 阶段级交付入口：
  - `make verify-semantic`
  - 文档改动后补 `make verify-docs`
- 仍需人工验证的部分：
  - 可写语义目录中的真实 YAML 发布 / 更新副作用
  - 多领域投影在真实工作台导航中的可理解性

## Research Complete

- 当前代码已经具备 Phase 2 所需的大部分对象和页面骨架，真正的工作不是“造新系统”，而是把对象关系、生命周期摘要和治理入口收敛成稳定的一套心智。
- Phase 2 的边界应该坚定控制在“对象治理与目录化”内，而不是提前吞下运行闭环或高级 join 建模。

---

*Research completed: 2026-03-25*
