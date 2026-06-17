---
doc_type: prd
status: current
source_of_truth: primary
owner: product
last_reviewed: 2026-06-09
---

# 权限中心产品方案与界面设计

## 1. 产品定位

权限中心承载 `cubic3-data-platform` 的主体权限、M2 白名单、数据访问规则、权限审计和网关观测。第一版目标不是建设完整 IAM，而是把当前权限体系闭环成可运营、可解释、可联调的后台工作台。

固定方案见 [ADR-013 固定轻量权限中心与网关执行闭环](../architecture/decisions/ADR-013-lightweight-access-governance.md)。

## 2. 设计原则

- KISS：管理员只理解“成员、数据权限、审计记录”三个产品概念。
- YAGNI：第一版不做在线审批、行列级策略编辑、per-user RAM 和复杂组织权限树。
- SOLID：data-platform 管授权，gateway 管执行，MaxCompute 管物理兜底。
- DRY：用户授权只在 `RoleBinding / DataPolicy` 表达一次，gateway 不维护第二套用户权限。

## 3. 用户与场景

| 用户 | 核心任务 | 成功标准 |
| --- | --- | --- |
| 权限管理员 | 查看主体权限、授予或撤销 M2、管理白名单 | 能解释“谁为什么有权限” |
| 审计人员 | 查询权限判定、拒绝原因、gateway trace | 能串起 `policy_decision_id` 与 `trace_id` |
| 数据治理负责人 | 查看 M0/M1/M2/M3 规则与 M3 拦截 | 能确认敏感数据不会绕过治理 |
| 后端联调人员 | 校验上下文、profile、CredentialBinding 和 RAM 兜底 | 能定位拒绝发生在哪一层 |

## 4. 信息架构

沿用当前 `/config/access` 入口，不新增顶层模块。

```text
配置中心
  -> 访问网关
     -> 权限管理
        -> 主体权限
        -> M2 白名单
        -> 数据访问规则
     -> 权限审计
     -> 网关观测
```

当前代码已有二级路由：

- `/config/access`
- `/config/access/audit`
- `/config/access/observability`

第一版可以在 `/config/access` 内通过页内 tab 承载“主体权限、M2 白名单、数据访问规则”。

### 4.1 当前落地口径（2026-06-09）

- 主体权限统一展示飞书真人用户和服务主体，用“碳基生物 / 硅基生物”区分身份类型；机器人 API Key 在选中服务主体后从右侧详情维护。
- 右侧详情栏默认折叠，不占空白位；点击某个主体后展开详情，关闭后回到纯列表视图。
- 管理员主操作只使用权限包接口：`GET /api/v1/access/permission-packages` 与 `PUT /api/v1/access/principals/{principal_id}/permission-packages`。
- 前端不再保留直接编辑底层 `role-bindings` 的旧操作入口，也不再把 `internal_query_execution`、`inline_policy_decision` 等历史执行模式塞回下拉。
- “M2 白名单”使用 `GET /api/v1/access/m2-allowlist` 做只读联调视图，解释环境变量、CUBIC3 白名单复用、主体匹配状态和当前 M2 授权结果。
- gateway 与 RAM 的关系只通过 `execution_profile_code -> CredentialBinding -> RAM User` 在 `dw-query-gateway` 运行时解析；data-platform 不维护 `user -> RAM` 映射。

## 5. 页面设计

视觉基线采用当前 React v2 控制台风格：高信息密度、窄标题、表格主导、右侧详情面板、8px 以内圆角、低装饰、中性色背景。OpenDesign 或 Figma 落稿时应优先复用现有 `Button`、`Chip`、`Tabs`、`Dialog`、`Sheet`、`Table`、`Toolbar` 和 `ListPagination`。

### 5.1 权限管理

目标：管理员可以快速回答“这个人是谁、有什么权限、权限从哪里来、是否能调整”。

布局：

```text
+---------------------------------------------------------------+
| 权限管理                                      [成员][白名单][规则][机器人] |
+------------------------------+--------------------------------+
| 搜索 / 来源 / 数据等级筛选      | 成员详情                         |
| 成员表格                      | - 身份信息                       |
| - 姓名                        | - 平台角色                       |
| - 飞书 ID                     | - 数据权限                       |
| - 平台角色                    | - 权限来源                       |
| - 数据权限                    | - 最近查询 / 最近拒绝             |
| - 来源                        | [调整权限] [查看审计]             |
+------------------------------+--------------------------------+
```

成员表格字段：

| 字段 | 说明 |
| --- | --- |
| 成员 | 显示名、邮箱或飞书 ID |
| 来源 | 飞书 SSO、服务账号、系统创建 |
| 平台角色 | viewer、auditor、governance_admin、platform_admin |
| 数据权限 | 公开汇总、经营汇总、受控明细、无 |
| 权限来源 | 手动授予、M2 白名单、系统默认 |
| 状态 | active、disabled |
| 最近访问 | 最近一次 policy decision 或 gateway run |

