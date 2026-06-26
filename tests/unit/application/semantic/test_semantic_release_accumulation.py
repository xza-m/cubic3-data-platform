"""发布累积缺陷的 RED 测试（Phase 07-consume-01 / Plan 01，D4 硬要求）。

坐实现状缺陷：`SemanticReleaseService.publish` 构建 manifest_assets 时只遍历本批
revisions（semantic_release_service.py:140-163），不带 namespace 既有 active 资产，
导致每次发布整盘替换 active manifest——活菜单永远只剩最后发布的那 1 个 cube。

本文件面向「改后的 GREEN 行为」编写断言（期望累积、按 asset_key 去重）：
- Test 1：连续发布 cube A、cube B 后，active manifest 应同时含 cube_a 与 cube_b。
  改前运行时 active manifest 只含 cube_b → FAILED（坐实不累积）。
- Test 2：先发布 comment ontology、再发布答题 cube 后，active manifest 应同时含两者。
  改前运行时 comment ontology 被整盘替换、不在 active manifest → FAILED（坐实整盘替换）。
- Test 3：同一 asset_key 发布 v1、v2 后，active manifest 中该 asset_key 只出现 1 条
  且 spec_checksum 为 v2——去重护栏。改前本就只含 v2（len==1）→ PASSED。

装配范式复用自 tests/unit/application/semantic/test_semantic_release_service.py
（SqlAssetRegistryRepository(db_session) + SemanticReleaseService(repo)），已验证可跑。
每个测试用独立 namespace 隔离，避免与既有 qa_live_1 串味；idempotency_key 每次唯一。

关于 binding gate 的正交隔离：`SemanticReleaseService` 默认装配真实
`check_binding_matrix`（semantic_release_service.py:34-37），它在 publish 第一步
（:117，早于 manifest 构建）对 ontology object 强制 `cube_bindings` 唯一 primary 绑定，
否则抛 `object_binding_missing`。本期主改点是 publish 的 **manifest 累积** 逻辑，与
binding gate 完全正交（gate 已由 test_publish_gate_service.py 专项覆盖）。若不关闭 gate，
Test 2（comment ontology）会在 publish 第一步因 gate 报错而炸，FAILED 原因将变成
「gate 拦截」而非计划要坐实的「active manifest 被整盘替换」——RED 会指向错误的缺陷。
故每个测试显式传入放行的 `binding_matrix_checker`，只在测试侧关闭 gate，不碰任何生产代码。
"""

from __future__ import annotations

from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.domain.semantic.asset_registry import SemanticAsset
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository


def _allow_binding_gate(specs, *, active_catalog=None):
    """放行的 binding gate stub，签名匹配 check_binding_matrix(specs, *, active_catalog)。

    本期只验「manifest 累积」，与发布期断链校验正交；断链校验本身另有专项测试覆盖。
    """
    return {"ok": True, "skipped": True, "checked": {"objects": 0, "metrics": 0}}


