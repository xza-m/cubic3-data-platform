# 双路 CLI 设计方案（in-process 引擎 + http-client 分发）

**status:** draft（待评审 / 设计方案）
**created:** 2026-06-29
**owner:** 语义中心 / 平台工程
**scope:** 定义语义平台 CLI 的双路架构、职责划分、命令词汇表统一、API 端点缺口、安全边界、分发与 skill 一致性
**配套:** [`semantic-platform-cli-plan.md`](semantic-platform-cli-plan.md)（§2 枢纽决策）、`semantic-binding-and-rls.md`

---

## 1. 背景与问题

平台目前**有两套 CLI 实现 + 一个 npm 分发壳**，且彼此命令集/架构不一致：

| 产物 | 是什么 | 命令 | 能否 npm 分发 |
|---|---|---|---|
| `app/interfaces/cli/`（**semctl**） | in-process：`create_app(role='worker')`+DI 直调，P0-P3 全功能 | `python -m app.interfaces.cli` | ❌ 需整个 app+DB |
| `cli/cubic3_dp_cli/`（**cubic3-dp**） | http-client：Typer 打 `/api/v1` | `cubic3-dp` | ✅ 独立 |
| `packages/cubic3-cli/` | npm 壳 `@cubic3/dp-cli`（verdaccio），postinstall 装上面的 Python http-client | `cubic3-dp` | ✅ |

**问题**：丰富功能（建模/发布/问数调试）都建在**不可分发**的 semctl 上；要发 npm 私仓 + skillhub 的是 cubic3-dp（http-client），命令集小得多。**skill 教 semctl，发布物是 cubic3-dp，对不上。**

**本质约束**（为什么不能"全 in-process 分发"）：in-process CLI 启动即 `create_app()` 直连 PG/Redis、以 Python 函数调用业务逻辑——它**就是后端的一部分**，只能在部署环境内（容器/exec）跑，物理上无法 `npm install` 到别处。可分发的必须是 http-client（自包含、只需 URL+token）。

## 2. 核心决策：双路，按职责切

**保留双路，按职责切分**（不是"全 http"，也不是粗暴的"建模 vs 查询"）。三视角一致支撑（grounding 2026-06-29）：

- **API 端点缺口**：semctl 11 个命令域里，**6 个读/查询域已 http-ready 零新建**（datasource/asset/cube读/view/query/release），3 个低成本补端点（ontology status / manifest / chat observe），**真正缺端点的是 proposal 7 步发布管线（~8-9 端点 + 在 HTTP 侧重做门控）**。
- **业界范式**：dbt-core / Atlas / Flyway / Supabase local-dev —— **凡"编译/diff 真实 schema/改模型"的重写域都长在本地执行引擎**；云 API 版（dbt Cloud CLI）的前提是先有 stateful backend 托管引擎。semctl 的 in-process 核**就是这个本地引擎**。
- **安全边界**：改全局共享生产态的写（`proposal publish` 写 live manifest、`ontology publish`、`governance 授权`）——信任边界应是"**能 exec 进运行环境**"，强于"持有效 token"，**绝不对任意远程 token 持有者开放**。

> 一句话原则：**"门控发布引擎 + 改 live 共享态的写"留 in-process（exec 信任）；"读/查询/preview"走 http-client（可分发）。** 中间态写（cube/ontology 定义）默认 in-process，要开 HTTP 必须 require_admin role-binding。

## 3. 职责划分（三层 × 逐域）

| 层 | 命令域 | API 端点现状 | 鉴权 | 归属 face |
|---|---|---|---|---|
| **T1 读/查询/preview** | datasource list/show · asset list/show/fields/evidence · cube list/show/describe · view list/show/describe · query compile/plan/explain · intent route/extract/answerability · release list/show · manifest show · chat observe | datasource/asset/cube/view/query/release **已有**；manifest/chat-observe **缺薄端点**；intent extract/answerability 是 route 投影 | require_auth | **http-client（分发）** + in-process 都有 |
| **T2 门控发布引擎** | **proposal 7 步**（create→confirm-source→update-spec→draft→validate→gap→approve→apply→**publish**） | **零端点**；HTTP 化要补 ~8-9 + 重做硬顺序门/dry-run/idempotency/binding-matrix | **exec-only**（默认不开 HTTP） | **in-process 专属（semctl）** |
| **T3 中间态写** | cube create/update/draft · ontology upsert/publish/status · release rollback · governance 授权 | cube/ontology/rollback **多已有端点**（rollback 已 @require_admin） | **require_admin**（role-binding，非 JWT 自带 roles） | 默认 in-process；按需开 HTTP（门到写角色） |

