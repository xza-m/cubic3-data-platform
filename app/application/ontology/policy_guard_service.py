"""语义权限元数据校验与执行挂点。"""
from __future__ import annotations

from typing import Any, Dict, Iterable

from app.domain.ontology.ports.policy_repository import IPolicyMetadataRepository


class PolicyGuardService:
    def __init__(self, *, policy_repository: IPolicyMetadataRepository):
        self._policy_repository = policy_repository

    def evaluate(
        self,
        *,
        target_type: str,
        target_name: str,
        viewer_roles: Iterable[str] | None = None,
    ) -> Dict[str, Any]:
        normalized_target_type = (target_type or "").strip()
        normalized_target_name = (target_name or "").strip()
        roles = {str(role).strip() for role in (viewer_roles or []) if str(role).strip()}

        matched_policy = next(
            (
                policy
                for policy in self._policy_repository.list_all()
                if policy.target_type == normalized_target_type and policy.target_name == normalized_target_name
            ),
            None,
        )
        if matched_policy is None:
            return {
                "status": "allow",
                "visibility": "public",
                "matched_policy": None,
                "required_roles": [],
            }

        required_roles = [role for role in matched_policy.allowed_roles if role]
        if matched_policy.visibility == "public":
            return {
                "status": "allow",
                "visibility": matched_policy.visibility,
                "matched_policy": matched_policy.model_dump(mode="json"),
                "required_roles": required_roles,
            }

        if required_roles and roles.intersection(required_roles):
            return {
                "status": "allow",
                "visibility": matched_policy.visibility,
                "matched_policy": matched_policy.model_dump(mode="json"),
                "required_roles": required_roles,
            }

        if matched_policy.visibility == "restricted":
            reason = "当前目标受限，需要匹配授权角色后才能访问"
        else:
            reason = "当前目标为私有，仅显式授权角色可访问"

        return {
            "status": "blocked",
            "visibility": matched_policy.visibility,
            "matched_policy": matched_policy.model_dump(mode="json"),
            "required_roles": required_roles,
            "reason": reason,
        }
