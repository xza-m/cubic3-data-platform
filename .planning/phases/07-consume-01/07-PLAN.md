---
phase: 07-consume-01
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - tests/unit/application/semantic/test_semantic_release_accumulation.py
autonomous: true
requirements: [CONSUME-01]
must_haves:
  truths:
    - "改前：连续发布 cube A 后再发布 cube B，active manifest 的 assets 只含 B（坐实不累积）"
    - "改前：发布 comment ontology 资产后再发布答题 cube，active manifest 不含 comment 资产（坐实整盘替换）"
    - "RED 测试用真实 SqlAssetRegistryRepository + db_session 装配，可被 pytest 收集并按现状失败/通过证明缺陷"
  artifacts:
    - path: "tests/unit/application/semantic/test_semantic_release_accumulation.py"
      provides: "发布累积的 RED 测试（改前坐实缺陷，改后转 GREEN）"
      min_lines: 60
      contains: "asset_manifest_json"
  key_links:
    - from: "tests/unit/application/semantic/test_semantic_release_accumulation.py"
      to: "app.application.semantic.semantic_release_service.SemanticReleaseService.publish"
      via: "直接调用 publish 后读 repo.get_active_snapshot(namespace).asset_manifest_json"
      pattern: "get_active_snapshot"
---

<objective>
为「发布累积」缺陷写 RED 测试（TDD 第一步，D4 硬要求）：在改 `publish` 之前先坐实现状——每次发布整盘替换 active manifest，活菜单永远只剩最后发布的那 1 个 cube。

Purpose: 把 07-CONTEXT.md 根因（`publish` 只用本批 `revisions` 构建 `manifest_assets`，不带 namespace 既有 active 资产）变成可执行的失败断言，作为 Plan 02 实现的验收基线。
Output: `tests/unit/application/semantic/test_semantic_release_accumulation.py`，含两个累积场景测试 + 一个 comment 资产不在 manifest 的场景测试。本 plan 完成时这些断言应以「期望累积、实际只有 1 条」的形态描述（即面向改后的 GREEN 行为编写，按现状运行时失败）。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-consume-01/07-CONTEXT.md

# 事实源：本期改点与下游契约
@app/application/semantic/semantic_release_service.py
@tests/unit/application/semantic/test_semantic_release_service.py

<interfaces>
<!-- 从代码库提取的事实源契约，executor 直接用，无需再探索 -->

测试装配模式（复用自 tests/unit/application/semantic/test_semantic_release_service.py，已验证可跑）：
```python
from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.domain.semantic.asset_registry import SemanticAsset
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository

repo = SqlAssetRegistryRepository(db_session)              # db_session 是现有 pytest fixture
release_service = SemanticReleaseService(repo)
asset = repo.create_or_update_asset(
    SemanticAsset(id="asset_a", namespace=ns, asset_type="cube", asset_key="cube_a")
)
revision = repo.append_revision(asset.id, {"cube": {"name": "cube_a"}})   # 同 spec 复用 revision；改 spec 或加 force_new_revision=True 才生成新 revision
release = release_service.publish(
    namespace=ns, revision_ids=[revision.id], actor="alice",
    gate_result={"decision": "allow"}, idempotency_key="pub_1",
)
active = repo.get_active_snapshot(ns)                        # -> RuntimeSnapshot | None
assets = active.asset_manifest_json["assets"]               # list[dict]，每条含 asset_type/asset_key/spec/spec_checksum/status
```

repository 真实签名（app/infrastructure/semantic/sql_asset_registry_repository.py）：
```python
def create_or_update_asset(self, asset: SemanticAsset, *, allowed_update_fields=None) -> SemanticAsset
def append_revision(self, asset_id, spec, *, proposal_id=None, actor=None, force_new_revision=False) -> SemanticAssetRevision
def get_active_snapshot(self, namespace="default") -> Optional[RuntimeSnapshot]
def get_active_release_id(self, namespace) -> Optional[str]
def list_release_assets(self, release_id) -> list[SemanticReleaseAsset]   # asset 含 asset_id/revision_id/asset_type/asset_key
def get_revision(self, revision_id) -> Optional[SemanticAssetRevision]    # 含 spec_json / spec_checksum
```

manifest asset 形状（每条 dict 的键，见 semantic_release_service.py:153-162）：
`asset_id / asset_type / asset_key / revision_id / spec_checksum / spec / status`（status 恒为 "published"）。

