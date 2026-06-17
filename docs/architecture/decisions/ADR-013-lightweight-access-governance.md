---
doc_type: adr
status: accepted
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-12
---

# ADR-013 固定轻量权限中心与网关执行闭环

## 状态

Accepted，2026-06-09 起生效。

2026-06-12 边界更新：本 ADR 原「暂不做行列级自研策略」的边界由 [../semantic-binding-and-rls.md](../semantic-binding-and-rls.md) 解除——行级安全（RLS）已定设计为现有决策链上的五个增量构件（DataPolicy.row_scope 模板、PrincipalDataScope、post_compile 求值、GatewayAccessContext.v2、审计），**扩展而非重构**本 ADR 确立的实体与边界。列级（column_scope）维持暂缓。

2026-06-14 过渡决策（RLS 执行模式开关）：考虑 `dw-query-gateway` 仍有存量用户、直接引入注入会影响生产可用，RLS 执行由统一开关 `RLS_ENFORCEMENT_MODE` 控制（`off` / `observe` / `deny` / `enforce`，由 `AccessPolicyDecisionService` 单点读取并随 `PolicyDecisionResult.rls_enforcement_mode` 透传到所有 fail-closed 落点与网关 context 构造）：
- **默认 `observe`（过渡态）**：求值 `effective_row_scope` 并写审计作为「求值正确性」证据，但**不阻断**执行；`GatewayAccessContext` 维持 v1、不下发 row_scope，网关零感知。
- `off`：完全跳过 row_scope 求值，纯语义闭环。
- `deny`：命中 row_scope 的 SQL / free SQL 一律 fail closed（gateway 注入未就绪），并升级 `GatewayAccessContext.v2`。
- `enforce`：预留，gateway `apply_scope` 就绪后真正注入；当前等价 `deny`。
- 代码层构造默认仍为安全态 `deny`；仅未配 row_scope 的策略在任何模式下都零影响。这条决策让「网关现状不受影响」与「语义评估闭环可先完成」解耦：先用 observe 在生产积累证据，gateway 注入能力就绪后再切 `enforce`。

## 背景

当前平台已经具备飞书 SSO、统一 `Principal`、平台角色、数据访问角色、`DataPolicy`、`ExecutionProfile`、`GatewayAccessContextPreview`、权限审计和网关观测页面。数仓查询正式执行面已经收敛到独立 `dw-query-gateway`，MaxCompute RAM / Project Role / Object ACL 继续承担物理权限兜底。

在权限建设继续推进前，需要固定三个问题：

- 是否建设统一权限引擎。
- gateway 是否维护用户与 RAM 身份的直接关系。
- 产品界面如何向管理员解释成员、白名单、数据权限和审计链路。

## 决策

采用 **方案 B+：轻量权限中心 + 网关执行闭环**。

该方案不是大一统 IAM，也不是 per-user RAM。平台只建设当前阶段必要的权限闭环：

```text
Principal
  -> RoleBinding
  -> DataPolicy
  -> PolicyDecision
  -> ExecutionProfile
  -> Signed GatewayAccessContext
  -> dw-query-gateway CredentialBinding
  -> RAM User / MaxCompute Project Role / Object ACL
  -> 查询执行与审计
```

最终放行条件固定为：

```text
allow =
  DataPolicy allow
  AND gateway SQL / resource / credential guard allow
  AND MaxCompute Project Role / Object ACL allow
```

## 关键边界

| 边界 | 负责 | 不负责 |
| --- | --- | --- |
| `data-platform` | 身份归一、平台角色、数据访问角色、M2 白名单、DataPolicy、PolicyDecision、ExecutionProfile、权限 UI、审计解释 | 保存 RAM AK/SK、直接执行 SQL、维护 MaxCompute 对象授权 |
| `dw-query-gateway` | 校验签名上下文、SQL guard、资源一致性检查、CredentialBinding、查询执行、执行 trace | 解释飞书身份、计算业务授权、维护平台角色或白名单 |
| MaxCompute | RAM 用户、Project Role、Object ACL、LabelSecurity / Policy / Package 等物理兜底 | 理解平台角色、权限包、业务语义 |

gateway 不维护：

```text
user -> RAM
```

gateway 只维护：

```text
execution_profile_code -> credential_ref -> RAM identity
```

用户到执行档案的映射由 `data-platform` 决定：

```text
principal -> data role -> DataPolicy -> ExecutionProfile
```

## 产品口径

产品界面只暴露三个概念：

