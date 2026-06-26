"""语义资产 release 与 runtime snapshot 服务。"""
from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import datetime
from typing import Any, Callable

from app.domain.ontology.entities import GovernanceAuditTrace
from app.domain.semantic.asset_registry import (
    RELEASE_STATUS_TRANSITIONS,
    RUNTIME_MANIFEST_SCHEMA_VERSION,
    RuntimeSnapshot,
    SemanticRelease,
    SemanticReleaseAsset,
)


class SemanticBindingGateError(ValueError):
    """发布期断链校验失败。"""

    def __init__(self, blockers: list[dict[str, str]]):
        self.blockers = blockers
        codes = ", ".join(sorted({item["code"] for item in blockers}))
        super().__init__(f"semantic_binding_gate_blocked: {codes}")


class SemanticReleaseService:
    """发布资产 revision 并激活 Runtime snapshot。"""

    def __init__(self, release_repository, *, audit_repository=None, binding_matrix_checker=None):
        self._release_repository = release_repository
        self._audit_repository = audit_repository
        if binding_matrix_checker is None:
            from app.application.semantic.publish_gate_service import check_binding_matrix

            binding_matrix_checker = check_binding_matrix
        self._binding_matrix_checker = binding_matrix_checker

    def list_releases(
        self,
        *,
        namespace: str = "default",
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        list_method = getattr(self._release_repository, "list_releases", None)
        if not callable(list_method):
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        releases, total = list_method(namespace, status=status, limit=limit, offset=offset)
        return {
            "items": [self.release_summary(release) for release in releases],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get_release_detail(self, release_id: str) -> dict[str, Any] | None:
        release = self._release_repository.get_release(release_id)
        if release is None:
            return None
        assets = self._release_repository.list_release_assets(release_id)
        snapshot = self._release_repository.get_snapshot_by_release_id(release_id)
        payload = self.release_summary(release)
        payload["assets"] = [asset.model_dump(mode="json") for asset in assets]
        payload["snapshot"] = (
            {
                "id": snapshot.id,
                "release_id": snapshot.release_id,
                "namespace": snapshot.namespace,
                "status": snapshot.status,
                "asset_count": len(snapshot.asset_manifest_json.get("assets") or []),
                "binding_count": len(snapshot.binding_manifest_json.get("bindings") or []),
                "policy_count": len(snapshot.policy_manifest_json.get("policies") or []),
                "created_at": snapshot.created_at,
            }
            if snapshot is not None
            else None
        )
        return payload

    @staticmethod
    def release_summary(release: SemanticRelease) -> dict[str, Any]:
        return {
            "id": release.id,
            "release_no": release.release_no,
            "namespace": release.namespace,
            "status": release.status,
            "scope_json": release.scope_json,
            "gate_result_json": release.gate_result_json,
            "previous_release_id": release.previous_release_id,
            "rollback_of_release_id": release.rollback_of_release_id,
            "idempotency_key": release.idempotency_key,
            "published_by": release.published_by,
            "published_at": release.published_at,
            "status_reason": release.status_reason,
            "status_changed_at": release.status_changed_at,
            "created_at": release.created_at,
        }

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

        binding_matrix = self._run_binding_gate(namespace=namespace, revisions=revisions)
        gate_result = {**gate_result, "binding_matrix": binding_matrix}

        # §6.1 publish gate 增项：声明对上一 release 的兼容性（compatible | breaking）
        compatibility = self._build_compatibility_declaration(
            namespace=namespace,
            revisions=revisions,
        )
        gate_result["compatibility"] = compatibility

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
        # D1 发布累积：先取 namespace 当前 active release 的全量 assets，再用本批
        # revisions 按 (asset_type, asset_key) 覆盖去重，避免每次发布整盘替换 active
        # manifest（活菜单只剩最后一个 cube）。prev_id 为空（首次发布）时退化为只含本批。
        merged_assets = self._merge_prev_active_with_revisions(
            namespace=namespace,
            revisions=revisions,
        )
        release_assets, manifest_assets = self._build_assets_from_merged(
            merged_assets,
            release_id=release.id,
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

    def _merge_prev_active_with_revisions(
        self,
        *,
        namespace: str,
        revisions: list[Any],
    ) -> dict[tuple[str, str], dict[str, Any]]:
        """合并「namespace 当前 active release 全量 assets」与「本批 revisions」。

        以 (asset_type, asset_key) 为键去重：先放 prev active（保留既有资产），再用
        本批 revisions 覆盖同 key 项（新覆盖旧）。prev_id 为空（首次发布）时仅含本批，
        行为与改前一致（D1 退化要求）。
        """
        merged_assets: dict[tuple[str, str], dict[str, Any]] = {}
        prev_id = self._release_repository.get_active_release_id(namespace)
        if prev_id:
            for prev_asset in self._release_repository.list_release_assets(prev_id):
                prev_revision = self._release_repository.get_revision(prev_asset.revision_id)
                if prev_revision is None:
                    # 防御：跳过孤儿 revision，不阻断发布
                    continue
                merged_assets[(prev_asset.asset_type, prev_asset.asset_key)] = {
                    "asset_id": prev_asset.asset_id,
                    "asset_type": prev_asset.asset_type,
                    "asset_key": prev_asset.asset_key,
                    "revision_id": prev_asset.revision_id,
                    "spec_checksum": prev_revision.spec_checksum,
                    "spec_json": prev_revision.spec_json,
                }
        for revision in revisions:
            asset = self._release_repository.get_asset_by_id(revision.asset_id)
            if asset is None:
                raise ValueError(f"semantic asset not found: {revision.asset_id}")
            merged_assets[(asset.asset_type, asset.asset_key)] = {
                "asset_id": asset.id,
                "asset_type": asset.asset_type,
                "asset_key": asset.asset_key,
                "revision_id": revision.id,
                "spec_checksum": revision.spec_checksum,
                "spec_json": revision.spec_json,
            }
        return merged_assets

    def _build_assets_from_merged(
        self,
        merged_assets: dict[tuple[str, str], dict[str, Any]],
        *,
        release_id: str,
    ) -> tuple[list[SemanticReleaseAsset], list[dict[str, Any]]]:
        """从合并结果生成 release_assets 与 manifest_assets（形状与改前一致）。"""
        release_assets: list[SemanticReleaseAsset] = []
        manifest_assets: list[dict[str, Any]] = []
        for entry in merged_assets.values():
            release_assets.append(
                SemanticReleaseAsset(
                    release_id=release_id,
                    asset_id=entry["asset_id"],
                    revision_id=entry["revision_id"],
                    asset_type=entry["asset_type"],
                    asset_key=entry["asset_key"],
                )
            )
            manifest_assets.append(
                {
                    "asset_id": entry["asset_id"],
                    "asset_type": entry["asset_type"],
                    "asset_key": entry["asset_key"],
                    "revision_id": entry["revision_id"],
                    "spec_checksum": entry["spec_checksum"],
                    "spec": self._activated_spec(entry["spec_json"]),
                    "status": "published",
                }
            )
        return release_assets, manifest_assets

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
                    "spec": self._activated_spec(revision.spec_json),
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

    def deprecate(
        self,
        *,
        release_id: str,
        actor: str | None,
        reason: str | None = None,
    ) -> SemanticRelease:
        """published/superseded → deprecated：查询继续可用，但 evidence 携带告警。"""
        return self._transition_release_status(
            release_id=release_id,
            target_status="deprecated",
            actor=actor,
            reason=reason,
        )

    def revoke(
        self,
        *,
        release_id: str,
        actor: str | None,
        reason: str | None = None,
    ) -> SemanticRelease:
        """published/superseded/deprecated → revoked：终态阻断，用于口径错误召回。

        revoke 当前 active release 后，runtime manifest 立即 fail closed
        （reason_code=release_revoked）；恢复服务需 rollback 到健康 release。
        """
        return self._transition_release_status(
            release_id=release_id,
            target_status="revoked",
            actor=actor,
            reason=reason,
        )

    def _transition_release_status(
        self,
        *,
        release_id: str,
        target_status: str,
        actor: str | None,
        reason: str | None,
    ) -> SemanticRelease:
        release = self._release_repository.get_release(release_id)
        if release is None:
            raise ValueError(f"semantic release not found: {release_id}")
        allowed_from = RELEASE_STATUS_TRANSITIONS.get(target_status, ())
        if release.status not in allowed_from:
            raise ValueError(
                f"semantic_release_invalid_transition: {release.status} -> {target_status}"
            )
        updated = self._release_repository.update_release_status(
            release_id,
            status=target_status,
            reason=reason,
        )
        if updated is None:
            raise ValueError(f"semantic release not found: {release_id}")
        self._write_status_audit(release=updated, actor=actor, action=target_status, reason=reason)
        return updated

    def _build_compatibility_declaration(
        self,
        *,
        namespace: str,
        revisions: list[Any],
    ) -> dict[str, Any]:
        """对比上一 active manifest 与本批资产，声明 compatible | breaking。

        当前发布模型按「本批 scope 替换 active manifest」工作，因此上一 manifest
        中不在本批的资产将从运行时退出（视为 breaking 信号）；同 key 资产
        spec_checksum 变化记为 changed（compatible 范畴）。该声明只记录不阻断。
        """
        previous: dict[tuple[str, str], str] = {}
        get_snapshot = getattr(self._release_repository, "get_active_snapshot", None)
        if callable(get_snapshot):
            snapshot = get_snapshot(namespace)
            if snapshot is not None:
                for asset in snapshot.asset_manifest_json.get("assets") or []:
                    key = (str(asset.get("asset_type")), str(asset.get("asset_key")))
                    previous[key] = str(asset.get("spec_checksum") or "")

        current: dict[tuple[str, str], str] = {}
        for revision in revisions:
            asset = self._release_repository.get_asset_by_id(revision.asset_id)
            if asset is None:
                continue
            current[(asset.asset_type, asset.asset_key)] = str(revision.spec_checksum or "")

        removed = sorted(
            f"{asset_type}:{asset_key}" for (asset_type, asset_key) in previous.keys() - current.keys()
        )
        added = sorted(
            f"{asset_type}:{asset_key}" for (asset_type, asset_key) in current.keys() - previous.keys()
        )
        changed = sorted(
            f"{asset_type}:{asset_key}"
            for (asset_type, asset_key) in current.keys() & previous.keys()
            if current[(asset_type, asset_key)] != previous[(asset_type, asset_key)]
        )
        level = "breaking" if removed else "compatible"
        return {
            "level": level,
            "added_assets": added,
            "changed_assets": changed,
            "removed_assets": removed,
            "baseline": "active_manifest",
        }

    def _write_status_audit(
        self,
        *,
        release: SemanticRelease,
        actor: str | None,
        action: str,
        reason: str | None,
    ) -> None:
        if self._audit_repository is None:
            return
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
            policy_decision={"status": release.status, "reason": reason},
            traceability={
                "release_id": release.id,
                "release_no": release.release_no,
                "namespace": release.namespace,
                "action": action,
                "status_reason": reason,
            },
            reason=reason,
            timestamp=datetime.utcnow().isoformat(timespec="microseconds"),
        )
        try:
            self._audit_repository.save(trace, commit=True)
        except TypeError:
            self._audit_repository.save(trace)

    def _run_binding_gate(self, *, namespace: str, revisions: list[Any]) -> dict[str, Any]:
        """§1.3 断链校验：解析范围 = 同批发布资产 ∪ 当前 active manifest。"""
        if self._binding_matrix_checker is None:
            return {"ok": True, "skipped": True}
        active_catalog = self._active_catalog(namespace)
        specs = [revision.spec_json or {} for revision in revisions]
        result = self._binding_matrix_checker(specs, active_catalog=active_catalog)
        if not result.get("ok", True):
            raise SemanticBindingGateError(result.get("blockers") or [])
        return result

    def _active_catalog(self, namespace: str):
        get_snapshot = getattr(self._release_repository, "get_active_snapshot", None)
        if not callable(get_snapshot):
            return None
        snapshot = get_snapshot(namespace)
        if snapshot is None:
            return None
        from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog

        try:
            return RuntimeSemanticCatalog.from_manifest(
                {
                    "snapshot_id": snapshot.id,
                    "release_id": snapshot.release_id,
                    "asset_manifest_json": snapshot.asset_manifest_json,
                }
            )
        except (ValueError, TypeError):
            # active manifest 不可解析时不阻断发布，仅缩小解析范围为同批资产
            return None

    @staticmethod
    def _activated_spec(spec: dict[str, Any] | None) -> dict[str, Any]:
        """发布即激活：进入 published manifest 的资产 spec 状态统一落为 active。

        这是状态生命周期的根因修复；runtime catalog 加载期的提升补丁仅作为
        过渡期兜底并记录告警（见 runtime_manifest_catalog）。
        """
        activated = deepcopy(spec or {})
        cube = activated.get("cube")
        if isinstance(cube, dict):
            cube["status"] = "active"
        # 单资产平铺形态的 cube spec
        if activated.get("name") and activated.get("dimensions") and activated.get("measures"):
            activated["status"] = "active"
        for key in ("object", "metric", "relation", "action"):
            item = activated.get(key)
            if isinstance(item, dict):
                item["status"] = "active"
        ontology = activated.get("ontology")
        if isinstance(ontology, dict):
            for key in (
                "object",
                "objects",
                "metric",
                "metrics",
                "properties",
                "glossary",
                "policies",
                "relations",
                "actions",
            ):
                value = ontology.get(key)
                items = value if isinstance(value, list) else ([value] if isinstance(value, dict) else [])
                for item in items:
                    if isinstance(item, dict):
                        item["status"] = "active"
        return activated

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
