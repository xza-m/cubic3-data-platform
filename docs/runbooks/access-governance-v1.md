---
doc_type: runbook
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-09
---

# 轻量权限体系运行手册

本文档说明 cubic3 第一阶段轻量权限体系如何初始化、如何配置后台角色、如何处理 M3 资源，以及如何做生产 smoke。

当前固定方案为 **B+：轻量权限中心 + 网关执行闭环**。架构决策见 [ADR-013 固定轻量权限中心与网关执行闭环](../architecture/decisions/ADR-013-lightweight-access-governance.md)，产品与界面设计见 [权限中心产品方案与界面设计](../prd/access_permission_center_prd.md)。

当前口径：`data-platform` 承载身份、角色、数据准入、执行画像、权限审计和网关管理 UI；`dw-query-gateway` 作为独立执行面负责 SQL guard、MaxCompute 调用和真实执行遥测。行级、列级、脱敏和物理隔离继续交给 MaxCompute RAM / LabelSecurity / Policy。gateway -> MaxCompute RAM 当前只落方案，真实 RAM User AK/SK 和 CredentialBinding 不在 data-platform 表内保存。

产品闭环口径：

- 平台只有一套用户与权限主链：`access_principals` 表示成员或机器人主体，`access_role_bindings` 表示平台角色和数据访问等级绑定。
- 飞书真人、内部管理员、Agent / Bot / Skill / Job 都先解析为 `PrincipalContext`，再进入语义规划、查询执行和 DataPolicy 判定。
- 数据访问权限只信任服务端 RoleBinding。JWT 里的角色、请求体里的 `roles / permissions / data_scope / viewer_roles` 都不作为授权依据。
- 旧 `/api/v1/users`、`/api/v1/roles`、`/api/v1/users/me/preferences` 不再注册到当前产品后台；个人偏好走 Access Preferences。

后台产品口径统一收敛为三类对象：

| 界面对象 | 管理员心智 | 底层对象 |
| --- | --- | --- |
| 主体权限 | 给碳基成员分配平台角色和数据访问权限，同时查看硅基机器人接入 | `Principal` / `RoleBinding` / `ServicePrincipal` / `ApiKey` |
| M2 白名单 | 解释默认 M2 权限来源、主体匹配状态和当前授权结果 | `FEISHU_M2_READER_OPEN_IDS` / `allowed_user_ids` / `RoleBinding` |
| 数据访问规则 | 查看默认准入、例外规则和判定记录 | `DataPolicy` / `ExecutionProfile` / `PolicyDecision` |
| 权限审计 | 查看策略判定、治理要求和访问拦截记录 | `PolicyDecision` / 治理要求记录 |
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
| `mc_m0_reader` | M0 | DIM / ADS 基础数据、语义知识和公开摘要 |
| `mc_m1_reader` | M1 | DWS 汇总层查询 |
| `mc_m2_detail_reader` | M2 | 受控 DWD 明细查询，强审计 |

默认数据策略：

| policy_code | effect | 角色 | 范围 |
| --- | --- | --- | --- |
| `m0_public_read` | allow | `data_m0_reader` | `dim_` / `ads_` / M0 |
| `m1_aggregate_read` | allow | `data_m1_reader` | `dws_` / M1 |
| `m2_detail_read` | allow | `data_m2_detail_reader` | `dwd_` |
| `m3_raw_block` | deny | 无角色要求 | `ods_` / `raw_` / M3 |

### 1.1 方案 B：全员登录 + M2 白名单

方案 B 的启动口径是：企业内飞书用户可以通过 SSO 登录并自动落成 `access_principals`，但默认只获得 `viewer` 平台角色；只有命中默认 M2 白名单的用户，登录时才会额外绑定：

```text
data_m0_reader
data_m1_reader
data_m2_detail_reader
```

默认 M2 白名单支持三种标识：

- 飞书 `open_id`
- 飞书 `union_id`
- 平台生成的 `principal_id`，例如 `feishu:<tenant_key>:<union_id>`

配置方式：

```bash
FEISHU_M2_READER_OPEN_IDS=on_xxx,ou_xxx,feishu:tenant_a:un_xxx
FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST=true
```

`FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST=true` 是默认值，表示复用 CUBIC3 智能问数应用配置里的 `allowed_user_ids` 作为默认 M2 白名单。若后续希望“能使用智能问数”和“默认 M2 查询权限”拆开，设为 `false`，再只维护 `FEISHU_M2_READER_OPEN_IDS`。

注意：默认 M2 只让 data-platform 的 `DataPolicy` 能放行 M2 受控明细；真实执行仍必须通过 `dw-query-gateway` 的 SQL guard、CredentialBinding 和 MaxCompute RAM / ACL 物理权限。

联调和后台展示可读取白名单解释接口：

```http
GET /api/v1/access/m2-allowlist
```

该接口只返回配置来源、匹配状态、当前 M2 成员和风险提示，不执行授权写入。它用于确认“哪些飞书 ID 应该默认拥有 M2”以及“这些 ID 是否已经登录落成 Principal”。授权写入仍发生在飞书 SSO 首次登录或后续同步任务中。

## 2. 平台角色与数据访问权限

后台默认把主体权限拆成两类能力：

```http
GET /api/v1/access/permission-packages
```

内置平台角色：

