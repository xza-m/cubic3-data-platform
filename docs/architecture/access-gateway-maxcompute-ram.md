---
doc_type: architecture
status: proposed
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-05-13
---

# 访问网关与 MaxCompute RAM 权限闭环

本文档记录 `data-platform` 与独立 `dw-query-gateway` 到 MaxCompute 的权限路径方案。当前阶段 `data-platform` 只实现治理面和管理 UI，不在平台内实现 gateway runtime，也不保存真实 MaxCompute RAM 凭据。

## 1. 目标边界

查询执行权限拆成三层：

```text
Principal
  -> PermissionPackage / RoleBinding
  -> DataPolicy
  -> PolicyDecision
  -> ExecutionProfile
  -> GatewayAccessContext
  -> dw-query-gateway CredentialBinding
  -> RAM User AK/SK
  -> MaxCompute Project Role / Object ACL
  -> 查询执行与审计
```

职责边界：

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| data-platform | 身份、平台角色、数据访问权限、DataPolicy、PolicyDecision、ExecutionProfile、权限管理 UI、网关观测 UI | 保存 AK/SK、直接维护 MaxCompute 表授权、执行 SQL |
| dw-query-gateway | 接收 `GatewayAccessContext`、校验执行材料、选择 CredentialBinding、SQL guard、可观测、调用 MaxCompute adapter | 解释飞书身份、计算业务授权、维护平台角色 |
| MaxCompute | 项目角色、对象权限、LabelSecurity / Policy / Package 等物理兜底 | 平台角色、业务语义解释 |

最终放行条件固定为：

```text
allow =
  DataPolicy allow
  AND gateway SQL / resource / credential guard allow
  AND MaxCompute Project Role / ACL allow
```

## 2. RAM 身份和 MaxCompute 角色

当前采用 3 个长期 RAM User 作为 v1 折中，不接 STS，不做每用户 RAM，不开放 M3/raw 在线查询。

| 数据等级 | 数据访问权限 | ExecutionProfile | CredentialRef | RAM User | MaxCompute Project Role |
| --- | --- | --- | --- | --- | --- |
| M0 | `data_m0_reader` | `mc_m0_reader` | `C3_MC_M0_READER` | `c3_mc_m0_reader` | `c3_m0_reader` |
| M1 | `data_m1_reader` | `mc_m1_reader` | `C3_MC_M1_READER` | `c3_mc_m1_reader` | `c3_m1_reader` |
| M2 | `data_m2_detail_reader` | `mc_m2_detail_reader` | `C3_MC_M2_DETAIL_READER` | `c3_mc_m2_detail_reader` | `c3_m2_detail_reader` |

注意：RAM User 只负责认证身份，真正的数据授权发生在 MaxCompute project 内。每个 RAM User 必须加入目标 MaxCompute project，并绑定自定义 project role。

权限继承口径：

```text
M0: DIM / ADS
M1: M0 + DWS
M2: M0 + M1 + 已治理 DWD
M3: ODS / RAW / high-sensitive，默认阻断，不建执行身份
```

## 3. MaxCompute 授权矩阵

MaxCompute 侧必须用明确对象授权，不能把表名前缀当作物理边界。`dim_ / ads_ / dws_ / dwd_` 只作为 gateway SQL guard 的辅助校验。

| MaxCompute Role | Project 权限 | Object 权限 | 显式不授予 |
| --- | --- | --- | --- |
| `c3_m0_reader` | 目标 project `CreateInstance` | 已治理 DIM / ADS 表或视图 `Describe, Select` | `Download`, `Update`, `Alter`, `Drop`, `Tunnel`, ODS, RAW |
| `c3_m1_reader` | 目标 project `CreateInstance` | `c3_m0_reader` 范围 + 已治理 DWS 表或视图 `Describe, Select` | 同上 |
| `c3_m2_detail_reader` | 目标 project `CreateInstance` | `c3_m1_reader` 范围 + 已治理 DWD 表或视图 `Describe, Select` | 同上 |

`CreateInstance` 是提交实例的项目级能力，不表达读写隔离。读写隔离必须由对象级 `Describe / Select` 和显式不授予写入/下载能力共同保证。

示意命令：

