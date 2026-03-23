# Change: 重构语义中心信息架构并引入轻量领域 Catalog

## Why
当前语义中心已经具备 `Cube / View / Domain / DevTools` 的基础能力，但前端信息架构仍存在明显边界混用：

- `Cube` 详情与领域画布双向跳转，单模型管理和领域建模耦合过深
- `View` 在产品认知上属于特殊语义模型，但页面结构仍表现为附属对象
- 领域入口缺少正式的 `catalog -> domain` 结构，无法按业务目录管理同组领域
- “领域管理”与“领域目录”职责重叠，用户需要在两个页面之间理解同一批领域对象
- 领域画布左右双侧栏常驻，导致核心建模区域过窄
- `Schema Drift` 的定义和状态反馈分散，用户难以理解“检测了什么、结果意味着什么”
- 旧的全局关系画布入口仍残留在导航中，增加认知噪声

如果继续在当前结构上扩展，会持续放大导航歧义、职责交叉和维护成本。

## What Changes
- **ADDED** Semantic Center IA Freeze：冻结语义中心的一级导航、页面职责和跳转边界
- **ADDED** Unified Semantic Model Entry：统一 `Cube` 与 `View` 为“语义模型”，通过 `kind` 区分，而不是拆分独立一级页面
- **ADDED** Lightweight Domain Catalog Model：引入轻量两层 `catalog -> domain` 模型，作为领域目录的正式数据结构
- **ADDED** Domain Catalog As Single Management Entry：取消独立“领域管理”工作区，将单领域生命周期管理合并进目录详情区
- **ADDED** Dedicated Domain Modeling Entry：保留独立“领域建模”模块，负责创建领域草稿并进入画布
- **ADDED** Domain Canvas Focused Layout：收敛领域画布为“中心画布优先”的建模页，弱化常驻侧栏
- **ADDED** Drift Visibility Rules：统一 Schema Drift 的定义说明、摘要展示和检测反馈路径
- **REMOVED** Legacy Global Relation Canvas Entry：移除无实际独立职责的旧关系画布导航概念

## Impact
- Affected specs: `semantic-modeling`
- Affected code:
  - `app/application/semantic/domain_modeling_service.py`
  - `app/interfaces/api/v1/semantic.py`
  - `app/infrastructure/semantic/domains/*`
  - `frontend/src/components/Layout/AppLayout.tsx`
  - `frontend/src/App.tsx`
  - `frontend/src/pages/Semantic/CubeList.tsx`
  - `frontend/src/pages/Semantic/CubeDetail.tsx`
  - `frontend/src/pages/Semantic/CubeStudio.tsx`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainModelingEntry.tsx`
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `frontend/src/pages/Semantic/DevTools.tsx`
  - `frontend/src/components/Semantic/DevTools/SchemaSyncTab.tsx`
  - `frontend/src/api/semantic.ts`
