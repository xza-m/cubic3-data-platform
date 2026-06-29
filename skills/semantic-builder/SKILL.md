---
name: semantic-builder
description: 搭建/调试「问数·语义层」基础设施本身时用本 skill——对语义层做动作（建模、发布、调元数据、调试路由），而不是用问数查一个业务数值。关键：哪怕句子里有学校/年级/正确率/学情/知识点这类业务词，只要动词指向"建/发/改/调试语义层"，就用本 skill，不要因为有业务词就归给 dw-query。出现以下任一信号即触发：把表/宽表建成 cube 或 view 发布到语义层、发布成 virtual dataset、发布前看 diagnostics；改 cube/维度的 title 或元数据并重新发布、运维 active manifest；问数覆盖不了/答不出/缺某维度、某问题 ground/路由到哪个 cube、意图怎么 ground；盘点线上高频但没建模的维度、给建模排优先级；维护本体(object/metric/glossary/relation/policy)、做语义治理授权；浏览语义资产(datasource/asset/cube/manifest)。驱动 in-process 本地 CLI semctl（python -m app.interfaces.cli，后端容器内跑）。反向（→ 用 dw-query，不用本 skill）：只想要一个具体数字或一段明细数据（多少学生、正确率多少、拉某段数据），既没提建模/发布，也没问路由/覆盖/缺维度。
---

# semantic-builder：建设和运维 CUBIC3 语义平台

引导 agent 用语义平台的 CLI（本地引擎 `semctl` / 远程客户端 `cubic3-dp`）端到端**建设和运维语义层**：读资产 → 建模 → 发布 cube/view → 调试问数 → 治理。CLI 薄封装平台既有 application 服务。

## 何时用本 skill / 何时不用

| 用户想要 | 用 |
|---|---|
| 建模、发布 cube/view、维护本体、把表发进 manifest | **semantic-builder** |
| 调试问数：为什么这么路由、能不能答、缺什么维度、意图怎么 ground | **semantic-builder** |
| 看语义资产/manifest、语义层治理授权 | **semantic-builder** |
| **取业务数据**（"郑州基石中学有多少学生""5月答题正确率"等具体数值） | **dw-query** |

一句话：**要"操作/建设平台"用本 skill；要"业务数据本身"用 dw-query。** 本 skill 调试问数是看语义层"怎么理解这个问题"（route/intent/answerability），**不取数**。

## 怎么运行：两个入口，一套命令词汇

同一套命令词汇 + 同一 JSON envelope 契约，有**两个入口**，按你能不能进部署环境选：

| 入口 | 命令 | 覆盖 | 何时用 |
|---|---|---|---|
| **cubic3-dp**（远程，npm 可装） | `cubic3-dp <group> <verb> ...` | **只 T1 读/查询/调试** | agent 远程、只有网络（`npm i -g @cubic3/dp-cli`，需 `--base-url` + token） |
| **semctl**（本地引擎，exec） | `python -m app.interfaces.cli <group> <verb> ...` | **全功能**（T1 + 建模/发布写） | agent 能 exec 进部署（如 `docker exec`），写域必须走这条 |

```bash
# 本地引擎（全功能，含发布写）—— 当前部署容器 cubic3-data-platform-backend（docker ps 确认）
docker exec cubic3-data-platform-backend python -m app.interfaces.cli <group> <verb> ... 2>/dev/null
# 远程客户端（只 T1 读/查询）
cubic3-dp --base-url https://<平台>/  --access-token <jwt>  <group> <verb> ...
```

**关键：写域（cube draft/create/update、proposal 发布管线、release rollback、ontology upsert/publish）只在 semctl 提供**——cubic3-dp 上调它们会返回 `local_only` 指引你用 semctl。原因：写共享语义定义/live manifest 的信任边界是"能 exec 进部署"，不对远程 token 开放。

- **日志走 stderr、结果走 stdout**（默认 JSON envelope）。解析结果时加 `2>/dev/null` 丢日志。
- 输出契约：成功 `{"code":0,"message":...,"data":...,"trace_id":...}`；失败 `{"code":-1,"message":...}`。退出码：`0` ok / `1` error / `2` 用法错 / `4` not_found / `5` not_ready。**两入口同契约同退出码。**
- **先 `describe` 看命令目录、`schema <group> <cmd>` 看某命令的参数契约**（不 boot app，最省）。

## 核心纪律（务必遵守，这是平台架构的硬约束）

1. **读结构先于写，不凭自然语言猜**。要建模/发布前，先 `asset list/fields`、`cube list/describe`、`manifest show` 把真实表名、列、已发布资产看清楚。猜表名/字段名是最常见的错误来源。
2. **离线优先，绕开 MaxCompute**。资产列默认走缓存（`asset fields` 读 `data_asset_fields`），不要触 live MaxCompute（dev 环境会挂）。建 cube 草稿用 `cube draft`（喂缓存列），不要走会打 MaxCompute 的 live 路径。
3. **写操作三件套**。所有写命令先 `--dry-run` 预览，确认无误再 `--yes`。没有 `--yes` 会被拒（exit 2）——这是防误写的护栏，不要绕过。
4. **发布走门，不绕门**。新 cube 发布走完整提案管线（见下），它会跑 binding-matrix / policy / sensitivity 发布门。不要去手搓 `release publish` 塞 `gate_result={'decision':'allow'}` 绕过治理门——那会污染 DataChat 正在消费的 live manifest。
5. **写 live manifest 要人确认**。`proposal publish` / `release rollback` 改的是共享生产基础设施（DataChat 实时消费的 active manifest）。发布前把门结果摊给用户、拿到明确授权再 `--yes`。发布前先记下回滚锚点（`manifest show` 的 release_id）。
6. **持久化双轨别混**。`ontology <kind>` 命令查的是 ontology definition_service 轨；proposal 发布的本体进的是 registry/manifest 轨。两轨不互通——发布过的 cube 用 `ontology` 命令查会 not-found，这是正常的。