**关键修正**（相对"建模=in-process"的粗划）：`cube create/update` 这类**建模写其实已有端点**，可按 T3 开 HTTP（门到写角色）。真正**必须留本地**的是 **proposal 门控发布管线 + 写 live manifest** —— 它端点最缺、门控逻辑最不能在 HTTP 重写、安全上最不能远程 token 调。

## 4. 目标架构：一个命令核 + 两后端（pluggable transport）

借鉴 Terraform/Supabase「同一前端、transport 可切」范式。把**命令定义抽成不依赖 app 的共享核**，后端（in-process DI vs HTTP）可插拔：

```
            ┌──────────────────────────────────────────────┐
            │  semantic_cli_core（共享库，无 app 依赖）        │
            │  · 命令树(click groups/commands)+参数+输出契约     │
            │  · Backend 协议: list_datasources()/compile_query()/...│
            └───────────────┬───────────────┬──────────────┘
            in-process 后端  │               │  http 后端
        （app/interfaces/cli, │               │ （cli/cubic3_dp_cli,
          imports app, DI 直调）│               │   requests→/api/v1）
                T1+T2+T3      │               │      T1（+T3 conditional）
                semctl 入口    │               │      cubic3-dp 入口（npm 分发）
```

- **共享核**：命令名、参数、JSON envelope、退出码、写三件套（--dry-run/--yes）——**定义一次**。
- **in-process 后端**：`Backend` 实现 = DI 直调，住 `app/interfaces/cli`，全功能（含 T2 proposal）。
- **http 后端**：`Backend` 实现 = HTTP 请求，住 `cli/cubic3_dp_cli`（可分发，不依赖 app）。只实现 T1（+T3 conditional）；**T2 命令在 http 后端直接返回 `local_only` 错误**（指引用户用 semctl/exec）。

**收益**：一套命令词汇表、两个后端；skill 只教一套词汇；T1 命令两路行为一致（parity 测试守）；T2 自然只在本地。

> 现实路径：完全抽共享核是重构，分期做（见 §10）。Phase 1 先**把 cubic3-dp 命令树重皮成 semctl 命名 + 统一输出契约**（底层端点多现成），即可让 skill 一致；Phase 2 再抽共享核消重。

## 5. 统一命令词汇表

**唯一真源 = semctl 的命令树**。cubic3-dp 现有命令重皮对齐：

| 现 cubic3-dp | → 统一词汇（semctl 命名） | 层 | http 后端 |
|---|---|---|---|
| `datasource list` | `datasource list` / `+ show` | T1 | ✅ |
| `semantic assets list/fields/evidence/radar` | `asset list/fields/evidence` / `asset diagnose` | T1 | ✅ |
| `semantic assets sync` | `asset sync` | T3 | ⚠ require_admin |
| `semantic health` | `manifest show`（+ 保留 health 探活） | T1 | ✅（补端点） |
| `semantic plan` | `query plan` | T1 | ✅ |
| `semantic execute` | `query run/execute`（P2 延后；MaxCompute/gateway） | T1\* | 后续 |
| （新）| `cube list/show/describe`、`view list/show`、`ontology <kind> list/show/status`、`intent route/extract/answerability`、`query compile/explain`、`release list/show`、`chat observe` | T1 | ✅/薄补 |
| （新，写）| `cube create/update`、`ontology upsert/publish`、`release rollback` | T3 | ⚠ require_admin |
| （本地专属）| `proposal create…publish`、`cube draft` | T2 | ❌ local_only |
| `auth *` / `governance audit` | 保留 | — | ✅ |

两个入口（`semctl` 本地 / `cubic3-dp` 远程）**子命令完全同名**，差别只在"在哪跑 + 覆盖多少层"。

## 6. API 端点缺口与补建清单

让 cubic3-dp 追平 T1，需补的**薄端点（约 3-4 个，均转调现有服务）**：

1. `GET /api/v1/semantic/manifest?namespace=&release=` —— 转调 `runtime_snapshot_service.get_active_manifest / get_manifest_for_release`，沿用 `ok/error_code` + EXIT_NOT_READY 语义。
2. `GET /api/v1/semantic/ontology/<entity_type>/<name>/status` —— 转调 `entity_status`（list/show/upsert/publish 端点已齐）。
3. `GET /api/v1/.../datachat/observe?limit=&channel=` —— 需把 chat observe 的聚合（status 分布 + 缺口维度正则 + 样例）**下沉成一个 application 读服务**（中等成本，唯一需新建服务的 T1 项）。
4. （可选）`intent extract/answerability` —— route 端点已返回 `business_intent.*`，http 后端**客户端自投影即零端点**；要对齐 CLI 形态可补 2 个薄端点。