右侧详情面板：

- 身份：`principal_id`、`open_id`、`union_id`、租户；仅审计/管理员视角展示。
- 平台角色：用 chip 展示，可编辑。
- 数据权限：单选展示最高等级，M2 自动包含 M0/M1。
- 来源解释：显示每个角色来自手动、白名单或系统默认。
- 生效信息：创建时间、更新时间、最后同步时间。
- 快捷动作：调整权限、撤销 M2、查看该成员审计。

调整权限弹窗：

只有具备 `access.write` 的治理/平台管理员可打开调整权限弹窗；普通 `viewer` 不可进入权限中心。

```text
平台角色
[ ] 普通用户 viewer
[ ] 审计人员 auditor
[ ] 治理管理员 governance_admin

数据权限
( ) 无数据读取
( ) M0 公开汇总
( ) M1 经营汇总
( ) M2 受控明细

变更原因
[________________________________]

[取消] [保存权限]
```

交互约束：

- `platform_admin` 不自动勾选数据权限。
- 撤销 M2 时提示“如果该成员仍命中白名单，下次同步可能重新授予”。
- 保存前展示变更摘要，不展示底层 `data_m0_reader` 等实现名。

### 5.2 M2 白名单

目标：把“默认 M2 权限从哪里来”解释清楚，并支持联调前批量配置。

布局：

```text
+---------------------------------------------------------------+
| M2 白名单                                       [导入] [同步预览] |
+-----------------------------+---------------------------------+
| 来源卡片                     | 白名单成员                       |
| - FEISHU_M2_READER_OPEN_IDS  | open_id / union_id / principal_id|
| - CUBIC3 allowed_user_ids    | 匹配状态                         |
| - 最近同步时间               | 同步动作                         |
+-----------------------------+---------------------------------+
```

关键能力：

- 当前 P0 支持读取 `open_id / union_id / principal_id` 配置并解释匹配结果。
- 当前 P0 的“同步预览”是只读联调视图：新增、已存在、无法匹配和当前已授予 M2 会清晰展示；写入、导入和失效移除进入 P1。
- 展示是否启用 `FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST`。
- 对无法匹配的 ID 给出“等待该用户首次 SSO 登录”提示。

同步预览表字段：

| 字段 | 说明 |
| --- | --- |
| 标识 | 输入的 open_id / union_id / principal_id |
| 匹配主体 | 命中的 `principal_id` |
| 结果 | 将新增、已存在、无法匹配、将移除 |
| 授权结果 | M0/M1/M2 数据角色 |
| 风险 | 是否与手动撤销冲突 |

### 5.3 数据访问规则

目标：让管理员理解每个数据等级的范围，不让其误以为平台策略替代 MaxCompute 权限。

布局：

```text
+---------------------------------------------------------------+
| 数据访问规则                                      [只读规则矩阵] |
+---------------------------------------------------------------+
| M0 公开汇总 | DIM / ADS | mc_m0_reader | 可查询                 |
| M1 经营汇总 | DWS       | mc_m1_reader | 可查询                 |
| M2 受控明细 | DWD       | mc_m2_detail_reader | 强审计           |
| M3 原始高敏 | ODS / RAW | 无在线身份 | 默认阻断                 |
+---------------------------------------------------------------+
```

第一版规则以只读展示为主。允许治理管理员编辑启停和说明文案，但不开放复杂条件表达式、行列级规则或审批流。

每行详情：

- 产品说明。
- 对应数据角色。
- 对应执行档案。
- gateway 限制：只读、最大行数、超时、导出策略。
- MaxCompute 兜底说明。
- 最近命中次数和最近拒绝原因。

### 5.4 硅基机器人接入

目标：服务账号和 API Key 可被管理，但不再拆成独立 tab；它们与真人成员合并在“主体权限”列表中，用“硅基生物”标识，并在右侧详情维护接入凭证。

列表字段：

| 字段 | 说明 |
| --- | --- |
| 名称 | Bot / Agent / Job 名称 |
| principal_id | 服务主体 ID |
| 授权范围 | 可调用能力 |
| API Key 状态 | active、revoked、expired |
| 最近调用 | 最近一次调用时间 |
| 操作 | 轮换、撤销、查看审计 |

交互约束：

- 创建 API Key 后只展示一次明文。
- API Key 只认证服务主体；代表真人查询时必须携带受信任委托上下文。
- 服务主体默认不拥有 M2 数据权限。

### 5.5 权限审计

目标：一次查询允许或拒绝后，审计人员能在 30 秒内定位发生在哪一层。