## 命令地图（🌐=两入口都可 / 🔒=仅 semctl 本地引擎）

```
🌐 datasource list/show                  # 数据源
🌐 asset     list/show/fields/evidence   # 物理表资产（读缓存，绕 MaxCompute）
🌐 cube      list/show/describe          # cube 定义（read）
🔒          draft/create/update          # cube 建模（write）
🌐 view      list/show/describe          # 语义 view（show 零写 / describe 会同步 registry）
🌐 ontology  <kind> list/show/status     # 本体读（kind=object/property/metric/glossary/relation/action/policy）
🔒          <kind> upsert/publish        # 本体写（upsert 全量覆盖无 PATCH，先 show 再改）
🌐 manifest  show                        # active runtime manifest（已发布口径）
🌐 query     compile/plan/explain        # 语义编译/规划（preview-only，不出数）
🌐 intent    route/extract/answerability # 问数调试：路由/意图/可回答性
🌐 chat      observe                     # 观察 DataChat 问数（结果分布+缺口维度；HTTP 端点需 admin）
🔒 proposal  create/confirm-source/update-spec/draft/validate/gap/approve/apply/publish  # 7步门控发布管线
🌐 release   list/show                   # 发布读
🔒          rollback                     # 回滚 live manifest 安全网
🔒 schema    <group> [<cmd>]             # 命令参数自描述（semctl；不 boot app）
```

🔒 写域命令在 cubic3-dp 上会返回 `local_only`，必须用 `python -m app.interfaces.cli`（exec 进部署）执行。

## 黄金工作流

### A. 看清平台（任何任务的第一步）
`datasource list` → `asset list` / `asset fields <table_id>` → `cube list` → `manifest show`（看 active 发布了哪些）。

### B. 调试问数（"为什么这个问题答不出/路由错了"）
`intent route "<问题>" --runtime-mode official` → 看 route_type / matched_entities；
`intent answerability "<问题>" --runtime-mode official` → 看 state（answerable / out_of_coverage / out_of_scope）+ 缺口维度；
`intent extract "<问题>"` → 看 L1 grounded 意图；
`chat observe` → 看线上问数结果分布 + 最常被问但没建的维度（驱动建模优先级）。
**注意**：official 模式依赖 active manifest 已发布；问"为什么 X 答不出"多半是**建模覆盖缺口**（维度没建），不是 L1 不行——这时去建模补全（工作流 C）。

### C. 把物理表建模并发布成 cube（闭合覆盖缺口的核心流程）
这是写 live manifest 的消费级操作，**严格按门控管线走，并在 publish 前拿用户授权**。详细的 spec 模板与发布门要求见 **[references/publish-cube.md](references/publish-cube.md)**，必须先读它再动手。概要：
1. `asset fields <table_id>` 读真实缓存列 →（可选）`cube draft --source-id N --database D --table T --columns-from <table_id>` 生成 cube 草稿。
2. 构造 v1 spec（cube + 最小 ontology + governance），关键是过三道发布门（policies 非空 / object+metric 绑定可解析 / sensitivity=internal）。
3. `proposal create` → `proposal update-spec <id> --spec @spec.json`（注入整份 spec，绕 draft 的 MaxCompute）→ `proposal validate <id>` → `proposal gap <id>`（看门结果，blockers 应为空、primary_action=approve）。
4. **把门结果摊给用户、拿到授权** → `proposal approve` → `proposal apply`（写 registry）→ `proposal publish`（写 live manifest）。
5. 验证：`manifest show`（cube 数 +1）+ `intent answerability "<相关问题>"`（应从 out_of_coverage 变 answerable）。
6. 出问题回滚：`release rollback <发布前的 release_id>`。

### D. 维护本体 / 治理
`ontology <kind> show <name>` 读现有 → 改 → `ontology <kind> upsert <payload> --yes`（全量覆盖，必须先 show 取全字段再改，否则丢字段）→ `ontology <kind> publish <name> --yes`（draft→active）。

## 禁止行为（违反会出事）
- ❌ 不读结构就猜表名/字段名建模。
- ❌ 跳门控顺序，或手搓 `release publish` 绕治理门。
- ❌ 写命令不 `--dry-run` 就直接 `--yes`。
- ❌ 未经用户授权就 `proposal publish` / `release rollback` 改 live manifest。
- ❌ 用本 skill 去取业务数据（那是 dw-query）。

## 参考
- 完整命令参考：仓库内 `app/interfaces/cli/README.md`
- 设计与分期：`docs/architecture/semantic-platform-cli-plan.md`
- 发布 cube 的 spec 模板与门要求：[references/publish-cube.md](references/publish-cube.md)
