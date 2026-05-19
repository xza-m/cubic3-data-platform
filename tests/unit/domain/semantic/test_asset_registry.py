from __future__ import annotations

from app.domain.semantic.asset_registry import (
    SemanticAsset,
    SemanticAssetRevision,
    canonical_spec_checksum,
)


def test_canonical_spec_checksum_is_order_insensitive_and_unicode_safe():
    left = {"name": "学生评论", "metrics": [{"name": "comment_count", "expr": "count(*)"}]}
    right = {"metrics": [{"expr": "count(*)", "name": "comment_count"}], "name": "学生评论"}

    assert canonical_spec_checksum(left) == canonical_spec_checksum(right)
    assert len(canonical_spec_checksum(left)) == 64


def test_semantic_asset_uses_stable_registry_key():
    asset = SemanticAsset(
        id="asset_student_comment",
        namespace="qa_live_1",
        asset_type="cube",
        asset_key="student_comment",
        title="学生评论",
        owner_principal_id="alice",
        source_kind="copilot",
    )

    assert asset.registry_key == ("qa_live_1", "cube", "student_comment")


def test_semantic_revision_derives_checksum_from_spec_when_missing():
    revision = SemanticAssetRevision(
        id="rev_1",
        asset_id="asset_student_comment",
        revision_no=1,
        spec_json={"cube": {"name": "student_comment"}},
        created_by="alice",
    )

    assert revision.spec_checksum == canonical_spec_checksum(revision.spec_json)