| 产品概念 | 管理员心智 | 底层对象 |
| --- | --- | --- |
| 成员 | 谁在平台里、来自飞书还是服务账号 | `Principal` |
| 数据权限 | 这个主体最多能查到哪类数据 | `RoleBinding` / `DataPolicy` |
| 审计记录 | 为什么允许、为什么拒绝、执行是否被 gateway 或 MaxCompute 拦截 | `PolicyDecision` / gateway trace |

`DataPolicy`、`ExecutionProfile`、`CredentialBinding`、RAM User 只作为工程实现名出现在 API、日志、高级排障和联调文档中，不作为普通管理员主操作对象。

数据访问等级的产品文案固定为：

| 等级 | 产品文案 | 默认策略 |
| --- | --- | --- |
| M0 | 公开汇总 | 低风险读权限 |
| M1 | 经营汇总 | 角色授权 |
| M2 | 受控明细 | 白名单或管理员授权，强审计 |
| M3 | 原始高敏 | 默认禁止在线查询 |

## M2 白名单

企业内飞书用户可以通过 SSO 登录并自动落成 `access_principals`。默认只授予 `viewer` 平台角色。`viewer` 只代表基础登录身份，不授予权限中心读取能力；权限中心读取收敛到 `auditor`、`governance_admin`、`platform_admin`。

命中默认 M2 白名单的飞书用户，在登录时额外绑定：

```text
data_m0_reader
data_m1_reader
data_m2_detail_reader
```

白名单支持三种标识：

- 飞书 `open_id`
- 飞书 `union_id`
- 平台 `principal_id`

白名单授权只影响 `data-platform` 侧 DataPolicy 判定。真实查询仍必须通过 gateway SQL guard、CredentialBinding 和 MaxCompute RAM / ACL。

## 取舍

### 方案 A：建设统一权限引擎，未采纳

优点是模型完整、未来可扩展；缺点是当前阶段会把角色、策略、审批、行列级、安全标签、执行身份全部提前复杂化。该方案违反 YAGNI，容易拖慢与 gateway、MaxCompute 的联调。

### 方案 B：全员登录 + M2 白名单，采纳并增强为 B+

优点：

- KISS：权限主链只有身份、绑定、策略、执行档案和审计。
- YAGNI：暂不做 per-user RAM 与在线审批；行级策略已按 [../semantic-binding-and-rls.md](../semantic-binding-and-rls.md) 定为增量演进（M3 里程碑），列级维持暂缓。
- SOLID：业务授权、查询执行、物理权限各自归属清楚。
- DRY：用户权限只在 `RoleBinding / DataPolicy` 表达一次，gateway 不复制用户授权表。

缺点：

- MaxCompute 原生日志暂时只能看到 profile-level RAM 身份，个人追责依赖平台侧 `principal_id + trace_id + policy_decision_id`。
- 白名单来源需要在产品界面解释清楚，否则管理员难以判断权限为何存在。

### 方案 C：per-user RAM，暂缓

该方案能让 MaxCompute 原生日志直接归因到自然人，但会引入 RAM 生命周期、密钥轮换、离职回收、STS 会话、异常兜底和跨租户运维成本。只有出现强合规要求时才进入 P3。

## 后续约束

- 新查询路径不得绕过 `DataPolicy -> GatewayAccessContext -> dw-query-gateway`。
- 请求体、JWT、前端状态中的 `roles / permissions / data_scope / viewer_roles` 不作为授权事实源。
- `platform_admin` 不自动拥有数据读取权限，数据读取必须显式绑定数据角色。
- M3 / ODS / RAW 默认阻断，不建在线执行身份。
- gateway 接收的执行上下文必须可校验签名、过期时间、`policy_decision_id` 和 `execution_profile_code`。
- data-platform 不保存 RAM AK/SK，不复制 gateway 查询执行事实源。
- 权限中心 UI 必须展示权限来源、允许/拒绝原因和审计 trace，不只展示最终状态。

## 验证与治理建议

P0 验收必须覆盖：

- 白名单飞书用户首次登录后自动获得 M2 数据角色。
- 非白名单用户默认没有 M2 数据角色。
- 撤销 M2 后不能生成 M2 执行上下文。
- M3 / raw / ods 查询始终被拒绝。
- gateway 拒绝伪造、过期或签名错误的上下文。
- gateway 能按 `execution_profile_code` 解析正确 CredentialBinding。
- MaxCompute 物理拒绝能回写审计，并以 `physical_denied_after_policy_allow` 告警。
- 审计页能解释一次查询为什么允许或拒绝。
