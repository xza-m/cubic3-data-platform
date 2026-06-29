# 发布 cube 到 live manifest：v1 spec 模板 + 发布门

把一张物理表建模并发布进 active runtime manifest 的权威参考。**这是改 DataChat 正在消费的共享生产 manifest 的操作——publish 前必须把门结果摊给用户并拿到明确授权。**

## 持久化双轨（关键背景）

- cube 的 YAML 定义在 `app/infrastructure/semantic/cubes/<name>.yml`（YAML 轨）。
- 发布走 **SQL asset registry**（另一轨）。一张只在 YAML 里的 cube，registry 里并不存在——必须经提案管线的 `apply` 步建进 registry，再 `publish`。
- 所以发布新 cube **不能**走"改同义词"那种 `append_revision` 捷径（那是对已在 registry 的 asset 操作）。要走完整 7 步管线。

## v1 spec 结构

`proposal update-spec <id> --spec @spec.json` 接收 `{"spec": <下面这份>}`（CLI 自动包 `spec` 外层，传 spec 本体即可）。顶层必填段：`spec_version` / `source` / `business` / `cube` / `ontology` / `governance`。

- **cube 段**：直接搬 YAML cube 结构 `{name,title,table,source_id,source_database,data_source,status:"draft",partition,dimensions:{<field>:{title,type,sql:"{CUBE}.x",...}},measures:{<name>:{title,type:"sum|count|...",sql,...}}}`。
- **dimensions/measures** 从 `asset fields <table_id>` 的真实列来；度量聚合方式（sum/count/avg）按业务语义定——"总时长/总次数"类用 `sum`，不要 avg。

## 三道发布门（in-memory，与 MaxCompute 无关，必须满足）

1. **policy 门**：`spec.ontology.policies` 必须非空，且每条有 `name`。
2. **binding-matrix 门**：
   - `spec.ontology.object.cube_bindings`：至少一个 `{cube, role:"primary", entity_key:<cube 的某维度名>}`，primary 唯一。
   - `spec.ontology.metrics[].measure_refs`：至少一个 `{ref:"<cube>.<measure>", role:"primary"}`，能解析到 cube 的真实 measure，primary 唯一。
3. **sensitivity 门**：`spec.governance.sensitivity_level` 设 `"internal"` 或 `"public"` 可避开 approval_required；`"restricted"/"confidential"` 会触发 `approval_required`（需额外批准，别用，除非必要）。

`cube.status="draft"` 不阻断发布（只是 `cube_not_active` 提示）。

## 最小可过门 spec 模板（按你的表替换）

```json
{
  "spec_version": "v1",
  "source": {"source_kind":"physical_table","source_id":1,"database":"<DB>","schema":null,"table":"<TABLE>","name":"<TABLE>","title":"<中文名>","description":"<描述>","evidence_bundle":null,"asset_ref":null},
  "business": {"subject":"<业务主题>","use_cases":["..."],"default_roles":["analyst"],"sensitivity_level":"internal"},
  "cube": {
    "name":"<TABLE>","title":"<中文名>","description":"<描述>","table":"<TABLE>","source_id":1,"source_database":"<DB>","source_schema":null,"data_source":"maxcompute","status":"draft","entity_key":"<主维度名>",
    "partition":{"field":"ds","type":"date","format":"yyyyMMdd","max_range_days":90},
    "default_filters":[],
    "dimensions":{"<dim>":{"title":"<中文>","type":"string","sql":"{CUBE}.<dim>","description":"<中文>","source_data_type":"string","primary_key":false,"synonyms":["<口语同义词>"],"tags":[]}},
    "measures":{"<m>":{"title":"<中文>","type":"sum","sql":"{CUBE}.<col>","description":"<中文>","source_data_type":"bigint","certified":false,"non_additive":false,"synonyms":[],"tags":[]}},
    "segments":{},"joins":{}
  },
  "ontology": {
    "object":{"name":"<obj_name>","title":"<中文>","description":"<描述>","aliases":["<中文别名>"],"cube_bindings":[{"cube":"<TABLE>","role":"primary","entity_key":"<主维度名>"}],"status":"draft"},
    "properties":[{"name":"<obj>_<dim>","title":"<中文>","object_name":"<obj_name>","property_type":"string","description":"<中文>","aliases":["<dim>","<同义词>"],"status":"draft"}],
    "metrics":[{"name":"<obj>_<m>","title":"<中文>","object_name":"<obj_name>","semantic_formula":"按 Cube measure <TABLE>.<m> 计算","description":"<描述>","semantic_labels":["<标签>"],"measure_refs":[{"ref":"<TABLE>.<m>","role":"primary"}],"aliases":["<别名>"],"grain":"<粒度>","time_dimension":"ds","additivity":"additive","binding_status":"approved","status":"draft"}],
    "glossary":[{"term":"<术语>","canonical_name":"<obj_name>","entry_type":"object","aliases":[],"description":"<标准称谓>","status":"draft"}],
    "policies":[{"name":"<obj>_<m>_policy","target_type":"metric","target_name":"<obj>_<m>","visibility":"restricted","allowed_roles":["analyst"],"description":"<策略说明>","status":"draft"}],
    "relations":[],"actions":[]
  },
  "governance": {"sensitivity_level":"internal","sensitive_fields":[],"official_agent_consumes_spec":false,"approval_granted":false}
}
```

