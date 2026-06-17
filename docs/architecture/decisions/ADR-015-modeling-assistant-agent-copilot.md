---
doc_type: adr
status: accepted
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-14
---

# ADR-015 建模助手采用「Agent 广度 + Copilot 深度」双形态共享脊柱

> 计划草案建议编号 ADR-014，但该号已被 [ADR-014 双层语义双门面](ADR-014-dual-facade-single-spine-semantics.md) 占用，本决策顺延为 ADR-015。

## 状态

Accepted，2026-06-14 起生效。

## 背景

语义中心的「冷启动」是上层智能问数与 `DataAgent` 可用性的前置依赖：没有已发布的 Cube / 维度 / 指标，问数链路无米下锅。当前已有两条建模入口：

- **批量建模（广度）**：`ModelingBuildProjectService.scan_project` 产出待审候选队列，但其 `_deterministic_packages` 是硬编码 3 张演示表，无法真实扫描数据源。
- **单资产 Copilot（深度）**：`SemanticModelingCopilotService` / `SemanticModelingAgentApp` 已能就单个资产做引导式精修、字段证据收敛、Proposal 治理与发布门禁。

冷启动真正的瓶颈不是「能不能建一个资产」，而是：

- 面对几十上百张表时，如何**成批**发现候选并降低审核疲劳；
- 在没有任何已发布资产时，如何不依赖 LLM 也能先把骨架立起来（内网单机、LLM 可能不可用）。

需要固定一个产品形态决策：批量冷启动应该做成 Agent 还是 Copilot，二者关系如何。

## 决策

采用 **Agent 负责广度（批量冷启动）+ Copilot 负责深度（单资产精修），共享确定性工具链与 Proposal 治理脊柱，发布权永远在人**。

- **Agent（广度）= L2 监督式**：新增确定性执行核 `ModelingSourceScanner`，给定数据源 + 库，从 `TableCacheService` 真实表缓存按命名分层（`dim_/dwd_/dws_/ads_…`）规划，逐表 `get_table_schema` 取列 → `FieldCandidateService` 推断字段角色 → 组装 `ModelingAssetPackage`（带列快照），并做**确定性分诊**（confidence / risk / status：自动就绪 / 待补口径 / 高风险）。Agent 只产「待审队列」，不发布。
- **Copilot（深度）= 单资产精修**：候选包带 `evidence_bundle.schema_snapshot`（列快照）进入既有单资产 builder，离线可用，复用 Proposal 治理链。
- **共享脊柱**：两条形态共用 `FieldCandidateService`、`ModelingAssetPackage`、`refresh_package_review_state` 与 Proposal 发布门禁，不另起炉灶。
- **发布权在人**：Agent / Copilot 都不触碰发布闸门；最终发布仍是显式人工动作。

### degrade 策略（关键约束）

本轮 Agent 化**不强依赖 LLM**：扫描、分层、分诊全部是确定性启发式。LLM 规划只留接缝、不在主路径，保证无 LLM 时冷启动仍能闭环。

### 路由与兼容

`scan_project` 按来源择优、零回归降级：

1. scope 带 `source_id` + `database` 且 scanner 已注入 → 真实表扫描（新主路径）；
2. scanner 命中真实源但无可建模表 → 退回 `scope` 最小候选；
3. `recommendation_empty` → 手动选表回退；
4. 其余 / 未注入 scanner → 演示兜底（存量调用与测试零改动）。

`scanner` 在 `ModelingBuildProjectService.__init__` 为可选参数，DI 默认注入。

## 影响

- 批量冷启动从演示数据升级为真实表扫描 + 分诊，显著降低从 0 到第一批可审候选的成本。
- 前端 `BatchModelingWorkbench` 增加数据源 / 库选择与分诊分桶；未选真实源时维持演示行为。
- `project.scope` 新增 `source_id` / `database` / `table_prefixes?` / `table_allowlist?` / `max_tables?`（默认 20，硬上限 100）。
- 全程不碰 `dw-query-gateway` / RLS / 发布闸门。
- 后续可选增量：列级缓存、LLM 主题聚类与口径建议（本轮不做）。

## 参考

- `app/application/semantic/modeling_source_scanner.py`
- `app/application/semantic/modeling_build_project_service.py`
- `app/application/semantic/field_candidates/`
- `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
