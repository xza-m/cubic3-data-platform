"""语义资产 release 与 runtime snapshot 服务。"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Callable

from app.domain.ontology.entities import GovernanceAuditTrace
from app.domain.semantic.asset_registry import (
    RUNTIME_MANIFEST_SCHEMA_VERSION,
    RuntimeSnapshot,
    SemanticRelease,
    SemanticReleaseAsset,
)


class SemanticReleaseService:
    """发布资产 revision 并激活 Runtime snapshot。"""

    def __init__(self, release_repository, *, audit_repository=None):
        self._release_repository = release_repository
        self._audit_repository = audit_repository

    def publish(
        self,
        *,
        namespace: str,
        revision_ids: list[str],
        actor: str | None,
        gate_result: dict[str, Any],
        idempotency_key: str | None = None,
        audit_writer: Callable[[dict[str, Any]], None] | None = None,
    ) -> SemanticRelease:
        revisions = [self._release_repository.get_revision(revision_id) for revision_id in revision_ids]
        if any(revision is None for revision in revisions):
            missing = [revision_id for revision_id, revision in zip(revision_ids, revisions) if revision is None]
            raise ValueError(f"semantic revision not found: {missing}")

        release = SemanticRelease(
            id=f"rel_{uuid.uuid4().hex}",
            release_no=0,
            namespace=namespace,
            status="published",
            scope_json={"revision_ids": revision_ids},
            gate_result_json=gate_result,
            previous_release_id=self._release_repository.get_active_release_id(namespace),
            idempotency_key=idempotency_key,
            published_by=actor,
        )
        release_assets: list[SemanticReleaseAsset] = []
        manifest_assets: list[dict[str, Any]] = []
        for revision in revisions:
            asset = self._release_repository.get_asset_by_id(revision.asset_id)
            if asset is None:
                raise ValueError(f"semantic asset not found: {revision.asset_id}")
            release_assets.append(
                SemanticReleaseAsset(
                    release_id=release.id,
                    asset_id=asset.id,
                    revision_id=revision.id,
                    asset_type=asset.asset_type,
                    asset_key=asset.asset_key,
                )
            )
            manifest_assets.append(
                {
                    "asset_id": asset.id,
                    "asset_type": asset.asset_type,
                    "asset_key": asset.asset_key,
                    "revision_id": revision.id,
                    "spec_checksum": revision.spec_checksum,
                    "spec": revision.spec_json,
                    "status": "published",
                }
            )

        snapshot = RuntimeSnapshot(
            id=f"snap_{uuid.uuid4().hex}",
            release_id=release.id,
            namespace=namespace,
            status="active",
            asset_manifest_json={
                "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
                "assets": manifest_assets,
            },
            binding_manifest_json={
                "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
                "bindings": [],
            },
            policy_manifest_json={
                "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
                "policies": [],
            },
        )
        resolved_audit_writer = audit_writer or self._build_governance_audit_writer(
            release=release,
            release_assets=release_assets,
            actor=actor,
            action="publish",
        )
        return self._release_repository.publish_with_snapshot(
            release,
            release_assets,
            snapshot,
            audit_writer=resolved_audit_writer,
        )

    def rollback_to(
        self,
        *,
        namespace: str,
        release_id: str,
        actor: str | None,
        idempotency_key: str | None = None,
        audit_writer: Callable[[dict[str, Any]], None] | None = None,
    ) -> SemanticRelease:
        target_release = self._release_repository.get_release(release_id)
        if target_release is None:
            raise ValueError(f"semantic release not found: {release_id}")
        target_assets = self._release_repository.list_release_assets(release_id)
        if not target_assets:
            raise ValueError(f"semantic release has no assets: {release_id}")

        release = SemanticRelease(
            id=f"rel_{uuid.uuid4().hex}",
            release_no=0,
            namespace=namespace,
            status="published",
            scope_json={"rollback_to_release_id": release_id},
            gate_result_json={"decision": "allow", "rollback": True},
            previous_release_id=self._release_repository.get_active_release_id(namespace),
            rollback_of_release_id=release_id,
            idempotency_key=idempotency_key,
            published_by=actor,
        )
        release_assets: list[SemanticReleaseAsset] = []
        manifest_assets: list[dict[str, Any]] = []
        for target_asset in target_assets:
            revision = self._release_repository.get_revision(target_asset.revision_id)
            if revision is None:
                raise ValueError(f"semantic revision not found: {target_asset.revision_id}")
            release_assets.append(
                SemanticReleaseAsset(
                    release_id=release.id,
                    asset_id=target_asset.asset_id,
                    revision_id=target_asset.revision_id,
                    asset_type=target_asset.asset_type,
                    asset_key=target_asset.asset_key,
                )
            )
            manifest_assets.append(
                {
                    "asset_id": target_asset.asset_id,
                    "asset_type": target_asset.asset_type,
                    "asset_key": target_asset.asset_key,
                    "revision_id": target_asset.revision_id,
                    "spec_checksum": revision.spec_checksum,
                    "spec": revision.spec_json,
                    "status": "published",
                }
            )

        snapshot = RuntimeSnapshot(
            id=f"snap_{uuid.uuid4().hex}",
            release_id=release.id,
            namespace=namespace,
            status="active",
            asset_manifest_json={
                "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
                "assets": manifest_assets,
            },
            binding_manifest_json={
                "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
                "bindings": [],
            },
            policy_manifest_json={
                "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
                "policies": [],
            },
        )
        resolved_audit_writer = audit_writer or self._build_governance_audit_writer(
            release=release,
            release_assets=release_assets,
            actor=actor,
            action="rollback",
        )
        return self._release_repository.publish_with_snapshot(
            release,
            release_assets,
            snapshot,
            audit_writer=resolved_audit_writer,
        )

    def _build_governance_audit_writer(
        self,
        *,
        release: SemanticRelease,
        release_assets: list[SemanticReleaseAsset],
        actor: str | None,
        action: str,
    ) -> Callable[[dict[str, Any]], None] | None:
        if self._audit_repository is None:
            return None

        def _write(payload: dict[str, Any]) -> None:
            trace = GovernanceAuditTrace(
                id=f"gat_{uuid.uuid4().hex}",
                target_type="semantic_release",
                target_name=release.id,
                principal_id=actor,
                semantic_plan_id=None,
                viewer_roles=[],
                route_type=f"semantic_{action}",
                execution_target="semantic_release",
                decision="allow",
                policy=None,
                policy_decision=release.gate_result_json or {},
                traceability={
                    "release_id": release.id,
                    "release_no": release.release_no,
                    "snapshot_id": payload.get("snapshot_id"),
                    "namespace": release.namespace,
                    "action": action,
                    "asset_count": len(release_assets),
                    "assets": [
                        {
                            "asset_id": item.asset_id,
                            "asset_type": item.asset_type,
                            "asset_key": item.asset_key,
                            "revision_id": item.revision_id,
                        }
                        for item in release_assets
                    ],
                },
                reason=None,
                timestamp=datetime.utcnow().isoformat(timespec="microseconds"),
            )
            try:
                self._audit_repository.save(trace, commit=False)
            except TypeError:
                self._audit_repository.save(trace)

        return _write