```sql
ADD ACCOUNTPROVIDER RAM;

CREATE ROLE c3_m0_reader;
CREATE ROLE c3_m1_reader;
CREATE ROLE c3_m2_detail_reader;

ADD USER RAM$c3_mc_m0_reader;
ADD USER RAM$c3_mc_m1_reader;
ADD USER RAM$c3_mc_m2_detail_reader;

GRANT CreateInstance ON PROJECT <project_name> TO ROLE c3_m0_reader;
GRANT CreateInstance ON PROJECT <project_name> TO ROLE c3_m1_reader;
GRANT CreateInstance ON PROJECT <project_name> TO ROLE c3_m2_detail_reader;

GRANT c3_m0_reader TO USER RAM$c3_mc_m0_reader;
GRANT c3_m0_reader TO USER RAM$c3_mc_m1_reader;
GRANT c3_m1_reader TO USER RAM$c3_mc_m1_reader;
GRANT c3_m0_reader TO USER RAM$c3_mc_m2_detail_reader;
GRANT c3_m1_reader TO USER RAM$c3_mc_m2_detail_reader;
GRANT c3_m2_detail_reader TO USER RAM$c3_mc_m2_detail_reader;
```

表、视图或 Package 授权由资产治理脚本维护：

```sql
GRANT Describe, Select ON TABLE dim_xxx TO ROLE c3_m0_reader;
GRANT Describe, Select ON TABLE ads_xxx TO ROLE c3_m0_reader;
GRANT Describe, Select ON TABLE dws_xxx TO ROLE c3_m1_reader;
GRANT Describe, Select ON TABLE dwd_governed_xxx TO ROLE c3_m2_detail_reader;
```

## 4. GatewayAccessContext 与 CredentialBinding Provider

`data-platform` 在策略放行后只产出不可执行的 `GatewayAccessContextPreview`，用于审计和后续联调。实际请求 `dw-query-gateway` 时应升级为签名或内网可信的 `GatewayAccessContext`，但仍不携带真实 RAM 凭据。

```json
{
  "schema": "GatewayAccessContext.v1",
  "principal_id": "principal:feishu:tenant:open_id",
  "actor_type": "user",
  "actor_id": "open_id",
  "policy_version": "v1",
  "policy_epoch": 7,
  "execution_profile_code": "mc_m2_detail_reader",
  "data_level": "M2",
  "resource_set_physical": [{"project": "dw_prod", "table": "dwd_governed_xxx"}],
  "sql_hashes": ["..."],
  "constraints": {"max_rows": 2000, "timeout_seconds": 60, "export_allowed": false}
}
```

`ExecutionProfile` 只表达逻辑执行画像，不保存真实凭据引用。真实映射由 `dw-query-gateway` 内部 `CredentialBindingProvider` 在运行时解析。

```json
{
  "execution_profile_code": "mc_m2_detail_reader",
  "credential_mode": "ram_user",
  "credential_ref": "C3_MC_M2_DETAIL_READER",
  "source_type": "maxcompute",
  "project": "<project_name>",
  "endpoint": "<endpoint>",
  "allowed_data_levels": ["M0", "M1", "M2"],
  "allowed_resource_refs": ["project.dwd_governed_xxx"],
  "max_rows": 2000,
  "timeout_seconds": 60,
  "export_allowed": false,
  "status": "active"
}
```

AK/SK 只从 Secret Manager 或等价密钥托管读取。环境变量仅可作为本地和演示环境 fallback：

```text
C3_MC_M2_DETAIL_READER_ACCESS_ID
C3_MC_M2_DETAIL_READER_ACCESS_KEY
C3_MC_M2_DETAIL_READER_SECRET_VERSION
```

约束：

- `credential_ref` 和密钥版本号可进入 audit；AK/SK 永不进入日志、trace、audit 或 API 响应。
- M2 密钥轮换周期必须短于 M0/M1。
- 支持一键吊销和泄露应急 runbook。
- v2 目标态为 RAM Role + STS 临时凭证；v1 长期 RAM User 是阶段性折中。

## 5. Gateway 执行校验

真实执行前必须执行以下校验，任一失败即 fail closed：

- `PolicyDecision.decision == allow`。
- `ExecutionProfile.status == active`。
- `execution_profile_code` 可解析到 active CredentialBinding。
- `resource_set` 中 project/table/view/package 必须落在 `allowed_resource_refs`。
- `data_level` 不得超过 CredentialBinding 的 `allowed_data_levels`。
- SQL 操作必须是只读查询，禁止 `INSERT / UPDATE / DELETE / ALTER / DROP / TRUNCATE / DOWNLOAD / TUNNEL`。
- SQL AST 解析出的资源集合必须与 `resource_set` 一致。
- `limit <= min(ExecutionProfile.max_rows, CredentialBinding.max_rows)`。
- compiler 产出的 `canonical_sql_hash` 与 gateway 侧接收的执行材料一致。
- gateway 改写 SQL 时，记录 `canonical_sql_hash` 与 `executed_sql_hash`，并记录改写原因。

推荐 reason code：

