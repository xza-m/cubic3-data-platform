# 平台级前端重构 Backlog

统一约束：
- `KISS`：不改主路由，不造第二套系统
- `YAGNI`：先收壳层和高频旧页，不一次性全站重写
- `SOLID`：页面按任务模型分，不按接口堆页面
- `DRY`：共享页头、上下文条、工具栏、Inspector 和状态表达
- 仅语义层页面允许默认双栏 / 三栏 Inspector 工作台；平台其它页面统一保持单主区

页面模型与布局硬规则 v1.0：
- `Overview`：单主区
- `Inventory`：单主区；选中后可临时显示轻量预览，不默认常驻详情区
- `Studio`：主区 + 可持续摘要区
- `Canvas`：左资源 + 中画布 + 右 Inspector
- `Developer Workbench`：左资源树 + 中 workspace；只有任务明确需要持续调试上下文时才允许引入 Inspector
- 所有页面必须先归类页面模型，再决定布局；不能因为复用语义层组件就默认加右栏

## Phase 1. Platform Shell

### B-PLATFORM-1 AppLayout 收口
- 输出：
  - 顶栏只保留当前模块、全局搜索入口、通知、用户区
  - 侧栏只保留导航，不挂底部状态卡
  - 内容区成为主视觉焦点
- 验收：
  - 壳层不再显著强于内容区
  - 导航样式与语义中心 `workbench` 一致

### P-LOGIN-1 Login 单栏工作台入口
- 输出：
  - 单栏居中布局
  - 标题、说明、表单、次要帮助链接
  - 不出现环境卡、营销文案、辅助卡片
- 验收：
  - 登录页与主平台排版、控件、色温统一

### P-DASH-1 Dashboard Overview 化
- 输出：
  - `平台概览` 页头
  - 上下文条：数据源数 / 数据集数 / 语义对象数 / 失败任务数
  - 主面板：数据资产 / 语义建模 / 查询与运行
  - 当前焦点区：仅保留阻塞项
- 验收：
  - 不再出现欢迎语、泛化 KPI 卡矩阵、最近活动 feed

### T-PLATFORM-1 壳层测试闭环
- 输出：
  - `AppLayout` 单测
  - `Login` 单测
  - `Dashboard` 单测
  - 壳层 E2E
  - 登录页和控制台视觉回归
- 验收：
  - `npm run verify:platform-layout` 通过

## Phase 2. Data Inventory

### P-DATASOURCE-1 数据源页 Inventory 化
- 输出：
  - 单层筛选带
  - 轻列表
  - 单主区布局
- 状态：
  - 已完成，已通过 `verify:platform-data-inventory`

### P-DATASET-1 数据集页 Inventory 化
- 输出：
  - 单层筛选带
  - 轻列表
  - 单主区布局
- 状态：
  - 已完成，已通过 `verify:platform-data-inventory`

## Phase 3. Query / Analysis

### P-VISUAL-1 Visual Builder Studio 化
- 输出：
  - 单主区查询工作区
  - 内联查询摘要
  - 无右侧状态栏
- 状态：
  - 已完成，已通过 `verify:platform-query-workbench`

### P-CHAT-1 DataChat Workbench 化
- 输出：
  - 会话列表
  - 对话与结果区
  - 单主区内联上下文
- 状态：
  - 已完成，已通过 `verify:platform-query-workbench`

## Phase 4. Shared Cleanup

### B-CLEANUP-1 共享组件统一消费
- 输出：
  - `PageHeader / ContextBar / Toolbar / Inspector / EmptyState` 全平台复用
- 状态：
  - 已完成，平台 backlog 涉及页面已统一消费共享组件

### B-CLEANUP-2 垃圾代码清理
- 输出：
  - 删除旧设计分支、内联字面量、废弃注释与未使用组件
- 状态：
  - 已完成，已覆盖平台 backlog 涉及页面和共享抽象

### T-PLATFORM-2 平台重构最终校验
- 输出：
  - `verify:platform-layout`
  - `verify:platform-data-inventory`
  - `verify:platform-query-workbench`
  - `openspec validate refactor-platform-workbench-ui --strict`
- 状态：
  - 已完成，平台 backlog 三个专项验证与 OpenSpec 严格校验全部通过
