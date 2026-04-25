## Context
本次变更不再以“修旧页面视觉细节”为目标，而是将语义中心已验证的 `workbench` 设计语言提升为全平台唯一标准。

当前问题不是某一页不好看，而是：

- 壳层、登录页、控制台、旧业务页和语义中心至少并存三套视觉与布局逻辑
- 全局页面没有固定的任务模型，导致 Overview、列表页、编辑页、工作台页边界混乱
- 共享 token 存在，但并未真正约束页面结构与组件消费

## Goals / Non-Goals
- Goals:
  - 固定全平台页面模型与壳层规则
  - 收口 `AppLayout / Login / Dashboard`
  - 让旧业务页逐步映射到五类页面模型
  - 为每个阶段建立单测、视觉回归和 UI 组合校验闭环
- Non-Goals:
  - 不修改后端业务能力域与主路由
  - 不新增一级导航
  - 不一次性重写所有旧页面
  - 不在本次引入新的视觉风格或第二套设计系统

## Decisions
- Decision: 语义中心 `workbench` 是唯一母体
  - Why: 它已经是当前仓库里最接近目标产品气质的实现
  - Alternatives considered:
    - 保留现有壳层并只 patch 旧页面
      - 缺点：会继续留下“壳层与内容层冲突”

- Decision: 平台只允许五类页面模型
  - Why: 先统一任务模型，再统一布局和视觉
  - Alternatives considered:
    - 按资源对象分别造页面
      - 缺点：容易回到 CRUD 后台

- Decision: 只有语义层允许双栏或三栏 Inspector 工作台
  - Why: `CubeStudio / DomainCanvas / DevTools` 这类语义页需要围绕对象摘要、Join、调试结果持续工作，其它平台页的主任务仍是浏览、筛选和进入处理
  - Alternatives considered:
    - 全平台统一采用中间主区 + 右侧状态区
      - 缺点：会把非语义页也做成“工作台套壳”，造成平台页面普遍拥挤、主区不突出

- Decision: 页面必须先归入页面模型，再决定是否需要 Inspector
  - Why: 当前偏差的根因不是组件不统一，而是把语义层布局直接外推成平台默认模板
  - Alternatives considered:
    - 先按页面现状微调布局
      - 缺点：容易继续受历史版本误导，无法稳定收敛

- Decision: Phase 1 先做壳层、登录、控制台
  - Why: 这三处决定用户对整个平台的第一印象，且当前断层最明显
  - Alternatives considered:
    - 先清旧业务页
      - 缺点：新壳仍旧冲突，收益会被抵消

- Decision: 每个 phase 都要有独立校验脚本
  - Why: 平台级重构不能只依赖 `build` 和零散单测
  - Alternatives considered:
    - 只复用 `verify:ui`
      - 缺点：无法约束页面模型与视觉守护

## Phase Design Contract
### Platform Page Model Baseline v1.0
- `Overview`
  - 默认布局：单主区
  - 约束：不出现推荐路径、入口卡矩阵、默认右侧状态区
- `Inventory`
  - 默认布局：单主区
  - 约束：选中后可临时显示轻量预览，但不能默认常驻大详情区
- `Studio`
  - 默认布局：主区 + 可持续摘要区
  - 约束：只有单对象编辑页允许稳定右侧 Inspector
- `Canvas`
  - 默认布局：左资源 + 中画布 + 右 Inspector
  - 约束：关系建模页专用，不外推到普通列表和概览页
- `Developer Workbench`
  - 默认布局：左资源树 + 中 workspace
  - 约束：只有任务明确需要持续调试上下文时才引入 Inspector，不能把右栏当默认模板

### Route Layout Mapping v1.0
- `/login`
  - 单主区
- `/dashboard`
  - `Overview`
  - 单主区
- `/datasources`
  - `Inventory`
  - 单主区
- `/datasets`
  - `Inventory`
  - 单主区
- `/queries/visual-builder`
  - `Studio`
  - 单主区工作区优先，内联摘要，不默认右栏
- `/data-chat`
  - `Developer Workbench / Analysis Workspace`
  - 左会话 + 中主区，不默认右栏
- `/semantic/overview`
  - `Overview`
  - 单主区
- `/semantic/cubes`
  - `Inventory`
  - 单主区，选中后可出轻预览
- `/semantic/cubes/new`
  - `Studio`
  - 左步骤 + 中任务 + 右摘要
- `/semantic/cubes/:name/edit`
  - `Studio`
  - 左步骤 + 中任务 + 右摘要
- `/semantic/domains`
  - `Inventory`
  - 目录/资源树 + 中主区，可保留轻摘要，但不能压缩主区
- `/semantic/modeling`
  - `Overview + Entry`
  - 单主区或双区入口，不默认右栏
- `/semantic/domains/:id`
  - `Canvas`
  - 左资源 + 中画布 + 右 Inspector
- `/semantic/tools`
  - `Developer Workbench`
  - 左资源树 + 中 workspace，可按任务引入 Inspector

### Phase 1: Platform Shell
- 页面：
  - `AppLayout`
  - `Login`
  - `Dashboard`
- 目标：
  - 壳层降存在感，内容区成为主角
  - 登录与主平台共享同一产品气质
  - 控制台从“欢迎 + 卡片”改为 `Overview`
- 约束：
  - 不再使用装饰性背景、状态卡、欢迎语
  - 顶栏只保留当前模块、全局搜索入口、用户区、通知入口
  - 侧栏只保留导航，不挂状态卡

### Phase 2: Data Inventory
- 页面：
  - `Datasources`
  - `Datasets`
- 目标：
  - 统一为 `Inventory` 页面模型
  - 去掉大 KPI 卡与传统 CRUD 详情页感
  - 保持单主区，不默认显示右侧条件详情

### Phase 3: Query / Analysis
- 页面：
  - `VisualBuilder`
  - `DataChat`
- 目标：
  - 分别映射到 `Studio` 与 `Developer Workbench / Analysis Workspace`
  - 不再沿用流程卡片和聊天产品装饰风格
  - 保持单主区工作区，不复用语义层的右侧状态面板

### Phase 4: Shared Cleanup
- 范围：
  - 共享组件
  - 共享 token
  - 页面级 hooks
  - 删除废弃实现

## Risks / Trade-offs
- 平台壳层收口可能影响现有 E2E 选择器
  - Mitigation: Phase 1 增加壳层专用 `data-testid` 和浏览用例

- 旧页面迁移会暴露更多视觉与布局分叉
  - Mitigation: 先固定页面模型和共享组件，再迁页

- 共享组件下沉容易过度抽象
  - Mitigation: 只抽 `PageShell / Header / ContextBar / Toolbar / Inspector / EmptyState`，不抽页面私有业务块

- 旧版 workbench 认知仍可能反向影响后续设计判断
  - Mitigation: 明确“平台默认单主区”和“页面先归类、再定布局”为硬规则，并在全局设计语境与 backlog 中重复声明

## Migration Plan
1. 建立平台级 OpenSpec change 与 backlog
2. Phase 1：重构 `AppLayout / Login / Dashboard` 并补测试闭环
3. Phase 2：迁移 `Datasources / Datasets`
4. Phase 3：迁移 `VisualBuilder / DataChat`
5. Phase 4：统一共享组件消费，清理历史遗留

## Open Questions
- 平台控制台中的“最近操作”是否需要按模块分组
- 全局搜索在 Phase 1 是入口占位还是直接接入查询中心
