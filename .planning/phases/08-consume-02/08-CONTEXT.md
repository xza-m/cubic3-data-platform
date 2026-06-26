# Phase 8: 语义消费收口·问数切 official - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** workflow 对抗审查(sound)+ 本会话 DI 实测,直接锁为决策。

<domain>
## Phase Boundary

让 DataChat 全局问数从读 YAML(preview)切到读 active manifest(official),打通"自助建模发布的 cube → 问数能消费出数"。配套 discovery 同源。**依赖 Phase 7 已完成**(active manifest 累积,发布累积代码已落地、443 语义单测 + 27 release 集成全绿)。

**已 DI 实测坐实机制成立(关键)**:`SemanticRouterPreviewService.route(question, viewer_roles, runtime_mode)`:
- `route("学生答题统计 总数", runtime_mode="official")` → **route_type=`cube`,命中 `student_total_count`**(答题 cube 在 active manifest);
- `route("统计学生评论数", runtime_mode="official")` → blocked「未命中已发布业务语义」(comment 只在 YAML、不在 manifest);
- preview 模式下答题 cube 始终未命中(不在 YAML)。
即:official + 对得上 metric 口径的问法 = 答题 cube 可问出数。机制无需新建,只差让 send_message_handler 传 official。
</domain>

<decisions>
## Implementation Decisions

### D1 DataChat 切 official(核心,一行)
- `app/application/conversation/handlers/send_message_handler.py` 的 `_handle_via_semantic_router`(约 :93):`semantic_router_service.execute_plan(question=..., viewer_roles=[...])` → 增加 `runtime_mode="official"`。preview_service 的 official 分支(`_load_runtime_manifest` → `RuntimeSemanticCatalog.from_manifest` → `_runtime_entities` 走 manifest)已实现且有测试(`tests/unit/application/semantic_router/test_preview_service.py` 的 official 用例)。
- 兜底语义:official 下无 active 快照 → `semantic_runtime_not_ready` → `_build_blocked_route_message` 应回"语义运行时尚未就绪";"未命中已发布业务语义" → 仍以"未命中"开头 → 返 None → legacy 诚实兜底。确认这两条路径语义正确(必要时仅加注释/微调,不扩行为)。

### D2 discovery 同源
- `GET /semantic/cubes`(`app/interfaces/api/v1/semantic/cubes.py`)的 cube 列表从 active manifest 出(复用 runtime_snapshot_service/RuntimeSemanticCatalog 的 cube 列表),使"能问什么"与 grounding 命中范围一致。**若该改动牵连面过大,可在 plan 里拆为次要任务或收窄**,主闭环以 D1 为准。

### D3 YAML-only cube 丢失 = 预期方向(不阻塞、要文档化)
- 切 official 后,只在 YAML、未发布到 registry 的 cube(comment、answer_records 等)不再被 DataChat 命中。**这是架构既定方向**(`semantic-binding-and-rls.md` §1.4 / README「YAML 不做生产双写、仅建模态」)——只有已发布(进 active manifest)的 cube 才可被消费,符合单一事实源。
- 实测旁证:comment 在 preview 下也已被角色门禁 blocked(viewer_roles=[]),且无任何测试保护其 DataChat 可问性;registry 实测只有 2 个已发布 cube(答题 + dim_app),comment 非 published 资产。
- 让 YAML-only cube 重新可消费的正道 = 走建模发布把它发进 registry/manifest(本期不做)。

### D4 运维桥接 + 真实闭环验证(本期必须实测)
- 重启 docker 加载 Phase 7+8 代码。
- 跑 `rebuild_active_baseline(namespace="default", asset_keys=[("cube","dws_study_student_answer_kb_stat_di"),("cube","dim_app_dify_app_info_df")], actor="internal:local:admin", idempotency_key=...)` → active manifest 变多 cube(坐实 Phase 7 累积在线生效)。
- **真实闭环**:经真实 DataChat(或 SendMessageHandler/official)问"学生答题统计 总数",断言走 semantic 主链、route_type=cube、有 query_result/出数(真打 MaxCompute 或经 runtime tool 已证 3989万)。这是整条命脉打通的判定点。

</decisions>

<canonical_refs>
## Canonical References

- `app/application/conversation/handlers/send_message_handler.py` — `_handle_via_semantic_router`(:89-96 调 execute_plan)、`_build_blocked_route_message`(:168-184)、legacy 兜底(:299)。
- `app/application/semantic_router/preview_service.py` — `route`(:71-)、`_normalize_runtime_mode`(:650-)、`_load_runtime_manifest`/`_runtime_catalog`/`_runtime_entities`(official vs YAML 分支)、`_blocked_runtime_route`(:763/801 semantic_runtime_not_ready)。
- `tests/unit/application/semantic_router/test_preview_service.py` — official 用例(`test_official_runtime_routes_and_compiles_from_snapshot_manifest_without_yaml` 等)+ `tests/unit/application/conversation/test_send_message_handler.py`(:256 execute_plan 调用)。
- `app/interfaces/api/v1/semantic/cubes.py` — `GET /semantic/cubes`(D2 discovery)。
- `app/application/semantic/semantic_release_service.py` — `rebuild_active_baseline`(:341,运维桥接用)。
- 架构:`docs/architecture/semantic-binding-and-rls.md` §1.4、`docs/architecture/README.md`。

</canonical_refs>

<specifics>
## Specific Ideas

- 后端测试命令:`PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider <path>`。
- 闭环问法用对得上口径的:**"学生答题统计 总数"**(已实测 official 下命中 `student_total_count`)。"答题记录总数"对不上 aliases(召回准度,另期)。

</specifics>

<deferred>
## Deferred（本期不做,留 Phase 9 / 另期）

- 不改 grounding 匹配算法 / 不激活 LLM 意图抽取(召回准度命门,独立专题 [[qa-scope-mismatch-global-ask]])。
- 不把 YAML-only cube(comment/answer_records)回写或重新发布(让它们可消费走正常建模发布,本期不做)。
- 不动编译器分区保护。
- 文档对齐 + 全平台 verify → Phase 9。

</deferred>

---

*Phase: 08-official-consume-02*
*Context gathered: 2026-06-26（DI 实测 official 已能 ground 答题 cube,机制成立）*