布局：

```text
+---------------------------------------------------------------+
| 权限审计                                                       |
| 筛选：成员 / 数据等级 / 决策 / reason_code / 时间 / trace_id    |
+------------------------------+--------------------------------+
| 审计列表                      | 判定详情                         |
| - 时间                        | 1. Principal resolve             |
| - 成员                        | 2. RoleBinding                   |
| - 数据等级                    | 3. DataPolicy decision           |
| - 决策                        | 4. ExecutionProfile              |
| - reason_code                 | 5. Gateway guard                 |
| - trace_id                    | 6. MaxCompute result             |
+------------------------------+--------------------------------+
```

列表字段：

| 字段 | 说明 |
| --- | --- |
| 时间 | 策略判定时间 |
| 主体 | `principal_id` + 展示名 |
| 数据等级 | M0/M1/M2/M3 |
| 决策 | allow、deny、governance_required |
| 命中策略 | policy code 或产品文案 |
| 执行档案 | `mc_m*_reader` |
| reason_code | 拒绝或告警原因 |
| trace_id | 跳转网关观测 |

详情时间线必须区分：

- 平台策略拒绝：`policy_denied`。
- gateway 拦截：`sql_guard_denied`、`resource_set_mismatch`、`credential_binding_missing`。
- MaxCompute 兜底拒绝：`maxcompute_access_denied`、`physical_denied_after_policy_allow`。

### 5.6 网关观测

目标：展示执行面健康和物理权限兜底，不复制 gateway 的事实源。

布局：

```text
+---------------------------------------------------------------+
| 网关观测                                                       |
| 健康状态 / 查询量 / 稳定性 / 物理拒绝 / 队列等待                |
+---------------------------------------------------------------+
| 趋势图：query count / stability / denied                       |
+------------------------------+--------------------------------+
| 最近查询运行                  | 运行详情                         |
| trace_id                      | credential_ref                   |
| principal                     | sql_guard                        |
| profile                       | maxcompute_instance_id           |
| status                        | reason_code                      |
+------------------------------+--------------------------------+
```

卡片指标：

- readyz 状态。
- 查询次数。
- 稳定性。
- SQL guard 拒绝数。
- MaxCompute access denied 数。
- `physical_denied_after_policy_allow` 数。
- 当前排队数和最大等待时间。

## 6. 关键状态与文案

无权限反馈：

```text
当前查询涉及 M2 受控明细数据，你当前只有 M1 经营汇总权限。
请联系治理管理员申请 M2 查询权限。
```

M3 阻断：

```text
该查询命中 M3 原始高敏数据。当前平台不支持直接在线查询，请先治理为 M2 受控明细或脱敏视图。
```

白名单解释：

```text
该成员的 M2 权限来自默认 M2 白名单。若手动撤销但仍保留在白名单中，下次同步可能重新授予。
```

物理兜底拒绝：

```text
平台策略已放行，但 MaxCompute 物理权限拒绝。请检查 RAM Project Role、对象授权或治理资产范围。
```

## 7. 后端联调契约

权限判定后传给 gateway 的上下文应保持最小可执行信息：

```json
{
  "schema_version": "GatewayAccessContext.v1",
  "principal_id": "feishu:tenant:union_id",
  "tenant_id": "default",
  "subject_type": "human",
  "data_scope": "M2",
  "execution_profile_id": "mc_m2_detail_reader",
  "policy_decision_id": "pd_xxx",
  "trace_id": "trace_xxx",
  "issued_at": "2026-06-09T14:00:00Z",
  "expires_at": "2026-06-09T14:05:00Z",
  "signature": "..."
}
```

gateway 不信任前端传入的角色、权限或数据范围，只信任服务端签名上下文。

## 8. P0 验收

- 白名单飞书用户首次登录后自动拥有 M0/M1/M2 数据权限。
- 非白名单飞书用户默认只有平台基础角色，没有 M2 数据权限。
- 成员详情能解释权限来源。
- 撤销 M2 后，M2 查询不能生成可执行上下文。
- M3 查询始终返回治理阻断。
- 审计页能解释 allow / deny / governance_required。
- 网关观测能串起 `policy_decision_id` 与 `trace_id`。
- MaxCompute 物理拒绝能显示为可理解的漂移告警。

## 9. 后续版本

| 阶段 | 范围 |
| --- | --- |
| P0 | 飞书身份、M2 白名单、主体权限、DataPolicy 判定、基础审计 |
| P1 | 白名单同步预览、权限来源展示、手动授予/撤销、拒绝原因优化 |
| P2 | 权限申请、审批、到期时间、临时授权、自动回收 |
| P3 | per-user RAM 或 STS session、MaxCompute 原生日志个人归因 |