**最小 ontology** = 1 object（绑主维度）+ 每维度 1 property（aliases 放口语同义词，帮 grounding）+ 至少 1 metric（绑一个 cube measure）+ 1 glossary + 1 policy。维度的 `synonyms` / property 的 `aliases` 放"学校/年级"这类口语词，问数才 ground 得上。

## 执行序列

```bash
C=cubic3-data-platform-backend  # docker ps 确认
# 0. 记回滚锚点
docker exec $C python -m app.interfaces.cli manifest show 2>/dev/null   # 记下 release_id
# 1. 读真实列
docker exec $C python -m app.interfaces.cli asset fields <table_id> 2>/dev/null
# 2. 写 spec.json 到容器（docker cp 或 heredoc），create + 注入 spec
PID=$(docker exec $C python -m app.interfaces.cli proposal create --payload '{"business_subject":"...","source_kind":"physical_table","source_id":1,"database":"<DB>","table":"<TABLE>"}' --yes 2>/dev/null | jq -r .data.id)
docker exec $C python -m app.interfaces.cli proposal update-spec $PID --spec @/tmp/spec.json --yes 2>/dev/null
# 3. 看门（这几步只写草稿暂存，不碰 manifest）
docker exec $C python -m app.interfaces.cli proposal validate $PID --yes 2>/dev/null   # blockers 应为 []
docker exec $C python -m app.interfaces.cli proposal gap $PID 2>/dev/null               # primary_action 应 = approve
# === 把门结果摊给用户，拿到明确授权后再继续 ===
# 4. 发布（消费级写 live manifest）
docker exec $C python -m app.interfaces.cli proposal approve $PID --yes 2>/dev/null
docker exec $C python -m app.interfaces.cli proposal apply $PID --yes 2>/dev/null        # 写 registry
docker exec $C python -m app.interfaces.cli proposal publish $PID --yes 2>/dev/null      # 写 live manifest
# 5. 验证
docker exec $C python -m app.interfaces.cli manifest show 2>/dev/null                    # cube 数 +1
docker exec $C python -m app.interfaces.cli intent answerability "<相关问题>" --runtime-mode official 2>/dev/null  # 应 answerable
# 6. 出问题回滚
docker exec $C python -m app.interfaces.cli release rollback <发布前 release_id> --yes 2>/dev/null
```

## 常见坑
- `proposal draft` 默认打 MaxCompute（dev 挂）→ **不要用 draft，用 update-spec 注入整份 spec**。
- 发布后实际取数仍需 MaxCompute（dev 不通）——但发布的目的是让 router 能 ground 到新维度（覆盖缺口闭合），这不依赖执行。
- validate 的"2 项待确认"（cube_not_active / ontology_not_active）是首次发布正常提示，不是 blocker。
