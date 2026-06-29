# semctl — in-process 语义平台本地 CLI（agent 操作面）

把语义平台能力包成命令，让 agent（Claude/Codex）端到端操作语义层。薄封装既有
application 服务，零新建领域逻辑、零新建端点。设计见
[`docs/architecture/semantic-platform-cli-plan.md`](../../../docs/architecture/semantic-platform-cli-plan.md)。

当前覆盖 **P0（骨架）+ P1（只读读域）+ P2（查询/意图/观测，preview-only）+ P3（建模/发布写域）**。

## 运行

在平台运行环境内（容器/exec/SSH，需 `app` 可导入 + DB 可达）：

```bash
python -m app.interfaces.cli <group> <verb> [args] [--output json|human] [--principal <id>]
# 容器内：docker exec <backend> python -m app.interfaces.cli ...
```

装配：`create_app(role='worker')` + `app_context` + DI 容器直调（参考 `run_worker.py`）。
日志走 stderr，结果走 stdout（默认 JSON envelope，agent 的稳定机器可读契约）。

## 命令（P1）

| 命令 | 说明 |
|---|---|
| `describe` | 输出 agent 可读的命令目录（自描述，不 boot app） |
| `me` | 解析 `--principal` 的身份与角色（鉴权链路自检） |
| `datasource list / show <id>` | 数据源（连接配置脱敏） |
| `asset list / show <table_id> / fields <table_id> / evidence <table_id>` | 数据资产物理表（读 PG 缓存，**不触 MaxCompute live**） |
| `cube list / show <name> / describe <name>` | Cube 定义口径（YAML 全集含 draft）。`show`=零写摘要，`describe`=详情（会同步 registry） |
| `ontology <kind> list / show <key> / status <key>` | 本体读（kind: object/property/metric/glossary/relation/action/policy；glossary 主键为 canonical_name） |
| `ontology <kind> upsert <payload> / publish <key>` | 本体写（upsert **全量覆盖无 PATCH**，先 show 再改；publish draft→active；三件套） |
| `view list / show <name>` | 语义 View 定义（只读） |
| `schema <group> [<cmd>]` | 输出命令的参数契约（click 内省，**不 boot app**，agent 自描述） |
| `manifest show [--namespace] [--release]` | 已发布运行态 manifest（active 口径） |
| `query compile <dsl>` | 裸 QueryDSL → SQL（纯编译，dev 口径；draft/未绑定 cube 会忠实报错） |
| `query plan <question>` | NL → 语义路由规划（含 planning_steps，`--runtime-mode official\|preview`） |
| `query explain <question>` | NL → 编译预览 SQL（compiled_targets，**preview-only 不出数**） |
| `intent route <question>` | 语义路由（命中实体 / route_type / 可回答性；official 才走已发布 catalog） |
| `intent extract <question>` | L1 意图理解产物（grounded，取自 route，含 candidate_assets 白名单，与真实管线同源） |
| `intent answerability <question>` | 四态可回答性门控（取自 route 的 business_intent.answerability） |
| `chat observe [--limit] [--channel]` | 观察 DataChat 问数：结果分布 + 缺口维度 + 样例（读 AgentQueryLog） |
| `cube draft --source-id/--table/--columns-from` | 从缓存列生成 cube 草稿 payload（**绕 MaxCompute**，只读供 review） |
| `cube create <draft> / update <name> <patch>` | 落 YAML cube 定义（写，三件套） |
| `proposal create/confirm-source/update-spec/draft/validate/gap/approve/apply/publish` | 7 步门控提案管线（`gap` 只读看门；`publish` 写 live manifest） |
| `release list / show <id> / rollback <release_id>` | 语义发布（读 + 回滚 live manifest 安全网） |

### 写域约定（P3）

写命令一律 **`--dry-run`（预览不写）/ `--yes`（确认）/ 默认拒**。发布顺序门：
`proposal create → update-spec（注入整份 spec，绕 draft 的 MaxCompute）→ validate → approve（须 validated）→ apply（→registry）→ publish（→live manifest）`。
`proposal draft` 默认会打 MaxCompute（dev 易挂），需 `--allow-live` 显式放行——已 `update-spec` 时无需 draft。
回滚：`release rollback <健康 release_id>`。

## 约定

- **输出**：成功 `{"code":0,"message":"success","data":...,"trace_id":null}`；失败 `{"code":-1,"message":...}`。
- **退出码**：`0` ok · `1` error · `2` usage · `4` not_found · `5` not_ready。
- **身份**：`--principal <id>`（P1 只读不强制；写域用）。
- **离线优先**：资产/字段默认读缓存绕开 MaxCompute live。

## 边界（尚未做）

P2 延后（标注原因）：`query run/execute/status`（MaxCompute/gateway/RLS dev 阻断）、
`query diagnose`（写 `semantic_diagnose_runs` + 需新建聚合）、`intent eval`（脚本移植 + 真实 LLM）。
治理写（principal/grant/scope/policy）= P4；`view validate/publish`（写/需构造 ViewDefinition）后续。
远程 agent 走既有 HTTP（`cli/cubic3_dp_cli`），本 CLI 不做 MCP。
