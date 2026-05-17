---
doc_type: runbook
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-05-13
---

# 轻量权限体系运行手册

本文档说明 cubic3 第一阶段轻量权限体系如何初始化、如何配置后台角色、如何处理 M3 资源，以及如何做生产 smoke。

当前口径：`data-platform` 承载身份、角色、数据准入、执行画像、权限审计和网关管理 UI；`dw-query-gateway` 作为独立执行面负责 SQL guard、MaxCompute 调用和真实执行遥测。行级、列级、脱敏和物理隔离继续交给 MaxCompute RAM / LabelSecurity / Policy。gateway -> MaxCompute RAM 当前只落方案，真实 RAM User AK/SK 和 CredentialBinding 不在 data-platform 表内保存。

产品闭环口径：

- 平台只有一套用户与权限主链：`access_principals` 表示成员或机器人主体，`access_role_bindings` 表示平台角色和数据访问等级绑定。
- 飞书真人、内部管理员、Agent / Bot / Skill / Job 都先解析为 `PrincipalContext`，再进入语义规划、查询执行和 DataPolicy 判定。
- 数据访问权限只信任服务端 RoleBinding。JWT 里的角色、请求体里的 `roles / permissions / data_scope / viewer_roles` 都不作为授权依据。
- 旧 `/api/v1/users`、`/api/v1/roles`、`/api/v1/users/me/preferences` 不再注册到当前产品后台；个人偏好走 Access Preferences。

后台产品口径统一收敛为三类对象：

| 界面对象 | 管理员心智 | 底层对象 |
| --- | --- | --- |
| 成员权限 | 给成员分配平台角色和数据访问权限 | `Principal` / `RoleBinding` |
| 机器人接入 | 哪个 Bot、Agent、Skill 或 Job 可以调用平台 | `ServicePrincipal` / `ApiKey` |
| 数据访问规则 | 查看默认准入、例外规则和判定记录 | `DataPolicy` / `ExecutionProfile` / `PolicyDecision` |
| 权限审计 | 查看权限审批、最近判定和治理要求 | `PolicyDecision` / 审批记录 |
| 网关观测 | 查看真实执行面的查询次数、稳定性和物理权限兜底 | `dw-query-gateway` telemetry / gateway trace |

界面默认使用“平台角色、数据访问权限、机器人、访问规则、权限审计、网关观测”等产品语言；`Principal`、`DataPolicy`、`ExecutionProfile`、`CredentialBinding` 只作为工程实现名出现在 API、日志和高级排障材料中。

## 1. 默认初始化

非测试环境启动 `create_app(role="web")` 时会自动执行：

```text
seed_access_governance_defaults()
```

该 seed 只创建默认 `ExecutionProfile` 和 `DataPolicy`，不会创建真实成员、机器人接入，也不会签发 API Key。

默认执行画像：

| profile_code | M 等级 | 用途 |
| --- | --- | --- |
| `inline_m0` | M0 | DIM / ADS 基础数据、语义知识和公开摘要 |
| `internal_m1` | M1 | DWS 汇总层查询 |
| `internal_m2` | M2 | 受控 DWD 明细查询，强审计 |

默认数据策略：

| policy_code | effect | 角色 | 范围 |
| --- | --- | --- | --- |
| `m0_public_read` | allow | `data_m0_reader` | `dim_` / `ads_` / M0 |
| `m1_aggregate_read` | allow | `data_m1_reader` | `dws_` / M1 |
| `m2_detail_read` | allow | `data_m2_detail_reader` | `dwd_` |
| `m3_raw_block` | deny | 无角色要求 | `ods_` / `raw_` / M3 |

## 2. 平台角色与数据访问权限

后台默认把成员权限拆成两类能力：

```http
GET /api/v1/access/permission-packages
```

内置平台角色：

