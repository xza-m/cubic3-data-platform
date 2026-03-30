## 1. 平台基线与提案
- [x] 1.1 固定平台唯一设计母体、页面模型与壳层规则
- [x] 1.2 补充平台级重构 proposal / design / backlog / spec delta

## 2. Phase 1 壳层收口
- [x] 2.1 重构 `AppLayout`，移除装饰性背景和底部状态块，固定壳层契约
- [x] 2.2 重构 `Login`，统一为单栏工作台入口
- [x] 2.3 重构 `Dashboard`，固定为平台 `Overview`
- [x] 2.4 为 `AppLayout / Login / Dashboard` 补单测
- [x] 2.5 增加平台壳层视觉回归与浏览 E2E
- [x] 2.6 执行 `verify:platform-layout`

## 3. Phase 2 数据资产页迁移
- [x] 3.1 将 `Datasources` 收敛为 `Inventory`
- [x] 3.2 将 `Datasets` 收敛为 `Inventory`
- [x] 3.3 统一两页筛选条、列表、条件详情与上下文条
- [x] 3.4 补页面单测和专项校验

## 4. Phase 3 查询与分析页迁移
- [x] 4.1 将 `VisualBuilder` 收敛为 `Studio`
- [x] 4.2 将 `DataChat` 收敛为 `Developer Workbench / Analysis Workspace`
- [x] 4.3 清理旧的流程卡片、插画空状态和装饰性视觉
- [x] 4.4 补页面单测和专项校验

## 5. Phase 4 共享层与垃圾代码清理
- [x] 5.1 平台页面统一消费共享 `PageHeader / ContextBar / Toolbar / Inspector`
- [x] 5.2 清理页面内联设计字面量和旧版本残留组件
- [x] 5.3 更新文档与验收矩阵
- [x] 5.4 执行 `openspec validate refactor-platform-workbench-ui --strict`
