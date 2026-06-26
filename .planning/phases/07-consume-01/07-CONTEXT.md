# Phase 7: 语义消费收口·发布累积 - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** 已完成根因调查 + 多智能体 workflow 对抗审查(verdict: sound)+ 本会话 DB 实测,直接锁为决策,跳过重复研究。

<domain>
## Phase Boundary

只做"发布/release 侧"的累积修复:让 active runtime manifest 累积 namespace 内所有已发布资产、成为完整多 cube 目录(含一次性基线重建)。**不碰消费侧**(不切 DataChat official、不改 grounding、不改 discovery —— 那是 Phase 8)。

**根因(已实测坐实)**:`semantic_release_service.publish`(:140-163)构建 `manifest_assets` 只来自本次 proposal 的 `revisions`,不带 namespace 既有 active 资产 → 每次发布**整盘替换** active manifest。实测三个快照 `asset_manifest_json.assets` 长度全 = 1;`RuntimeSemanticToolService.list_cubes()` 只返回 1 个 cube。后果:官方运行时目录任意时刻只有最后发布的那一个 cube,DataAgent/未来的 DataChat 都只能消费单 cube。
</domain>

<decisions>
## Implementation Decisions

### D1 发布累积(核心)
- 改 `app/application/semantic/semantic_release_service.py::publish`(约 140-163):构建新 release 的 `release_assets` / `manifest_assets` 时,先取 namespace 当前 active release 的 assets(`prev_id = self._release_repository.get_active_release_id(namespace)`;`prev_assets = self._release_repository.list_release_assets(prev_id)`,各自经 `get_revision(asset.revision_id)` 拿 `spec_json`/`spec_checksum`),与本次 `revisions` **按 `asset_key` 合并**:用 dict 以 `asset_key` 为键,先放 prev_assets,再用本次 revisions 覆盖同 `asset_key` 项;最终 `release_assets`/`manifest_assets` 都按合并结果生成。manifest asset 形状沿用现有(asset_id/asset_type/asset_key/revision_id/spec_checksum/spec=`_activated_spec(spec_json)`/status="published")。
- `prev_id` 为空(首次发布)时退化为只含本次 revisions,行为不变。

### D2 rollback 语义对齐
- `rollback_to`(:196)已是"复制 target release 的全部 assets"。改累积后,新 release 本就是全量,语义自洽,**通常无需改 rollback 逻辑**;planner 需确认 rollback_to 不会因累积引入重复 asset_key(target release 内不应有重复)。

### D3 一次性基线重建
- 因历史每次发布都替换,"当前应在线的 cube 集合"信息已丢(只剩最后 active)。需提供一个一次性动作/脚本,把"当前应在线的 cube 集合"(**至少**:答题 cube `dws_study_student_answer_kb_stat_di` + comment demo 的 cube)合并发一个全量 active release 作为起点。
- 实现优先级:基线重建可作为可重复执行的运维脚本/服务方法(读指定 release_id 列表或指定 asset 集合 → 合并成一个新的全量 published release + active snapshot),不必做成迁移。具体"应在线集合"的确定方式由 planner 设计最小可行方案(如:取各 asset_key 最新已发布 revision 的并集)。

### D4 测试先行(TDD,硬要求)
- **RED**(改前先写、必须先失败/先证明现状):构造连续发布 A、B 的场景,断言改前 active manifest `assets` 只含 B(证明不累积);断言 comment ontology 不在当前 active manifest。
- **GREEN**(改后):active manifest `assets` 含 A+B 两条(按 asset_key 去重);rollback 到全量 release 恢复全量;release 状态机不回归(published→superseded、单 namespace 单 active 不变量)。

### Claude's Discretion
- 基线重建的入口形态(service 方法 vs 一次性脚本)、合并去重的具体数据结构、测试夹具的装配方式(参照现有 release 服务测试)由 planner/executor 定,守住"改动最小、不翻新"。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 发布/release 核心(本期主改)
- `app/application/semantic/semantic_release_service.py` — `publish`(:102-194)、`rollback_to`(:196-280)、`_activated_spec`;manifest_assets 构建处是改点。
- `app/infrastructure/semantic/**` 的 release repository 实现 — `get_active_release_id` / `list_release_assets` / `get_revision` / `get_asset_by_id` / `publish_with_snapshot` 的真实签名与事务边界(planner 必须读实现确认方法名/参数)。
- `app/application/semantic/runtime_manifest_catalog.py` — `RuntimeSemanticCatalog.from_manifest` / `_collect_spec`(消费侧如何解析 manifest assets;改累积后要保证多 asset 仍被正确解析,作为下游契约锚点,本期不改它)。

### 契约/不回归锚点
- `app/application/agent/services/runtime_semantic_tool_service.py` — `list_cubes()`/`query()`(消费侧读 manifest;累积后应能列出多 cube)。
- 既有 release 服务单测(planner 用 grep 定位 `tests/**` 下 semantic_release / runtime_snapshot 相关测试)— 复用其装配 + 不回归。
- `frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts` — comment demo 发布链路(`source=='sql_registry'`、release/snapshot);本期不得打挂。

### 架构方向(对齐"单一事实源")
- `docs/architecture/semantic-binding-and-rls.md` §1.4 — "semantic router 统一切 RuntimeSemanticCatalog(published manifest)";本期把 manifest 做成完整目录,为此铺路。
- `docs/architecture/README.md` — "生产事实源已切 SQL Registry/Release/Runtime Snapshot,YAML 不做生产双写"(故**禁止**写 YAML 的替代方案)。

</canonical_refs>

<specifics>
## Specific Ideas

- 后端测试命令:`PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider <path>`。
- 实测基线(本会话):active 快照 `snap_828498e6`(release `rel_7a7edc30`)仅含 1 个 asset `dws_study_student_answer_kb_stat_di`;comment ontology 不在其中。
- 若需迁移:alembic revision id ≤ 32 字符(`alembic_version.version_num varchar(32)`)。但本期优先无迁移(纯服务层 + 可重复运维动作)。

</specifics>

<deferred>
## Deferred Ideas（本期明确不做,留 Phase 8/9）

- 不改 `send_message_handler`(不切 DataChat `runtime_mode="official"`)—— Phase 8。
- 不改 grounding 匹配算法 / 不激活 LLM 意图抽取。
- 不改 `GET /semantic/cubes` discovery 同源 —— Phase 8。
- 不写任何 YAML(`ontology/` 或 `semantic/cubes/`)—— 违背"不双写"。
- 不动编译器分区/裸查询保护。
- 文档对齐与全平台 verify —— Phase 9。

</deferred>

---

*Phase: 07-consume-01*
*Context gathered: 2026-06-26（根因调查 + workflow 对抗审查 sound + DB 实测,跳过重复研究）*
