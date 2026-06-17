---
doc_type: adr
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-11
---

# ADR-014 双层语义采用并行双门面 + 单一编译脊柱

## 状态

当前有效。明确 Cube 层与 Ontology 层的对外服务形态，约束 ADR-010 之后的运行时收口方向。

## 背景

双层语义（Cube 物理建模层 + Ontology 业务语义层）存在两种对外服务形态：

- **垂直收口**：Ontology 是唯一对外门面，所有消费（Agent、BI、API）只见业务语义，Cube 仅作内部编译依赖。
- **并行双门面**：Cube 直接服务 BI 类消费（维度模型是 BI 原生合约），Ontology 服务 Agent/自然语言问数，两层之间显式绑定。

2026-06 生产验收给出的事实是：并行消费已经存在——View 发布给 BI 走 Cube 层直出，飞书 Agent Loop 经 `list_cubes/describe_cube/query` 直接消费 Cube 并可降级 SQL 直查，official 问数链路则从 Ontology 入口经 `measure_refs` 落到 Cube 编译。问题不在分层本身，而在并行消费从未被宣布为架构决策，导致绑定靠模糊匹配、catalog 出现 YAML 与 published manifest 双源、治理在两个入口各管一段。

垂直收口的前提（消费者只有 Agent、业务术语体系先于数据建模存在）与本项目现实相反：建模工程师先建 Cube、BI 消费真实存在、冷启动是当前痛点。强行收口会使本体建设成为一切消费的前置阻塞。

## 决策

采用**并行双门面 + 单一编译脊柱**：

- Cube 层对 BI 类消费（View 发布、virtual dataset、SQL 工具、Agent 的 cube 级工具）直接提供服务。
- Ontology 层对 Agent/自然语言问数提供业务语义门面。
- 并行的只允许是**入口合约**；编译、治理、执行必须是同一根脊柱。

为此固化三条纪律：

1. **Cube 是唯一编译底座。** Ontology 不直接生成 SQL，只能经显式绑定落到 Cube 编译；BI 消费（含 View 发布）必须使用同一个编译器和同一份 published manifest，不得从 YAML 旁路直出。
2. **绑定显式化 + 发布期校验。** Object→Cube、Metric→Measure 一律落显式 ref；发布时断链即 blocker。模糊匹配只保留在建模态做推荐，不进入运行时解析。
3. **治理收口在编译产物上。** 两个门面进来，统一在 `post_compile`（resource_set / sql_hash）与 gateway access_context 这一个 choke point 上做访问决策；BI 路径同样必须穿过该收口。

## 结果与约束

- 运行时唯一 catalog 事实源是 active runtime snapshot manifest（承接 ADR-010）；semantic router、Agent 工具集、DevTools 回放、View 发布在运行时一律读 manifest catalog，YAML 仅保留建模态/preview 用途。
- Agent 语义工具集（`list_cubes/describe_cube/query`）对所有信道（飞书、DataChat Web）保持一致暴露，不再按信道差异化裁剪语义能力。
- BI 消费产物（virtual dataset 等）必须携带 release pin（发布版本引用），口径变更经重新发布传导，不允许隐式漂移。
- 运行时不再依赖加载期状态提升补丁（如 draft 强制 active）掩盖生命周期分叉；资产状态以 registry/release 为准。
- 演进优先级：P0 = 运行时 catalog 收口、显式绑定与发布期断链校验、信道工具集对齐；P1 = View 发布 release pin、发布后消费配置自动化、知识库随发布生长。

## 相关文档

- [双层语义绑定规范与 RLS 演进设计](../semantic-binding-and-rls.md)：本 ADR 的配套落地设计（绑定 Schema、发布校验矩阵、运行时收口、RLS 五构件）
- [ADR-010 生产语义资产采用 SQL Registry 作为事实源](ADR-010-semantic-sql-registry-production-source.md)
- [ADR-013 轻量权限中心与网关执行闭环](ADR-013-lightweight-access-governance.md)：治理收口所扩展的权限基线
- [ADR-008 BusinessMetric 采用语义公式而非执行公式](ADR-008-business-metric-semantic-formula.md)
- [ADR-011 数仓查询网关与本项目执行边界](ADR-011-dw-query-gateway-execution-boundary.md)
- [../README.md](../README.md)
