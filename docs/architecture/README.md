---
doc_type: architecture-index
status: maintained
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-04-25
---

# 架构设计目录

本目录保存“当前架构为什么这样设计”的正文说明。
它不替代 [技术栈与架构说明](../TECH_STACK_AND_ARCHITECTURE.md) 的现状基线，也不替代 `docs/prd/` 与专题设计文档中的变更说明。

## 适用范围

- 想理解系统边界、模块职责和运行拓扑
- 想知道前后端为什么这样拆分
- 想查看当前仍有效的架构决策记录

不适合：

- 查启动命令、端口、代理和排障细节
- 直接判断某个历史方案是否仍有效
- 把某次规划稿、专题设计稿或原型稿当作已落地事实

## 推荐阅读顺序

1. [system-overview.md](system-overview.md)：系统全景、能力域、运行路径
2. [backend.md](backend.md)：后端分层、依赖注入、异步任务与语义存储
3. [frontend.md](frontend.md)：前端路由域、页面模型、数据访问与验证策略
4. [decisions/README.md](decisions/README.md)：当前仍有效的架构决策记录
5. 双层语义架构约束：优先阅读 ADR-007 ~ ADR-009
6. 如果正在推进业务指标与分析指标的联邦追踪，优先对照 `README.md` 和 `TECH_STACK_AND_ARCHITECTURE.md` 中的 Phase 2 描述

## 当前文件

- [system-overview.md](system-overview.md)
  - 当前系统全景、主能力域、同步/异步/语义三条主路径
- [backend.md](backend.md)
  - Flask App Factory、依赖注入容器、后端分层与运行角色
- [frontend.md](frontend.md)
  - React SPA 路由结构、页面域、共享壳层与校验策略
- [decisions/README.md](decisions/README.md)
  - ADR 索引与维护规则
  - 当前新增双层语义架构约束：
    - 对齐检查（内部实现为 `Semantic Mapper`）只做只读投影与一致性检测
    - `BusinessMetric` 采用语义公式而非执行公式
    - 执行预览（内部实现为 `Execution Compiler Preview`）在第一阶段提供最小可执行性验证
  - 当前已进入 Phase 2 最小落地：
    - `BusinessMetric -> Measure` 双向追踪
    - `Measure -> BusinessMetric` 反向引用
    - `Cube -> Object / Metric` 反向回看
    - stale / impact 继续围绕指标联邦增强
  - 当前已补入 Phase 3 最小投影能力：
    - `BusinessRelation -> Join Path` 预览
    - `BusinessAction -> Event Fact Cube` 预览
    - 关系/动作的最小 stale 校验
  - 当前已补入 Phase 4 最小路由能力：
    - 语义路由与执行规划（内部实现为 `Semantic Router / Planner`）按对象、关系、动作、业务指标和最小意图词做多意图路由
    - 输出 `cube / knowledge / hybrid / tool / blocked` 路由结果
    - 生成 `planning_mode`、多步 planning steps、`dependencies`、`expected_outputs` 与最小可回溯执行计划
    - 已补入 `/api/v1/semantic-router/execute-plan`，将稳定 plan 直接下发到最小统一执行运行时
  - 当前已补入 Phase 5 最小执行编译统一能力：
    - 内部 `Execution Compiler` 统一提供 `SQL / Retrieval / Tool Call` 执行预览
    - `compile-preview / plan-preview` 返回统一执行预览结构
    - `execute` 提供最小统一运行时：`SQL / Retrieval / Tool` 已接入最小真实执行，其中 `Tool` 当前限制为只读工具
    - `execute` 同时返回统一 `governance_trace / audit_trace_id`，用于记录命中策略、角色与执行状态
    - 智能问数消息主链已优先尝试走语义路由与统一执行运行时，仅在未命中或执行失败时回退旧链路
  - 当前已补入 Phase 6 最小语义权限挂点：
    - 内部 `Policy Metadata` 作为对象 / 动作 / 业务指标的最小语义权限元数据
    - 语义路由与执行规划可按 `viewer_roles` 做最小权限阻断
    - 执行预览可返回 `allow / blocked` 执行结果
  - 当前前端已提供 `/semantic/ontology` 的业务语义工作台首期版本：
    - 覆盖对象、属性、关系、动作、业务指标、术语、语义权限的最小建模
    - 支持只读投影预览、指标联邦追踪、运行时路由预演、统一执行预览、最小治理挂点预览，以及业务语义与 `Cube` 的最小双向跳转
    - 运行时面板已可展示 `planning_mode`、主命中和多意图命中结果，帮助确认复杂问题会进入哪条执行链
    - 当前运行时面板已支持手动触发 `execute-plan`，直接查看最近执行结果、审计记录与执行回溯
    - 权限页已接入 `Policy Impact` 治理影响总览、真实治理挂点预演、最近治理执行结果和最近审计记录：前端直接消费语义路由、执行预览、`execute` 与 `policy-audit` 返回，展示授权与未授权角色下的 `allow / blocked` 结果、治理挂点状态、命中策略和执行状态
    - 权限页的最近审计记录已支持按 `决策 / 路由` 做最小筛选，便于聚焦订单域的放行、阻断与直连执行路径
    - 当前主编辑区已补入统一的“发布 / 影响 / 历史”面板，用于承接业务语义资产的发布链、影响分析和历史回看
    - 当前主编辑区已补入最近一次发布失败的内联展示，用于直接回看阻断原因，而不再只依赖 toast
    - 当前治理查询已补入 `/api/v1/governance/audit-traces` 列表接口，`Cube` 激活也已接入最小业务语义优先准入校验：认证 Measure 若缺少 `BusinessMetric` 反向引用，将阻止发布
    - 当前业务语义发布链已进一步收紧：业务指标、关系、动作、权限在发布前会校验依赖对象是否已激活、是否具备最小分析投影依据；校验失败会直接阻断发布
    - 智能问数后端消息主链已开始返回 `semantic_plan` 相关上下文；当前 v2 `/data-chat` 仍是占位页，尚未恢复完整聊天界面
    - 当前已补入订单域模板预览与一键应用入口：`/api/v1/ontology/templates/order-domain` 与业务语义工作台顶部操作区可快速生成订单域对象、属性、关系、动作、指标、术语和权限初始样板，作为后续复制到第二域的基线模板

## 与其他文档的分工

- 当前现状、脚本、端口：看 [../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)、[../QUICK_START.md](../QUICK_START.md)、[../STARTUP_GUIDE.md](../STARTUP_GUIDE.md)
- 产品目标和方案边界：看 [../prd/README.md](../prd/README.md)
- 设计草案和原型：看 [../reference-design/README.md](../reference-design/README.md)
- 历史重构和迁移背景：看 [../archive/README.md](../archive/README.md)
- 规划中变更：看 `docs/prd/README.md`、相关 ADR 与对应专题设计文档

## 维护规则

- 架构边界、运行拓扑、核心模块职责变化后，优先更新本目录和 `TECH_STACK_AND_ARCHITECTURE.md`
- ADR 只记录仍有效的当前决策；失效决策转入历史归档或在 ADR 中明确被替代
- 目录内文档以“当前态”为主，不追加一次性实施流水账