| 平台角色 | 底层角色 | 说明 |
| --- | --- | --- |
| 管理员 | `governance_admin` / `auditor` | 管权限配置、访问规则和审计，不自动拥有数据读取权限 |
| 产品经理 | `product_manager` | 查看业务对象、指标解释和产品分析入口 |
| 数据开发 | `semantic_modeler` | 维护业务对象、指标、Cube 和语义草稿 |
| 普通用户 | `viewer` | 使用基础入口和公开页面 |

内置数据访问权限：

| 数据访问权限 | 底层角色 | 默认范围 |
| --- | --- | --- |
| 基础数据读取 | `data_m0_reader` | DIM / ADS |
| 汇总数据读取 | `data_m0_reader` / `data_m1_reader` | DIM / ADS + DWS |
| 明细数据读取 | `data_m0_reader` / `data_m1_reader` / `data_m2_detail_reader` | DIM / ADS + DWS + DWD，默认强审计 |

推荐操作路径：

```text
配置中心 -> 访问网关 -> 权限配置 -> 成员权限 -> 选择成员 -> 选择平台角色和数据访问权限 -> 保存权限配置
```

接口方式：

```http
PUT /api/v1/access/principals/{principal_id}/permission-packages
```

示例：

```json
{
  "package_codes": ["data_developer", "data_m2_detail_reader"]
}
```

界面仍展示底层角色和绑定记录，但只用于审计和排障，不作为普通管理员的主操作对象。数据访问权限在界面上按最高等级单选，`data_m2_detail_reader` 会展开为 `data_m0_reader + data_m1_reader + data_m2_detail_reader`。

## 3. 角色目录（高级）

后台和集成方可通过接口读取内置角色目录：

```http
GET /api/v1/access/role-catalog
```

需要以下任一平台角色：

```text
platform_admin
governance_admin
auditor
```

角色分两类：

| 类型 | 作用 |
| --- | --- |
| PlatformRole | 管后台操作，例如建模、治理、审计查看 |
| DataRole | 管数据访问能力，例如 M1 聚合、M2 明细 |

`platform_admin` 不自动获得数据权限，需要另绑 `data_*` 角色。

## 4. 绑定数据角色（高级接口）

高级接口仍保留，用于迁移、自动化或故障修复：

```http
PUT /api/v1/access/principals/{principal_id}/role-bindings
```

示例：

```json
{
  "bindings": [
    {
      "role_code": "semantic_modeler",
      "role_type": "platform"
    },
    {
      "role_code": "data_m1_reader",
      "role_type": "data"
    }
  ]
}
```

注意：

- 普通管理员优先使用“平台角色 + 数据访问权限”配置入口，不直接维护底层角色。
- 请求体传入的 `roles`、`permissions`、`data_scope`、`viewer_roles` 不参与授权。
- 真人用户的身份信息以飞书 SSO 同步出的成员身份为准。
- Agent / Bot 的 API Key 只认证调用方，代表真人时必须携带 `feishu_context`。

## 5. M 等级治理

M 等级是 data-platform 的轻量数据准入标签，不替代 MaxCompute 物理权限。

| 等级 | 说明 | 在线执行 |
| --- | --- | --- |
| M0 | DIM / ADS 基础数据、语义知识、公开摘要 | `data_m0_reader` |
| M1 | DWS 汇总数据，继承 M0 | `data_m1_reader` |
| M2 | 受控明细、脱敏明细、可治理 DWD | `data_m2_detail_reader` |
| M3 | ODS/raw/high-sensitive 原始或高敏数据 | 默认阻断 |

M3 命中时返回：

```json
{
  "decision": "deny",
  "reason_code": "m3_governance_required",
  "governance_required": true
}
```

不引入在线审批流。需要开放时，由管理员完成资源治理后把资源等级调整为 M2，再按 M2 策略查询。

治理降级检查项：

- 字段是否已脱敏或裁剪。
- 查询粒度是否符合业务最小必要。
- 语义层是否有清晰业务口径。
- MaxCompute RAM / LabelSecurity / Policy 是否仍能兜底。
- DataPolicy 是否命中对应 M2 范围。

## 6. 访问网关到 MaxCompute RAM 方案