def test_publish_accumulates_assets_across_namespace(db_session):
    """连续发布两个不同 cube 后，active manifest 应累积二者（改前只含最后一个 → FAILED）。"""
    ns = "qa_accum_1"
    repo = SqlAssetRegistryRepository(db_session)
    svc = SemanticReleaseService(repo, binding_matrix_checker=_allow_binding_gate)

    asset_a = repo.create_or_update_asset(
        SemanticAsset(id="asset_a", namespace=ns, asset_type="cube", asset_key="cube_a")
    )
    rev_a = repo.append_revision(asset_a.id, {"cube": {"name": "cube_a"}})
    svc.publish(
        namespace=ns,
        revision_ids=[rev_a.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_a",
    )

    asset_b = repo.create_or_update_asset(
        SemanticAsset(id="asset_b", namespace=ns, asset_type="cube", asset_key="cube_b")
    )
    rev_b = repo.append_revision(asset_b.id, {"cube": {"name": "cube_b"}})
    svc.publish(
        namespace=ns,
        revision_ids=[rev_b.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_b",
    )

    active = repo.get_active_snapshot(ns)
    assert active is not None
    keys = {a["asset_key"] for a in active.asset_manifest_json["assets"]}
    # 改前实际 == {"cube_b"}（整盘替换）→ 该断言 FAILED，坐实不累积。
    assert keys == {"cube_a", "cube_b"}


def test_publish_keeps_comment_ontology_in_active_manifest(db_session):
    """先发布 comment ontology、再发布答题 cube 后，active manifest 应同含两者。

    改前 comment ontology 被答题 cube 的发布整盘替换、不在 active manifest → FAILED。
    """
    ns = "qa_accum_2"
    repo = SqlAssetRegistryRepository(db_session)
    svc = SemanticReleaseService(repo, binding_matrix_checker=_allow_binding_gate)

    # 先发布 comment ontology 资产（异构 asset_type）
    ontology_asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_comment_ontology",
            namespace=ns,
            asset_type="ontology",
            asset_key="student_comment",
        )
    )
    ontology_rev = repo.append_revision(
        ontology_asset.id,
        {"ontology": {"object": {"name": "student_comment", "status": "draft"}}},
    )
    svc.publish(
        namespace=ns,
        revision_ids=[ontology_rev.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_ontology",
    )

    # 再发布答题 cube
    cube_asset = repo.create_or_update_asset(
        SemanticAsset(
            id="asset_answer_cube",
            namespace=ns,
            asset_type="cube",
            asset_key="dws_study_student_answer_kb_stat_di",
        )
    )
    cube_rev = repo.append_revision(
        cube_asset.id,
        {"cube": {"name": "dws_study_student_answer_kb_stat_di"}},
    )
    svc.publish(
        namespace=ns,
        revision_ids=[cube_rev.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_answer_cube",
    )

    active = repo.get_active_snapshot(ns)
    assert active is not None
    typed_keys = {
        (a["asset_type"], a["asset_key"]) for a in active.asset_manifest_json["assets"]
    }
    # 不硬绑 draft：_activated_spec 会把 status 落 active，只断言两类资产共存。
    # 改前实际只含答题 cube、comment ontology 被替换 → 该断言 FAILED。
    assert ("ontology", "student_comment") in typed_keys
    assert ("cube", "dws_study_student_answer_kb_stat_di") in typed_keys


def test_publish_dedups_same_asset_key_newest_wins(db_session):
    """同一 asset_key 连发 v1、v2 后，active manifest 仅留 v2 一条（去重护栏，改前即 PASSED）。"""
    ns = "qa_accum_3"
    repo = SqlAssetRegistryRepository(db_session)
    svc = SemanticReleaseService(repo, binding_matrix_checker=_allow_binding_gate)

    asset = repo.create_or_update_asset(
        SemanticAsset(id="asset_dedup", namespace=ns, asset_type="cube", asset_key="cube_a")
    )
    rev_v1 = repo.append_revision(asset.id, {"cube": {"name": "cube_a", "v": 1}})
    svc.publish(
        namespace=ns,
        revision_ids=[rev_v1.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_v1",
    )

    rev_v2 = repo.append_revision(
        asset.id, {"cube": {"name": "cube_a", "v": 2}}, force_new_revision=True
    )
    svc.publish(
        namespace=ns,
        revision_ids=[rev_v2.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key="pub_v2",
    )

    active = repo.get_active_snapshot(ns)
    assert active is not None
    cube_a_assets = [
        a for a in active.asset_manifest_json["assets"] if a["asset_key"] == "cube_a"
    ]
    # 新覆盖旧、不重复：只出现 1 条且 checksum 为 v2。
    assert len(cube_a_assets) == 1
    assert cube_a_assets[0]["spec_checksum"] == rev_v2.spec_checksum