**明确不建**：proposal 7 步管线的 HTTP 端点（T2 留 in-process）；query run/execute（P2 延后，MaxCompute/gateway 阻断）。

## 7. 安全 / 治理映射

| 命令类 | HTTP 暴露 | 鉴权口径 |
|---|---|---|
| T1 读/preview | ✅ 安全 | `require_auth`（JWT 认证即可） |
| T3 中间态写（cube/ontology/asset sync/rollback/governance） | ⚠ 可开，但**必须** | `require_admin` —— 经 `access_role_bindings` 服务端解析的写角色（governance_admin/modeling_writer），**非** JWT 自带 roles |
| T2 proposal publish（写 live manifest） | ❌ 默认不开 | exec-only；即便将来开也仅 platform_admin |

**判定原则**：①改全局共享运行态的写 = in-process-exec-only 为默认安全态；②写定义未上线的中间态 = conditional（门到写角色）；③读/preview = 可安全开 HTTP。平台已有正例：`release rollback`/governance 写挂 `@require_admin`。

## 8. 分发与打包

- **http-client（cubic3-dp）= 唯一分发物**：`packages/cubic3-cli`（npm `@cubic3/dp-cli`，verdaccio）postinstall 装 `cli/cubic3_dp_cli`（Python）。对齐 `@gil/maxcompute-cli` + BI CLI 范式（npm 壳包 Python）。其他 agent（Codex 等）`npm install -g` 即可用 T1。
- **in-process（semctl）= 不分发**：随后端镜像走，靠 `docker exec` / 进容器使用，承接 T2/T3。像 dbt-core——引擎不分发。

## 9. skill 一致性

`semantic-cli` skill 改为教**统一词汇表**（§5），并显式标注每命令的 face：

- T1 命令：标 "远程可用（`cubic3-dp`）/ 本地（`semctl`）"。
- T2/T3 写命令：标 "**本地引擎专属**：proposal 发布管线 / 写 live manifest 走 `semctl`（需 exec 进部署），远程 `cubic3-dp` 不提供"。
- `references/publish-cube.md` 明确：发布走 semctl（exec），不走 npm 分发的 cubic3-dp。

skill 源应随 cubic3-dp 一起发 skillhub（与 dw-skills 从 gitlab 源发布同构），与发布的 CLI 同版本演进。

## 10. 分期实施路线

| 期 | 内容 | 产出 |
|---|---|---|
| **D1 命名对齐** | 把 `cli/cubic3_dp_cli` 命令树重皮成 semctl 命名 + 统一 JSON envelope/退出码（底层端点多现成）；补 3-4 个薄端点（manifest/ontology-status/chat-observe[+服务]/可选 intent） | cubic3-dp 覆盖 T1 全集、与 semctl 同词汇 |
| **D2 安全门** | T3 写端点统一挂 `require_admin` + 写角色 role-binding；T2 在 http 后端返回 `local_only` | 安全边界落地 |
| **D3 skill+分发** | skill 改教统一词汇 + 标 face；`@cubic3/dp-cli` 发 verdaccio；skill 发 skillhub | 对外一致 |
| **D4 抽共享核（可选/长期）** | 抽 `semantic_cli_core`（命令树+Backend 协议），两后端复用；parity 测试 | 消除两套命令树重复 |

**建议起手 D1**（命名对齐 + 薄端点）——这是"开发侧一致"的最小闭环，做完 skill 与发布物就对齐了；D4 是长期消重，不阻塞分发。

## 11. 边界 / 不做

- 不为 proposal 7 步管线建 HTTP 端点（T2 留 in-process）。
- 不把 in-process semctl 做成可分发物（物理不可行）。
- 不做 MCP（§2 已定）。
- 不在 http 层重写门控/idempotency/binding-matrix 逻辑（复用 in-process 引擎）。

## 12. 验收

- `cubic3-dp <T1命令>` 与 `semctl <同命令>` 输出契约一致（同 JSON envelope/字段/退出码）。
- `cubic3-dp proposal publish` 返回清晰的 `local_only` 指引，不尝试执行。
- T3 写端点未持写角色 → `require_admin` 拒绝。
- `npm install -g @cubic3/dp-cli` 在无 app/无 DB 的机器上可跑 T1。
- skill 教的命令名在 cubic3-dp（远程）与 semctl（本地）都成立，本地专属命令已标注。

---

*核心：in-process 是"本地引擎"（重写/门控发布，exec 信任，不分发），http-client 是"可分发客户端"（读/查询，npm 全局）。一套命令词汇，两个后端，skill 教一套。*
