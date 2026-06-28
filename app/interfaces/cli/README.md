# semctl — in-process 语义平台本地 CLI（agent 操作面）

把语义平台能力包成命令，让 agent（Claude/Codex）端到端操作语义层。薄封装既有
application 服务，零新建领域逻辑、零新建端点。设计见
[`docs/architecture/semantic-platform-cli-plan.md`](../../../docs/architecture/semantic-platform-cli-plan.md)。

当前覆盖 **P0（骨架）+ P1（只读读域）**。

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
| `ontology <kind> list / show <key>` | 本体（kind: object/property/metric/glossary/relation/action/policy；glossary 主键为 canonical_name） |
| `manifest show [--namespace] [--release]` | 已发布运行态 manifest（active 口径） |

## 约定

- **输出**：成功 `{"code":0,"message":"success","data":...,"trace_id":null}`；失败 `{"code":-1,"message":...}`。
- **退出码**：`0` ok · `1` error · `2` usage · `4` not_found · `5` not_ready。
- **身份**：`--principal <id>`（P1 只读不强制；写域用）。
- **离线优先**：资产/字段默认读缓存绕开 MaxCompute live。

## 边界（尚未做）

写域（cube draft / proposal 7 步 / release publish / ontology upsert）= P3；治理写 = P4；
远程 agent 走既有 HTTP（`cli/cubic3_dp_cli`），本 CLI 不做 MCP。