```text
policy_denied
sql_guard_denied
sql_hash_mismatch
resource_set_mismatch
operation_not_allowed
credential_binding_missing
credential_invalid
secret_unavailable
maxcompute_access_denied
maxcompute_timeout
download_denied
physical_denied_after_policy_allow
```

`physical_denied_after_policy_allow` 表示平台业务策略放行但 MaxCompute 物理权限拒绝。它是双重防御的预期兜底结果，但出现后应视为策略/物理权限漂移并告警。

## 6. 可观测和审计

每次执行必须生成 `trace_id`，贯穿：

```text
principal_resolve
  -> data_policy_decision
  -> execution_profile_resolve
  -> credential_binding_resolve
  -> sql_guard
  -> maxcompute_submit
  -> maxcompute_wait
  -> result_read
```

持久化字段：

| 字段 | 说明 |
| --- | --- |
| `trace_id` | 一次执行链路 ID |
| `policy_decision_id` | 平台侧策略判定 |
| `principal_id` | 被授权主体 |
| `execution_profile_code` | 逻辑执行画像 |
| `credential_ref` | 非敏感凭据引用 |
| `credential_version` | 密钥版本 |
| `canonical_sql_hash` | compiler 侧规范化 SQL hash |
| `executed_sql_hash` | gateway 最终执行 SQL hash |
| `resource_set` | 结构化资源集合 |
| `maxcompute_instance_id` | MaxCompute instance |
| `reason_code` | 成功或失败原因 |

Metrics 最小集合：

- `gateway_query_total{status,data_level,profile}`
- `gateway_policy_denied_total{reason_code}`
- `gateway_sql_guard_denied_total{reason_code}`
- `gateway_credential_resolve_total{status,profile}`
- `gateway_maxcompute_access_denied_total{profile}`
- `gateway_physical_denied_after_policy_allow_total`
- `gateway_query_duration_ms{profile}`
- `gateway_query_rows{profile}`

## 7. 前端信息架构

左侧系统一级模块命名为“访问网关”，但它是平台治理控制台，不代表 gateway runtime 内嵌在 `data-platform` 中。二级菜单拆成权限类和网关类：

| 二级菜单 | 类别 | 目标 | 内容 |
| --- | --- | --- | --- |
| 权限管理 | 权限 | 管理“谁能访问什么” | 成员权限、机器人接入、数据访问规则 |
| 权限审计 | 权限 | 查看权限审批、策略判定和治理要求 | 审批记录、最近权限判定、拦截记录 |
| 网关观测 | 网关 | 查看真实执行面的健康度 | 查询次数、执行记录、访问趋势、SQL guard、MaxCompute 物理拒绝、稳定性 |

管理员默认先进入“权限管理”。“网关观测”只展示 `dw-query-gateway` 遥测，不混入权限审批记录，不暴露 AK/SK，不把 `CredentialBinding` 作为普通管理员编辑入口。

## 8. Smoke 验收

最短 smoke：

| 路径 | 预期 |
| --- | --- |
| M0 用户查 DIM / ADS | 成功，使用 `mc_m0_reader` |
| M0 用户查 DWS | `policy_denied` |
| M1 用户查 DWS | 成功，使用 `mc_m1_reader` |
| M1 用户查 DWD | `policy_denied` |
| M2 用户查已治理 DWD | 成功，使用 `mc_m2_detail_reader` |
| 任意用户查 ODS / RAW / M3 | `m3_governance_required` 或 `sql_guard_denied` |
| 非 SELECT / Download / Tunnel / DDL | `operation_not_allowed` 或 `download_denied` |
| CredentialBinding 缺失 | `credential_binding_missing` |
| AK/SK 无效 | `credential_invalid` |
| 平台 allow 但 MaxCompute 拒绝 | `physical_denied_after_policy_allow` 并告警 |

## 9. 原则应用

- KISS：v1 只建 M0/M1/M2 三个执行身份，不做每用户 RAM。
- YAGNI：本阶段不上 STS、不做 M3 在线审批、不做复杂凭据管理 UI。
- SOLID：业务授权、gateway runtime、MaxCompute 物理权限各自独立；平台 UI 可集成，运行时边界不混合。
- DRY：表权限通过 MaxCompute project role 或 Package 维护，不把表清单重复写入多个 RAM User。

参考官方口径：[MaxCompute 权限概述](https://help.aliyun.com/zh/maxcompute/user-guide/permissions)、[MaxCompute 权限列表](https://help.aliyun.com/zh/maxcompute/user-guide/maxcompute-permissions)、[项目级角色授权](https://help.aliyun.com/zh/maxcompute/user-guide/perform-access-control-based-on-project-level-roles)。
