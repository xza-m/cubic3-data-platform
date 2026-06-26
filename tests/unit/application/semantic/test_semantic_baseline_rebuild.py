"""基线重建 service 方法测试（Phase 07-consume-01 / Plan 02 Task 3，D3）。

`rebuild_active_baseline` 把「当前应在线的 cube 集合」（至少答题 cube + comment cube）
合并发一个全量 active release 作为起点，弥补历史「每次发布整盘替换」导致的
「应在线集合信息丢失、只剩最后 active」缺陷。

要点：
- 可重复执行：每次调用产出新 published release（沿用 publish_with_snapshot 的
  supersede 旧 active 行为），不写迁移、不写 YAML。
- 缺失 asset/revision 时 fail-loud（ValueError: baseline_asset_not_found）。
- 复用 publish 的合并构建范式，按 (asset_type, asset_key) 去重合并。

装配范式复用自 tests/unit/application/semantic/test_semantic_release_service.py
（SqlAssetRegistryRepository(db_session) + SemanticReleaseService(repo)）。
"""

from __future__ import annotations

import pytest

from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.domain.semantic.asset_registry import SemanticAsset
from app.infrastructure.semantic.sql_asset_registry_repository import SqlAssetRegistryRepository


def _allow_binding_gate(specs, *, active_catalog=None):
    """放行的 binding gate stub，与累积逻辑正交（断链校验另有专项覆盖）。"""
    return {"ok": True, "skipped": True, "checked": {"objects": 0, "metrics": 0}}


def _seed_published_cube(repo, svc, *, namespace, asset_id, asset_key, idempotency_key):
    asset = repo.create_or_update_asset(
        SemanticAsset(id=asset_id, namespace=namespace, asset_type="cube", asset_key=asset_key)
    )
    revision = repo.append_revision(asset.id, {"cube": {"name": asset_key}})
    svc.publish(
        namespace=namespace,
        revision_ids=[revision.id],
        actor="alice",
        gate_result={"decision": "allow"},
        idempotency_key=idempotency_key,
    )
    return asset, revision


def test_rebuild_active_baseline_merges_answer_and_comment(db_session):
    """把答题 cube + comment cube 合并发一个全量 active release。"""
    ns = "qa_baseline_1"
    repo = SqlAssetRegistryRepository(db_session)
    svc = SemanticReleaseService(repo, binding_matrix_checker=_allow_binding_gate)

    _seed_published_cube(
        repo,
        svc,
        namespace=ns,
        asset_id="asset_answer",
        asset_key="dws_study_student_answer_kb_stat_di",
        idempotency_key="seed_answer",
    )
    _seed_published_cube(
        repo,
        svc,
        namespace=ns,
        asset_id="asset_comment",
        asset_key="student_comment",
        idempotency_key="seed_comment",
    )

    baseline = svc.rebuild_active_baseline(
        namespace=ns,
        asset_keys=[
            ("cube", "dws_study_student_answer_kb_stat_di"),
            ("cube", "student_comment"),
        ],
        actor="ops",
        idempotency_key="baseline_1",
    )

    assert baseline.status == "published"
    assert repo.get_active_release_id(ns) == baseline.id

    active = repo.get_active_snapshot(ns)
    assert active is not None
    assets = active.asset_manifest_json["assets"]
    keys = {a["asset_key"] for a in assets}
    assert keys == {"dws_study_student_answer_kb_stat_di", "student_comment"}
    assert all(a["status"] == "published" for a in assets)


def test_rebuild_active_baseline_is_repeatable(db_session):
    """连续调两次（不同 idempotency_key），第二次仍产出含两 asset 的 active release。"""
    ns = "qa_baseline_2"
    repo = SqlAssetRegistryRepository(db_session)
    svc = SemanticReleaseService(repo, binding_matrix_checker=_allow_binding_gate)

    _seed_published_cube(
        repo,
        svc,
        namespace=ns,
        asset_id="asset_answer",
        asset_key="dws_study_student_answer_kb_stat_di",
        idempotency_key="seed_answer",
    )
    _seed_published_cube(
        repo,
        svc,
        namespace=ns,
        asset_id="asset_comment",
        asset_key="student_comment",
        idempotency_key="seed_comment",
    )

    asset_keys = [
        ("cube", "dws_study_student_answer_kb_stat_di"),
        ("cube", "student_comment"),
    ]
    first = svc.rebuild_active_baseline(
        namespace=ns, asset_keys=asset_keys, actor="ops", idempotency_key="baseline_1"
    )
    second = svc.rebuild_active_baseline(
        namespace=ns, asset_keys=asset_keys, actor="ops", idempotency_key="baseline_2"
    )

    assert second.id != first.id
    assert repo.get_active_release_id(ns) == second.id
    assert repo.get_release(first.id).status == "superseded"

    active = repo.get_active_snapshot(ns)
    keys = {a["asset_key"] for a in active.asset_manifest_json["assets"]}
    assert keys == {"dws_study_student_answer_kb_stat_di", "student_comment"}


def test_rebuild_active_baseline_missing_asset_raises(db_session):
    """传一个不存在的 asset_key → fail-loud（baseline_asset_not_found）。"""
    ns = "qa_baseline_3"
    repo = SqlAssetRegistryRepository(db_session)
    svc = SemanticReleaseService(repo, binding_matrix_checker=_allow_binding_gate)

    _seed_published_cube(
        repo,
        svc,
        namespace=ns,
        asset_id="asset_answer",
        asset_key="dws_study_student_answer_kb_stat_di",
        idempotency_key="seed_answer",
    )

    with pytest.raises(ValueError, match="baseline_asset_not_found"):
        svc.rebuild_active_baseline(
            namespace=ns,
            asset_keys=[
                ("cube", "dws_study_student_answer_kb_stat_di"),
                ("cube", "does_not_exist"),
            ],
            actor="ops",
            idempotency_key="baseline_missing",
        )