完整设计见 [访问网关与 MaxCompute RAM 权限闭环](../architecture/access-gateway-maxcompute-ram.md)。当前实施口径：

- data-platform 只保存 `ExecutionProfile` 的逻辑画像和不可执行的 `GatewayAccessContextPreview`，不保存真实 RAM User、AK/SK 或 `credential_ref`。
- `dw-query-gateway` 运行时用 `execution_profile_code` 解析 `CredentialBinding`，再从 Secret Manager 或环境 fallback 获取 RAM User AK/SK。
- MaxCompute 侧用 3 个 RAM User + 3 个 Project Role 做物理兜底：`c3_mc_m0_reader` / `c3_mc_m1_reader` / `c3_mc_m2_detail_reader`。
- RAM User 只是认证身份；表、视图、Package 权限必须在 MaxCompute project 内通过 `CreateInstance`、`Describe`、`Select` 和自定义 project role 明确授权。
- `dim_ / ads_ / dws_ / dwd_` 前缀只能作为 gateway SQL guard 辅助校验，不能作为 MaxCompute 物理授权边界。
- M3、ODS、RAW 默认阻断，不建在线执行身份。
- `physical_denied_after_policy_allow` 表示平台策略放行但 MaxCompute 物理拒绝，应进入执行审计并触发漂移告警。

访问网关页面按二级菜单分层：

| 二级菜单 | 用途 |
| --- | --- |
| 权限管理 | 成员权限、机器人接入、数据访问规则 |
| 权限审计 | 权限审批、策略判定和治理要求 |
| 网关观测 | 查询执行记录、访问趋势、SQL guard、MaxCompute 物理拒绝和稳定性 |

## 7. 机器人接入和 API Key

创建机器人接入：

```http
POST /api/v1/access/service-principals
```

创建 API Key：

```http
POST /api/v1/access/service-principals/{principal_id}/api-keys
```

Agent / Bot 代表真人问数时，API Key 需要包含：

```text
agent.semantic.plan
delegation.feishu_user
```

请求体必须携带 `feishu_context`。data-platform 会根据 `tenant_key + union_id/open_id` 解析真人 Principal，并只使用服务端 RoleBinding。

## 8. 生产 Smoke

轻量权限闭环 smoke 固定入口：

```bash
make smoke-access
```

覆盖路径：

| 路径 | 目标 |
| --- | --- |
| 飞书 SSO 登录兼容 | 真人 Principal 可登录并进入新身份体系 |
| API Key 生命周期 | 明文只创建时返回，后续详情不泄露 |
| Bot 代理真人 | API Key + `feishu_context` 解析为 actor service、principal human |
| M1 / M2 放行 | 命中默认 DataPolicy 和 ExecutionProfile |
| M3 阻断 | 即使有治理角色，也返回 `m3_governance_required` |

访问网关到 MaxCompute 接入后补充：

| 路径 | 目标 |
| --- | --- |
| CredentialBinding 缺失 | 返回 `credential_binding_missing`，日志不泄露密钥 |
| AK/SK 无效 | 返回 `credential_invalid` |
| 非只读 SQL | 返回 `operation_not_allowed` 或 `sql_guard_denied` |
| 平台 allow 但 MaxCompute deny | 返回 `physical_denied_after_policy_allow` 并告警 |
| Download / Tunnel | 返回 `download_denied` |

权限相关改动至少执行：

```bash
make smoke-access
make verify-docs
```

涉及 Agent / 语义链路时补充：

```bash
make test-agent-runtime
make smoke-semantic
```

## 9. 原则应用

- KISS：只保留默认角色目录、默认策略、默认执行画像和 smoke 入口。
- YAGNI：不 seed API Key，不创建样例用户，不引入审批流和签名 ticket。
- SOLID：身份解析、角色目录、DataPolicy、ExecutionProfile 和 smoke 各自职责独立。
- DRY：角色目录只在后端 seed 配置中维护，后台接口直接读取同一份定义。