注意 namespace 隔离：每个测试用唯一 namespace（如 `"qa_accum_1"`），避免与既有测试 `qa_live_1` 串味；idempotency_key 每次发布必须不同。
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 写发布累积 RED 测试（坐实不累积 + comment 不在 manifest）</name>
  <files>tests/unit/application/semantic/test_semantic_release_accumulation.py</files>
  <read_first>
    - tests/unit/application/semantic/test_semantic_release_service.py（复用装配：repo/asset/revision/publish/get_active_snapshot 的精确用法，尤其 :199-232 supersede 测试与 :279-335 compatibility 测试）
    - app/application/semantic/semantic_release_service.py:138-163（publish 构建 manifest_assets 的改前实现——只遍历本批 revisions）
    - app/application/semantic/semantic_release_service.py:153-162（manifest asset dict 的确切键）
  </read_first>
  <behavior>
    - Test 1 `test_publish_accumulates_assets_across_namespace`：
      连续发布 cube A、再发布 cube B（不同 asset / asset_key），断言改后 active manifest 的 assets 同时含 cube_a 与 cube_b。
      改前运行时：assets 只含 cube_b（len==1）→ 测试失败（坐实不累积）。
    - Test 2 `test_publish_keeps_comment_ontology_in_active_manifest`：
      先发布 comment ontology 资产（asset_type="ontology", asset_key="student_comment"，spec 用 `{"ontology": {"object": {"name": "student_comment", "status": "draft"}}}`），
      再发布答题 cube（asset_type="cube", asset_key="dws_study_student_answer_kb_stat_di"），
      断言改后 active manifest 同时含 comment ontology 与答题 cube。
      改前运行时：comment ontology 不在 active manifest（被整盘替换）→ 测试失败。
    - Test 3 `test_publish_dedups_same_asset_key_newest_wins`：
      对同一 asset_key 发布 v1，再发布 v2（同 asset 用 force_new_revision=True 生成新 revision），
      断言改后 active manifest 中该 asset_key 只出现 1 条且 spec_checksum 等于 v2 的 checksum（新覆盖旧、不重复）。
      改前运行时：本就只含 v2（len==1）——此测试改前即通过，作为「去重不引入重复」的护栏（GREEN 后仍需通过）。
  </behavior>
  <action>
    新建 `tests/unit/application/semantic/test_semantic_release_accumulation.py`，复用 test_semantic_release_service.py 的装配范式（`SqlAssetRegistryRepository(db_session)` + `SemanticReleaseService(repo)`）。

    每个测试用独立 namespace 字符串（`"qa_accum_1"` / `"qa_accum_2"` / `"qa_accum_3"`）隔离；每次 publish 的 idempotency_key 唯一（如 `"pub_a"`/`"pub_b"`）。

    Test 1 骨架：
    ```python
    def test_publish_accumulates_assets_across_namespace(db_session):
        ns = "qa_accum_1"
        repo = SqlAssetRegistryRepository(db_session)
        svc = SemanticReleaseService(repo)
        asset_a = repo.create_or_update_asset(SemanticAsset(id="asset_a", namespace=ns, asset_type="cube", asset_key="cube_a"))
        rev_a = repo.append_revision(asset_a.id, {"cube": {"name": "cube_a"}})
        svc.publish(namespace=ns, revision_ids=[rev_a.id], actor="alice", gate_result={"decision": "allow"}, idempotency_key="pub_a")
        asset_b = repo.create_or_update_asset(SemanticAsset(id="asset_b", namespace=ns, asset_type="cube", asset_key="cube_b"))
        rev_b = repo.append_revision(asset_b.id, {"cube": {"name": "cube_b"}})
        svc.publish(namespace=ns, revision_ids=[rev_b.id], actor="alice", gate_result={"decision": "allow"}, idempotency_key="pub_b")
        active = repo.get_active_snapshot(ns)
        keys = {a["asset_key"] for a in active.asset_manifest_json["assets"]}
        assert keys == {"cube_a", "cube_b"}   # 改前实际 == {"cube_b"} → 失败
    ```

    Test 2 关注 asset_type 异构（ontology + cube），断言 `{(a["asset_type"], a["asset_key"]) for a in assets}` 含两类；spec 内容沿用 publish 写入的形状（`_activated_spec` 会把 status 落 active，断言不要硬绑 draft）。

    Test 3 用 `force_new_revision=True` 生成 v2，断言 `[a for a in assets if a["asset_key"]=="cube_a"]` 长度 == 1 且其 `spec_checksum == rev_v2.spec_checksum`。

    禁止改任何生产代码；本任务只写测试文件。允许此时 Test 1/Test 2 失败（RED）。
  </action>
  <verify>
    <automated>PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/semantic/test_semantic_release_accumulation.py</automated>
  </verify>
  <acceptance_criteria>
    - 文件存在：`test -f tests/unit/application/semantic/test_semantic_release_accumulation.py` 退出码 0。
    - 含三个测试函数：`grep -c "^def test_" tests/unit/application/semantic/test_semantic_release_accumulation.py` 输出 `3`。
    - 引用累积事实源符号：`grep -q "get_active_snapshot" tests/unit/application/semantic/test_semantic_release_accumulation.py` 且 `grep -q "asset_manifest_json" tests/unit/application/semantic/test_semantic_release_accumulation.py` 均退出码 0。
    - RED 证明：上述 pytest 命令的输出包含 `failed`（Test 1 与 Test 2 至少一个 FAILED），且 Test 3 `test_publish_dedups_same_asset_key_newest_wins` 为 PASSED（护栏）。executor 必须在 SUMMARY 中粘贴 pytest 的 `passed/failed` 计数行（如 `2 failed, 1 passed`）证明 RED。
    - 不触碰生产代码：`git diff --name-only app/ | wc -l` 输出 `0`。
  </acceptance_criteria>
  <done>
    新测试文件存在且可被 pytest 收集；Test 1 与 Test 2 按现状 FAILED（坐实「不累积 / comment 被替换」），Test 3 PASSED（去重护栏）。pytest 计数行已记入 SUMMARY。生产代码零改动。
  </done>
</task>

</tasks>

<verification>
- `PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/semantic/test_semantic_release_accumulation.py` 可运行（不报收集错误）。
- 输出含 `failed`（RED 成立），且去重护栏 Test 3 PASSED。
- `git diff --name-only app/` 为空（未碰生产代码）。
</verification>

<success_criteria>
- 三个累积场景测试存在并能被 pytest 收集。
- Test 1 + Test 2 在改前 FAILED，证明发布累积缺陷确实存在（D4 RED）。
- Test 3 去重护栏 PASSED。
- Plan 02 实现后这三个测试全部 PASSED（GREEN 验收钩子）。
</success_criteria>

<output>
After completion, create `.planning/phases/07-consume-01/07-01-SUMMARY.md`（务必粘贴 RED 阶段 pytest 的 passed/failed 计数行）。
</output>
