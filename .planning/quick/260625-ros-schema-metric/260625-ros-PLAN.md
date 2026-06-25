---
phase: quick-260625-ros
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/application/semantic/data_asset_service.py
  - tests/unit/application/semantic/test_data_asset_service.py
  - tests/unit/application/semantic/test_modeling_spec_repair.py
autonomous: true
requirements:
  - ROS-SCHEMA-PARTITION-01

must_haves:
  truths:
    - "确定性同步写入的 schema 快照对真实分区表会携带 is_partition 列标记和顶层 partitions 列表"
    - "冷启动 agent_led 建模链路对含 ds 分区的真实表能自动把 ds 补进 cube.dimensions 并设为 metric.time_dimension，发布门禁不再卡 metric_time_dimension_missing"
    - "评论 canonical 路径继续整块替换 cube 走评论时间口径，不被分区透传污染（两路径正交）"
  artifacts:
    - path: "app/application/semantic/data_asset_service.py"
      provides: "_schema_snapshot_payload 透传 is_partition + 生成顶层 partitions"
      contains: "partitions"
    - path: "tests/unit/application/semantic/test_data_asset_service.py"
      provides: "快照分区透传单测"
    - path: "tests/unit/application/semantic/test_modeling_spec_repair.py"
      provides: "ds 端到端确定性补全单测 + 评论不回归单测"
  key_links:
    - from: "app/application/semantic/data_asset_service.py::_schema_snapshot_payload"
      to: "app/application/semantic/modeling_spec_repair.py::_partition_field_from_schema"
      via: "schema_snapshot.partitions / columns[].is_partition"
      pattern: "partitions|is_partition"
    - from: "app/application/semantic/modeling_spec_repair.py::_ensure_partition_time_dimension"
      to: "app/application/semantic/modeling_validation_matrix.py::_metric_blockers"
      via: "cube.dimensions[ds] → metric.time_dimension"
      pattern: "time_dimension"

notes:
  - "存量回填前提（运维动作，非代码任务）：build_table_evidence (data_asset_service.py:176) 优先读旧持久化快照，本修复只对新写入的快照生效。已落地的旧表（dws_study_student_answer_kb_stat_di）需在部署后重新同步/重新写快照才会带上 partitions；该重同步 + 真实发布验证由执行者在运维阶段自行完成，不纳入本计划代码范围。"
  - "字段级 AssetField.profile 已有 {is_partition: true}（profile 透传链 _fields_from_payload:253 → AssetField.profile → 仓储 profile_json 376/396 往返完整），docker 实测 ds 字段 profile 即含该标记，本修复只是在快照构建函数把它读出来透传，不改任何上游写入或映射。"
  - "显式不改：_candidate_cards / field_candidates / classifier / modeling_spec_repair 派生逻辑——它们契约已正确，改动会引入脆弱硬编码 + LLM 依赖，违反 CLAUDE.md「内网单机不翻新、改动最小」。"
---

<objective>
修复冷启动确定性建模发布缺口：确定性同步对真实分区表写持久化 schema 快照时，`_schema_snapshot_payload` 丢弃了列级 `is_partition`、也不生成顶层 `partitions` 列表，导致下游 `modeling_spec_repair` 派生链读不到分区 → `ds` 进不了 `cube.dimensions` → `metric.time_dimension` 为空 → 撞 `modeling_validation_matrix._metric_blockers` 的 `metric_time_dimension_missing`（required）发布门禁卡死。

根因为单点：`AssetField.profile` 本身已带 `{"is_partition": true}`（docker 实测 ds 字段如此），只是被快照构建函数扔掉。下游派生链（`_ensure_cube_partition_from_evidence` / `_ensure_partition_time_dimension` / `_default_time_dimension` 偏好列表已含 "ds"）完整正确，只是读不到分区数据。

Purpose: 让维表/分区事实表的冷启动确定性建模能自动获得默认时间维度，打通发布门禁，无需人工补 partition，也不引入硬编码或 LLM 依赖。
Output: `_schema_snapshot_payload` 增量透传 `is_partition` + 生成顶层 `partitions`（增量字段，旧消费方 `.get` 容错，不破坏既有契约）；配套 3 个确定性单测。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- 修复点：app/application/semantic/data_asset_service.py:530-544（当前实现，丢弃 is_partition / 无 partitions） -->
```python
def _schema_snapshot_payload(table: AssetTable, fields: list[AssetField]) -> Dict[str, Any]:
    return {
        "table_id": table.id,
        "qualified_name": table.to_ref().qualified_name,
        "columns": [
            {
                "name": field.name,
                "type": field.data_type,
                "nullable": field.nullable,
                "comment": field.comment,
                "ordinal": field.ordinal,
            }
            for field in fields
        ],
    }
```

