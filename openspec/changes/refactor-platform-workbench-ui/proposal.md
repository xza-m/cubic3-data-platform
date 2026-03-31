# Change: 统一全平台前端工作台设计语言与页面模型

## Why
当前前端已经形成两条明显冲突的体验路线：

- 语义中心逐步收敛到 `workbench` 工作台语言，强调对象、状态、关系和调试
- 全局壳层、控制台、查询中心、智能问数、数据中心等页面仍保留旧版“通用 SaaS 后台 / 模板化管理页”模式

这导致平台存在明显断层：

- 登录页、壳层、控制台、语义中心、旧业务页之间存在“换产品”感
- 页面职责不按任务模型组织，继续放大“历史版本遗留 + 垃圾代码”
- 共享 token 与共享组件虽然存在，但页面仍大量手写第二套 layout 和视觉语言

如果继续在现状上叠加功能，会持续放大以下问题：

- 平台定位仍像“通用后台”，而不是“企业数据平台工作台”
- 新旧页面继续并存，团队无法判断哪套模式是标准答案
- 页面设计、共享组件和测试守护无法形成统一闭环

## What Changes
- **ADDED** Platform Workbench Design Baseline：以现有语义中心 `workbench` 为全平台唯一母体，统一壳层、页面模型、状态与排版规则
- **ADDED** Platform Page Model Contract：冻结全平台五类页面模型：`Overview / Inventory / Studio / Canvas / Developer Workbench`
- **ADDED** Platform Shell Contract：重构 `AppLayout / Login / Dashboard`，将全局壳层与平台首页纳入统一工作台语言
- **ADDED** Legacy Page Migration Backlog：为 `Datasets / Datasources / VisualBuilder / DataChat` 提供迁移顺序与验收标准
- **MODIFIED** frontend-ui Spec：新增平台级页面模型、壳层统一、视觉守护与共享组件消费要求

## Deliverables
- 平台级重构提案、设计文档与任务拆解
- 一份面向实现的前端 backlog 文档，覆盖壳层、旧页迁移、共享组件清理与验证
- `frontend-ui` spec delta，约束全平台后续页面开发
- Phase 1 的壳层实现与对应测试闭环
- Phase 2 的数据资产页 `Inventory` 迁移与对应专项校验
- Phase 3 的查询与分析页工作台化迁移与对应专项校验
- Phase 4 的共享组件收口、文档更新与最终验收

## Progress
- 已完成：Platform Phase 1，`AppLayout / Login / Dashboard`
- 已完成：Platform Phase 2，`Datasources / Datasets`
- 已完成：Platform Phase 3，`VisualBuilder / DataChat`
- 已完成：Platform Phase 4，共享组件收口、文档更新与最终校验

## Impact
- Affected specs:
  - `frontend-ui`
- Affected code:
  - `frontend/src/components/Layout/AppLayout.tsx`
  - `frontend/src/pages/Login.tsx`
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/Datasets.tsx`
  - `frontend/src/pages/Datasources.tsx`
  - `frontend/src/pages/QueryCenter/VisualBuilder.tsx`
  - `frontend/src/pages/DataChat.tsx`
  - `frontend/src/components/business/*`
  - `frontend/src/components/ui/*`
  - `frontend/src/index.css`
  - `frontend/tests/e2e-node/*`
