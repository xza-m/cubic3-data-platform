"""§6.2 metadata visibility 裁决与脱敏单元测试。"""
from __future__ import annotations

from types import SimpleNamespace

from app.application.governance.access import PrincipalContext
from app.application.governance.metadata_visibility import (
    ACTION_DESCRIBE,
    ACTION_DISCOVER,
    SemanticMetadataVisibilityService,
    migrate_policy_metadata_to_discover_policies,
)
from app.domain.governance.entities import DataPolicy


def _human(roles=None, principal_id="feishu:tenant:on_user"):
    return PrincipalContext(principal_id=principal_id, roles=list(roles or []), source="jwt")


def _service_principal(roles=None):
    return PrincipalContext(
        principal_id="svc:tenant:bot:reporter",
        principal_type="service",
        roles=list(roles or []),
        source="api_key",
    )


class _PolicyRepoStub:
    def __init__(self, policies):
        self._policies = policies

    def list_policy_domains(self, status="active"):
        return list(self._policies)


M2_CUBE = {
    "name": "comment_reports",
    "title": "举报明细",
    "table": "dw.dwd_comment_reports",
    "dimensions": {"school_id": {"title": "学校", "sql": "{CUBE}.school_id"}},
    "measures": {"total": {"title": "总数", "sql": "{CUBE}.id"}},
    "joins": {"student": {"sql": "{CUBE}.student_id = {student}.user_id"}},
}

M1_CUBE = {"name": "orders", "title": "订单", "table": "dw.dws_orders_daily"}


class TestAdjudicateDefaults:
    def test_anonymous_denied(self):
        service = SemanticMetadataVisibilityService()
        verdict = service.adjudicate(principal=None, action=ACTION_DISCOVER)
        assert verdict["decision"] == "deny"
        assert verdict["reason_code"] == "principal_invalid"

    def test_human_discover_default_allowed(self):
        service = SemanticMetadataVisibilityService()
        verdict = service.adjudicate(principal=_human(), action=ACTION_DISCOVER, data_level="M2")
        assert verdict["decision"] == "allow"

    def test_human_describe_m2_requires_data_role(self):
        service = SemanticMetadataVisibilityService()
        denied = service.adjudicate(principal=_human(), action=ACTION_DESCRIBE, data_level="M2")
        assert denied["decision"] == "deny"
        assert denied["required_roles"] == ["data_m2_detail_reader"]

        allowed = service.adjudicate(
            principal=_human(roles=["data_m2_detail_reader"]),
            action=ACTION_DESCRIBE,
            data_level="M2",
        )
        assert allowed["decision"] == "allow"

    def test_human_describe_m1_default_allowed(self):
        service = SemanticMetadataVisibilityService()
        verdict = service.adjudicate(principal=_human(), action=ACTION_DESCRIBE, data_level="M1")
        assert verdict["decision"] == "allow"

    def test_service_principal_without_policy_fails_closed(self):
        service = SemanticMetadataVisibilityService()
        verdict = service.adjudicate(principal=_service_principal(), action=ACTION_DISCOVER, data_level="M1")
        assert verdict["decision"] == "deny"
        assert verdict["reason_code"] == "metadata_policy_not_matched"


