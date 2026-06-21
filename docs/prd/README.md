---
doc_type: prd-index
status: maintained
source_of_truth: secondary
owner: product
last_reviewed: 2026-06-09
---

# PRD 目录

本目录保存产品需求文档和较高层设计输入。
这些文档回答“为什么做、目标是什么、方案边界在哪里”，不直接等同于当前实现。

## 当前文件

- [应用中心 PRD](app_center_prd.md)
  - 聚焦应用中心的产品定位、运行型应用实例管理、调度执行和监控
  - 状态：设计文档，需结合当前代码确认落地范围
- [智能问数 / Data Agent PRD](data_agent_prd.md)
  - 聚焦交互型问数能力、多信道 Agent、DataChat 与飞书复用、Skill 体系整合
  - 状态：架构与产品设计输入，落地时需同时核对后端实现
- [查询中心 PRD](query_center_prd.md)
  - 主要是早期前端布局和交互草案
  - 状态：早期设计稿，不应直接视为当前 UI 基线
- [语义层建设 PRD](semantic_layer_prd.md)
  - 语义层目标、数据模型、API 和演进设计的核心来源之一
  - 状态：高价值设计文档，但部分章节仍需结合当前实现辨别是否已落地
- [语义建设工作台 PRD](semantic_cold_start_builder_prd.md)
  - 聚焦数据建模工程师如何基于业务域、数仓表、字段证据和已有语义资产冷启动建设可发布到语义中心的语义资产包
  - 状态：产品设计输入，当前收敛为统一“语义建设工作台”；快速单资产和批量冷启动只是同一工作台的两种模式。
  - 首期统一入口为 `/semantic/modeling-workbench`；快速单资产模式为 `/semantic/modeling-workbench/quick`；旧 `/semantic/modeling-copilot/new`、`/semantic/modeling-copilot/batch` 与 `/semantic/modeling-copilot/:sessionId` 不再注册兼容重定向
  - 发布校验首期已提供只读 release-preview API 契约；前端发布预演面板已消费 `workbench_state.release_preview`，后端先把候选 Spec 投影为临时 runtime manifest 并复用 `ExecutionCompilerPreviewService -> QueryCompiler` 生成物理 SQL，再通过可注入 gateway SQL dry-run 适配器对接执行面
- [语义平台生产级重构 Spec](semantic_platform_production_refactor_spec.md)
  - 跟踪方案 B 的生产级重构：SQL-only Registry、发布治理、Copilot 状态机、Runtime 快照、权限审计、测试隔离和三期任务规划
  - 状态：重构设计输入和进度跟踪入口，不代表当前已全部落地
- [通用元数据浏览器设计说明](universal_schema_browser_prd.md)
  - 聚焦异构数据源的统一元数据浏览交互设计
  - 状态：专题组件设计输入
- [权限中心产品方案与界面设计](access_permission_center_prd.md)
  - 固定轻量权限中心的产品口径、页面结构、白名单运营、权限审计和网关观测界面设计
  - 状态：当前方案，配合 ADR-013 与访问网关运行手册推进后端联调和前端落地
- [管理员诊断证据面板设计](admin_diagnostic_evidence_panel_prd.md)
  - 定义 SQL / YAML / JSON / Trace / Gateway telemetry / Secret 引用等技术证据在业务视图、诊断视图和原始证据视图中的分层展示、权限边界和组件模式
  - 状态：设计中，作为下一轮 UI 治理和管理员证据面板落地输入

## 使用建议

- 看当前实现，不要只看 PRD；请同时阅读 `../../README.md` 和 `../TECH_STACK_AND_ARCHITECTURE.md`
- 当 PRD 与代码冲突时，以当前代码和基线文档为准
- 当某项设计已经落地，应把“当前事实”补充到基线文档，而不是只留在 PRD

## 状态约定

- 设计中：主要用于表达目标、边界和方案，还不能直接代表现状
- 部分落地：已有代码实现，但仍需逐节核对是否完全一致
- 过期参考：保留设计思路，不应直接指导当前实现