<!-- 域实体 AssetField.profile（data_asset.py:127）：Dict，分区表 ds 字段 profile 含 {"is_partition": true} -->
<!-- profile 透传链已完整：_fields_from_payload(253) profile=dict(payload.profile) → AssetField.profile → 仓储 profile_json(376 写/396 读)往返 -->

<!-- 下游消费契约（modeling_spec_repair.py:202-217，不要改它）：先读 partitions list，回落列级 is_partition -->
```python
def _partition_field_from_schema(schema_snapshot: Dict[str, Any]) -> str:
    partitions = schema_snapshot.get("partitions")
    if isinstance(partitions, list):
        for item in partitions:
            field = str(item or "").strip()
            if field:
                return field
    columns = schema_snapshot.get("columns")
    if isinstance(columns, list):
        for column in columns:
            if not isinstance(column, dict) or not column.get("is_partition"):
                continue
            field = str(column.get("name") or "").strip()
            if field:
                return field
    return ""
```

<!-- _default_time_dimension(305-325) 偏好列表已含 "ds"；_ensure_partition_time_dimension(155-171) 把 partition.field 补成 type=time/date 的维度 -->
<!-- 发布门禁 _metric_blockers(modeling_validation_matrix.py:37-41)：time_dimension 必须存在且 ∈ cube_dimensions，否则 metric_time_dimension_missing -->
<!-- 评论 canonical 路径（modeling_spec_repair.py:41-48 / _apply_canonical_rule_spec:419-435）：整块替换 cube，绕过分区路径，两路径正交，不要破坏 -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: _schema_snapshot_payload 透传分区标记</name>
  <files>
    app/application/semantic/data_asset_service.py
    tests/unit/application/semantic/test_data_asset_service.py
  </files>
  <behavior>
    - 含分区列（ds 字段 profile={"is_partition": true}）的 payload 经 sync_from_payload → build_table_evidence 后，evidence["schema_snapshot"]["partitions"] == ["ds"]
    - 分区列在 evidence["schema_snapshot"]["columns"] 中对应项 is_partition is True
    - 非分区列（如 school_id，profile 无 is_partition 或为 false）对应项 is_partition is False
    - 既有列字段（name/type/nullable/comment/ordinal）保持不变，既有快照断言不回归
  </behavior>
  <action>
    仅改 `_schema_snapshot_payload`（约 530-544 行）。每个 column 字典新增一个 `is_partition` 键，取值 `bool((field.profile or {}).get("is_partition"))`（profile 为 None 容错）。在返回的快照 payload 顶层新增 `partitions` 键，值为按 fields 顺序、对 `is_partition` 为真的列收集的列名列表（list[str]）。

    实现要点：
    - 不要改函数签名，不要改 columns 既有键（name/type/nullable/comment/ordinal 原样保留），只追加 is_partition。
    - partitions 列表与 columns 中标记一致：列名取 field.name；只收 is_partition 为真者；保持字段遍历顺序。
    - 这是增量字段：旧消费方用 .get 容错（已确认 _partition_field_from_schema 即如此），不破坏既有契约。
    - 显式不改 _fields_from_payload / 仓储映射 / 域实体 / 派生链 / 分类器——profile 透传链已完整正确。

    在 tests/unit/application/semantic/test_data_asset_service.py 新增一个单测，复用现有 db_session fixture + DataAssetService(SqlDataAssetRepository(db_session)) + sync_from_payload + build_table_evidence 模式（参照 test_data_asset_service_syncs_payload_and_builds_evidence）。构造一张表含两列：ds（profile={"is_partition": True}）+ 一个非分区列（profile 无 is_partition）。断言 evidence["schema_snapshot"]["partitions"] == ["ds"]；断言分区列 is_partition is True、非分区列 is False。
  </action>
  <verify>
    <automated>PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/semantic/test_data_asset_service.py</automated>
  </verify>
  <done>新增分区透传单测通过；test_data_asset_service.py 全部既有单测不回归（columns 既有键断言仍绿）。</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: ds 端到端补全 + 评论不回归确定性单测</name>
  <files>
    tests/unit/application/semantic/test_modeling_spec_repair.py
  </files>
  <behavior>
    - ds 链路：raw_spec 含 source.evidence_bundle.schema_snapshot.partitions=["ds"]（且对应列 is_partition），cube 无 partition / 无时间维度，metric 无 time_dimension → repair_modeling_spec(source_mode="agent_led") 后：cube["partition"]["field"]=="ds"；"ds" ∈ cube["dimensions"] 且其 type ∈ {"time","date"}；ontology.metrics[0]["time_dimension"]=="ds" 且 grain、additivity 非空 → 喂 ValidationMatrixBuilder().build(repaired, {}) 后 blockers 不含 code=="metric_time_dimension_missing"
    - 评论不回归：user_goal 含"学生评论"的 raw_spec（cube 指向非评论源以触发 canonical negative_source 替换）→ repair 后 cube 被 canonical 规则整块替换（带评论时间维度，如 comment_published_at/published_at），metric.time_dimension 为评论口径而非 ds，证明分区路径未污染 canonical 路径（两路径正交）
  </behavior>
  <action>
    在 tests/unit/application/semantic/test_modeling_spec_repair.py（若不存在则新建该文件）新增两个确定性单测，import `from app.application.semantic.modeling_spec_repair import repair_modeling_spec` 和 `from app.application.semantic.modeling_validation_matrix import ValidationMatrixBuilder`。先查看该测试文件现有结构与已有用例（若存在），复用其 raw_spec 构造与断言风格；若文件不存在，按本仓库纯函数单测惯例（无 db_session 依赖，直接构造 dict 调用）编写。

    单测 (b) ds 端到端：
    - 构造 raw_spec：spec_version 省略（repair 会补）；source.table 指向一张真实分区表名；source.evidence_bundle.schema_snapshot = {"columns": [{"name":"ds","is_partition":True,...}, {"name":"<度量基列>",...}], "partitions": ["ds"]}；cube 含 name/table、dimensions（不含 ds）、measures（可空，让 _ensure_measure 补）、不含 partition、不含 default_time_dimension；user_goal 用一个**不命中 canonical 评论规则**的中性目标（如"答题统计"），避免触发整块替换。
    - 调 repair_modeling_spec(raw_spec, user_goal="答题统计", source_mode="agent_led")。
    - 断言：repaired["cube"]["partition"]["field"]=="ds"；"ds" in repaired["cube"]["dimensions"]；repaired["cube"]["dimensions"]["ds"]["type"] in {"time","date"}；metric=repaired["ontology"]["metrics"][0]，metric["time_dimension"]=="ds"，metric["grain"] 非空，metric["additivity"] 非空。
    - matrix = ValidationMatrixBuilder().build(repaired, {})；断言 "metric_time_dimension_missing" not in {b.get("code") for b in matrix["blockers"]}。

    单测 (c) 评论不回归：
    - 构造 raw_spec：user_goal 含"学生评论"；cube/source 指向**非评论源**（触发 canonical 规则的 negative_source 整块替换路径，参照 _canonical_rule_for_spec 逻辑：rule 命中 user_goal 且当前源是 negative_source）；可不带或带 ds 分区证据（用来证明即便带 ds，canonical 替换仍优先）。
    - 调 repair_modeling_spec(raw_spec, user_goal="...学生评论...", source_mode="agent_led")。
    - 断言 cube 被 canonical 整块替换：cube 带评论时间维度（断言存在评论口径时间维度，如 "comment_published_at" 或 "published_at" ∈ cube["dimensions"]）；metric["time_dimension"] 为评论口径（!= "ds"，且 ∈ cube["dimensions"]）。
    - 若构造 canonical 触发条件需要参考 source_candidate_scoring 的默认规则集，先用 grep/Read 确认 SourceCandidateScoringConfig.default() 中评论规则的 canonical_source / negative_source / canonical_spec 形状，再据此构造能稳定触发 negative_source 替换的 raw_spec，避免断言脆弱。

    不要改任何生产代码；本任务只写单测验证 Task 1 修复后端到端行为与正交性。
  </action>
  <verify>
    <automated>PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/semantic/test_modeling_spec_repair.py</automated>
  </verify>
  <done>ds 端到端单测断言 cube.partition.field=="ds"、ds ∈ dimensions(type time/date)、metric.time_dimension=="ds"、blockers 无 metric_time_dimension_missing；评论不回归单测断言 cube 被 canonical 整块替换且 time_dimension 为评论口径非 ds。两单测均通过。</done>