class TestAdjudicateWithPolicies:
    def test_discover_policy_allows_service_principal(self):
        policy = DataPolicy(
            policy_code="svc_discover",
            name="服务身份可发现",
            subject_roles=["reporter_bot"],
            resource_scope={"cubes": ["comment_reports"]},
            actions=[ACTION_DISCOVER, ACTION_DESCRIBE],
            effect="allow",
        )
        service = SemanticMetadataVisibilityService(policy_repository=_PolicyRepoStub([policy]))
        verdict = service.adjudicate(
            principal=_service_principal(roles=["reporter_bot"]),
            action=ACTION_DISCOVER,
            cube_name="comment_reports",
            data_level="M2",
        )
        assert verdict["decision"] == "allow"
        assert verdict["matched_policy"] == "svc_discover"

    def test_deny_policy_wins_over_default_allow(self):
        policy = DataPolicy(
            policy_code="hide_cube",
            name="隐藏敏感资产",
            subject_roles=[],
            resource_scope={"cubes": ["comment_reports"]},
            actions=[ACTION_DISCOVER],
            effect="deny",
        )
        service = SemanticMetadataVisibilityService(policy_repository=_PolicyRepoStub([policy]))
        verdict = service.adjudicate(
            principal=_human(),
            action=ACTION_DISCOVER,
            cube_name="comment_reports",
            data_level="M2",
        )
        assert verdict["decision"] == "deny"
        assert verdict["reason_code"] == "metadata_policy_denied"


class TestFacades:
    def test_filter_discoverable_cubes_for_service_principal(self):
        service = SemanticMetadataVisibilityService()
        visible = service.filter_discoverable_cubes(
            principal=_service_principal(),
            cubes=[dict(M1_CUBE), dict(M2_CUBE)],
        )
        assert visible == []

        human_visible = service.filter_discoverable_cubes(
            principal=_human(),
            cubes=[dict(M1_CUBE), dict(M2_CUBE)],
        )
        assert [cube["name"] for cube in human_visible] == ["orders", "comment_reports"]

    def test_redact_cube_payload_strips_physical_details(self):
        service = SemanticMetadataVisibilityService()
        redacted = service.redact_cube_payload(principal=_human(), payload=dict(M2_CUBE))
        assert redacted["table"] is None
        assert redacted["joins"] is None
        assert redacted["dimensions"]["school_id"]["sql"] == "<redacted:requires_data_role>"
        assert redacted["metadata_visibility"]["redacted"] is True
        assert redacted["metadata_visibility"]["required_roles"] == ["data_m2_detail_reader"]
        # 摘要字段保留
        assert redacted["name"] == "comment_reports"
        assert redacted["title"] == "举报明细"

    def test_redact_cube_payload_keeps_payload_when_allowed(self):
        service = SemanticMetadataVisibilityService()
        payload = dict(M2_CUBE)
        result = service.redact_cube_payload(
            principal=_human(roles=["data_m2_detail_reader"]),
            payload=payload,
        )
        assert result["table"] == "dw.dwd_comment_reports"
        assert "metadata_visibility" not in result


class TestMigration:
    def test_migrates_active_allowed_roles_to_discover_policies(self):
        metadata_repo = SimpleNamespace(
            list_all=lambda: [
                SimpleNamespace(
                    name="gmv_policy",
                    target_type="metric",
                    target_name="gmv",
                    visibility="restricted",
                    allowed_roles=["finance"],
                    status="active",
                ),
                SimpleNamespace(
                    name="draft_policy",
                    target_type="object",
                    target_name="orders",
                    visibility="restricted",
                    allowed_roles=["analyst"],
                    status="draft",
                ),
                SimpleNamespace(
                    name="open_policy",
                    target_type="object",
                    target_name="orders",
                    visibility="public",
                    allowed_roles=[],
                    status="active",
                ),
            ]
        )
        upserted = []
        governance_repo = SimpleNamespace(upsert_data_policy=lambda data: upserted.append(data))

        summary = migrate_policy_metadata_to_discover_policies(
            policy_metadata_repository=metadata_repo,
            governance_repository=governance_repo,
        )

        assert summary["migrated"] == ["gmv_policy"]
        assert sorted(summary["skipped"]) == ["draft_policy", "open_policy"]
        assert len(upserted) == 1
        policy = upserted[0]
        assert policy["policy_code"] == "semantic_discover_gmv_policy"
        assert policy["subject_roles"] == ["finance"]
        assert policy["resource_scope"] == {"metrics": ["gmv"]}
        assert policy["actions"] == [ACTION_DISCOVER, ACTION_DESCRIBE]