| 平台角色 | 底层角色 | 说明 |
| --- | --- | --- |
| 管理员 | `governance_admin` / `auditor` | 管权限配置、访问规则和审计，不自动拥有数据读取权限 |
| 产品经理 | `product_manager` | 查看业务对象、指标解释和产品分析入口 |
| 数据开发 | `semantic_modeler` | 维护业务对象、指标、Cube 和语义草稿 |
| 普通用户 | `viewer` | 使用基础入口和公开页面，不可读取权限中心 |

内置数据访问权限：

| 数据访问权限 | 底层角色 | 默认范围 |
| --- | --- | --- |
| 基础数据读取 | `data_m0_reader` | DIM / ADS |
| 汇总数据读取 | `data_m0_reader` / `data_m1_reader` | DIM / ADS + DWS |
| 明细数据读取 | `data_m0_reader` / `data_m1_reader` / `data_m2_detail_reader` | DIM / ADS + DWS + DWD，默认强审计 |

推荐操作路径：

```text
配置中心 -> 访问网关 -> 权限配置 -> 主体权限 -> 选择碳基成员 -> 选择平台角色和数据访问权限 -> 保存权限配置
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

## 4. 底层角色绑定接口（内部自动化）

该接口用于迁移、自动化或故障修复，不作为后台产品主操作入口，也不是旧前端兼容路径。管理员日常操作应走 `permission-packages`，前端不再暴露直接编辑底层 `role-bindings` 的入口。

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
| 权限管理 | 主体权限、M2 白名单、数据访问规则 |
| 权限审计 | 策略判定、治理要求和访问拦截记录 |
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

签发时可显式选择身份模式（M3 产品化）：

| 模式 | 请求体 | 行级求值口径 |
| --- | --- | --- |
| 模式 A（scope） | `"mode": "scope"` + `data_scopes`（写入 `access_principal_scopes`，source=issuance） | 取服务身份自带 scope；未配 scope 且命中 row_scope 策略时 fail closed |
| 模式 B（delegation） | `"mode": "delegation"`（要求 service principal 已配 `allowed_tenants` 委托白名单，自动附加 `delegation.feishu_user`） | 取被代理 subject 主体的 scope；请求体 scope 声明一律不采信 |

可选 `semantic_pin`（§6.1 release pin）：`{"pin_policy": "pinned", "release_id": "rel_x"}` 让该 Key 的语义解析固定在不可变 release；`track_active`（默认）跟随 active。

## 7.1 行级安全（row_scope）与过渡 fail closed

M3 平台侧已落地行级安全模板与求值链（设计见 [semantic-binding-and-rls.md](../architecture/semantic-binding-and-rls.md) §3/§6）：

- `DataPolicy.row_scope` 配谓词模板：`[{"dimension_ref": "cube.dimension", "operator": "in", "attribute": "school_ids", "on_missing": "deny"}]`，经 `/api/v1/governance/data-policies` 维护。
- 主体数据范围经 `PUT /api/v1/access/principals/{id}/scopes` 配置（source=manual）或 Key 签发模式 A 写入（source=issuance）。
- `post_compile` 求值产出 `effective_row_scope`（物理表+列+具体值），随决策持久化并进入审计 UI（双主体归因）。

**执行模式开关 `RLS_ENFORCEMENT_MODE`（过渡，默认 `observe`）**：考虑 gateway 仍有存量用户、直接注入影响生产可用，RLS 是否阻断由该开关统一控制（`AccessPolicyDecisionService` 单点读取、随 `PolicyDecisionResult.rls_enforcement_mode` 透传到所有 fail-closed 落点与网关 context）：

| 模式 | row_scope 命中时行为 | GatewayAccessContext |
| --- | --- | --- |
| `off` | 跳过求值，放行 | v1（不下发 row_scope）|
| `observe`（默认） | 求值 + 写审计，**放行不阻断** | v1（网关零感知）|
| `deny` | fail closed（见下表） | v2（含 row_scope）|
| `enforce` | 预留，gateway 注入就绪后真正注入；当前等价 `deny` | v2 |

> 未配 `row_scope` 的策略在任何模式下零影响；`observe` 下网关收到的 context 与改造前完全一致。生产先用 `observe` 积累求值证据，gateway `apply_scope` 就绪后切 `deny`/`enforce`。

**`deny` / `enforce` 模式下的 fail closed 落点**（observe/off 不触发）：

| 路径 | reason_code |
| --- | --- |
| free SQL 命中带 row_scope 策略的资源 | `row_scope_requires_semantic_path`（语义路径外不放行） |
| 非 gateway 引擎（PG/MySQL/ClickHouse 直查） | `row_scope_engine_unsupported` |
| gateway 引擎（注入能力未就绪） | `scope_injection_unsupported` |
| 模板属性缺失且 `on_missing: deny` | `row_scope_unresolved` |

元数据可见性（§6.2）：`semantic.discover` / `semantic.describe` 已进 DataPolicy 裁决链；服务身份默认不可发现（deny-first），人类主体默认可见 active 资产 M0/M1 摘要，M2+ 物理细节（表名 / dimension SQL / join 拓扑）需对应数据角色，否则脱敏返回。存量 ontology `PolicyMetadata.allowed_roles` 经 `POST /api/v1/governance/data-policies/migrate-policy-metadata` 一次性迁为 discover 策略。

## 8. 生产 Smoke

轻量权限闭环 smoke 固定入口：

```bash
make smoke-access
```

覆盖路径：

| 路径 | 目标 |
| --- | --- |
| 飞书 SSO 登录兼容 | 真人 Principal 可登录并进入新身份体系 |
| M2 白名单解释 | `/api/v1/access/m2-allowlist` 返回配置标识、匹配状态和当前授权 |
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
