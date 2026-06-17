---
doc_type: adr
status: accepted
source_of_truth: primary
owner: engineering
last_reviewed: 2026-05-29
---

# ADR-011 保留 dw-query-gateway 作为生产数仓查询执行网关

## 状态

Accepted，2026-05-29 起生效。

## 背景

`cubic3-data-platform` 已经承载语义建模、语义路由、执行编译、Principal / RoleBinding / DataPolicy、治理审计和平台控制台能力。与此同时，`dw-query-gateway` 已经在线上承载真实 Agent 用户的数仓查询链路，并具备 API 控制面、Worker 执行面、PostgreSQL 查询队列、租约恢复、结果对象、健康检查、readyz、telemetry 和 MaxCompute 访问能力。

仓库中曾出现过“将 `dw-query-gateway` 查询执行面吸收到 `cubic3-data-platform`”的 OpenSpec 草案。该方向适合开发早期降低跨服务成本，但在 `dw-query-gateway` 已有线上用户和运行态经验后，会引入重复执行面、重复观测口径、凭据边界扩大和发布 blast radius 增大的风险。

## 决策

`cubic3-data-platform` 保持为语义治理控制面和平台控制台；`dw-query-gateway` 保持为生产数仓查询执行网关。

生产查询链路的职责固定为：

```text
Agent / 应用
  -> cubic3-data-platform
     - Ontology / Cube / Semantic Router
     - Execution Compiler / QueryDSL
     - Principal / RoleBinding / DataPolicy
     - PolicyDecision
     - GatewayAccessContext / TicketPreview / 治理审计
     - 网关观测 UI
  -> dw-query-gateway
     - 可信 GatewayAccessContext 校验
     - SQL guard 与资源集合复核
     - CredentialBinding 与 MaxCompute 凭据解析
     - query job / worker / lease / result / export
     - runtime telemetry / healthz / readyz / query events
  -> MaxCompute
     - RAM / Project Role / Object ACL 物理兜底
```

`cubic3-data-platform` 不再保留内部 `query_execution` 作为查询执行面、备用执行面或测试执行面。本轮改造会下线 `/api/v1/query-execution/*`、`query_execution_jobs` 队列、`query_execution_worker`、本仓执行结果对象和对应 OpenAPI / Makefile / 测试入口。需要正式、用户或 Agent 发起、并要求审计和治理的数仓查询，统一通过 `dw-query-gateway` 提交和观测。

`cubic3-data-platform` 仍保留数据源连接器 SPI：用于异构数据源连接测试、库表 / schema 浏览、小样本预览、SQL Lab、查询工作台的连接器型能力，以及建模辅助中的元数据读取。这些 adapter 不承担生产数仓查询网关职责，不维护 gateway 的队列、Worker、结果对象或运行态指标。

## 可观测边界

- `dw-query-gateway` 是执行运行态指标的事实源，负责产出 Worker 心跳、队列积压、运行中查询、等待耗时、执行耗时、SQL guard 拦截、MaxCompute timeout / access denied、export 成功失败和 query events。
- `cubic3-data-platform` 可以提供“网关观测”页面，作为薄展示层或 BFF，消费 `dw-query-gateway` 的 telemetry / readyz / query events API，并与平台侧 `semantic_trace`、`policy_decision`、`principal_id`、`data_level` 和 `sql_hash` 做关联。当前 BFF 端点为 `/api/v1/governance/gateway/observability`，内部聚合 gateway 的新版 overview、timeseries、breakdowns、contract-completeness、result/export/storage、security、workers 和 query-runs 指标。
- `cubic3-data-platform` 可以对 gateway telemetry / readyz 做基础告警评价，用于控制台可视化：稳定性低于阈值、readyz 非健康、等待队列积压、排队等待过长、timeout / rejected / export failure / publish conflict 等。但告警输入仍以 gateway 返回为准，平台不生成第二套 Worker 或 query counter。
- `cubic3-data-platform` 不应复制 `dw-query-gateway` 的 Worker 状态、query_events 或 runtime counters 作为第二套事实源。若为前端体验做缓存，必须标明来源和刷新时间，且不得替代 gateway 侧诊断。

## 约束

- `data-platform` 不保存真实 RAM User、AK/SK、CredentialBinding 密钥值或 MaxCompute 物理授权。
- `data-platform` 只产出不可直接泄露凭据的 `GatewayAccessContext` / preview / ticket 材料。
- `dw-query-gateway` 不解释业务语义，不维护平台角色，不计算 DataPolicy；它只校验平台传入的可信执行材料并执行数仓查询。
- SQL Lab、查询工作台和异构数据源查询使用本仓 DataSource Adapter SPI；当它们发起正式受治理数仓查询时，应通过 `dw-query-gateway`，不能绕开 gateway 形成第二套生产查询执行链路。
- 若未来要废弃 `dw-query-gateway`，必须另起迁移 ADR，覆盖用户迁移、CLI 协议、历史 query/result、telemetry、CredentialBinding、Worker 运行、runbook 和回滚策略。

## 取舍

### 方案 A：独立 gateway + 平台控制台，采纳

优点：

- KISS：生产执行继续使用已有线上网关，只补清控制面协议。
- YAGNI：不提前把线上 gateway 用户迁移到更重的 all-in-one 平台。
- SOLID：语义治理、凭据执行、物理权限和可视化入口职责分明。
- DRY：避免长期维护两套 Worker、lease、result object、telemetry 和运维 runbook。

缺点：

- 需要维护 `GatewayAccessContext` / ticket / trace 传递协议。
- 本地开发和端到端联调需要处理跨服务依赖。

### 方案 B：全部迁入 data-platform，未采纳

优点是单仓部署心智更简单；但当前会放大平台复杂度，并让语义建模、权限、凭据、查询执行、结果分发、运行态观测全部压到同一发布单元。考虑 `dw-query-gateway` 已上线，该方案不符合当前阶段的 YAGNI 和风险控制原则。

## 后续影响

- `openspec/changes/integrate-gateway-query-execution` 中的 all-in-one 表述视为历史草案，不再作为目标态。
- `docs/architecture/access-gateway-maxcompute-ram.md` 是访问网关与 MaxCompute 权限闭环的当前边界说明。
- 网关监控页面代码位于 `cubic3-data-platform`，运行态数据来源为 `dw-query-gateway` telemetry / readyz API。生产环境必须通过 `QUERY_GATEWAY_BASE_URL` 指向真实 gateway，并用 `QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN` 对齐 gateway 侧 `PLATFORM_SERVICE_TOKEN`。
- 删除本仓 `query_execution` 时，如现有环境已经创建 `query_execution_jobs`、`query_execution_events` 或 `query_result_objects`，需要通过前向迁移或发布 runbook 明确归档 / 删除策略，不直接保留为活跃功能。