</task>

</tasks>

<verification>
1. Task 1 修复后，含 ds 分区的新同步快照携带 partitions=["ds"] 与列级 is_partition（单测 a 证）。
2. 派生链端到端把 ds 补进 cube.dimensions 与 metric.time_dimension，发布门禁不再卡 metric_time_dimension_missing（单测 b 证）。
3. 评论 canonical 路径正交未被破坏（单测 c 证）。
4. 全套定向回归：
   PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/semantic/test_data_asset_service.py tests/unit/application/semantic/test_modeling_spec_repair.py
</verification>

<success_criteria>
- `_schema_snapshot_payload` 增量透传 `is_partition` + 顶层 `partitions`，columns 既有键不变，未触碰 _fields_from_payload / 仓储映射 / 域实体 / 派生链 / 分类器。
- 3 个确定性单测全部通过（分区透传 / ds 端到端门禁打通 / 评论不回归正交）。
- 既有 test_data_asset_service.py 单测零回归。
- 改动严格最小：仅一处生产函数 + 测试，符合 CLAUDE.md「内网单机不翻新、改动最小」。
- notes 已记录存量回填为部署后运维动作（重同步旧表 + 真实发布验证由执行者自行完成），不纳入本计划代码范围。
</success_criteria>

<output>
After completion, create `.planning/quick/260625-ros-schema-metric/260625-ros-SUMMARY.md`
</output>
