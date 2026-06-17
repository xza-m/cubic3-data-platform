"""建模助手 Proposal 应用服务。"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import hashlib
import json
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from uuid import uuid4

from app.application.semantic.modeling_coverage_analyzer import CoverageAnalyzer
from app.application.semantic.modeling_spec_repair import repair_modeling_spec
from app.application.semantic.modeling_validation_matrix import ValidationMatrixBuilder
from app.application.semantic.publish_readiness_checker import PublishReadinessChecker
from app.domain.semantic.asset_registry import SemanticAsset
from app.domain.semantic.modeling_proposal import ModelingProposal
from app.domain.semantic.ports.modeling_proposal_repository import IModelingProposalRepository

if TYPE_CHECKING:
    from app.application.semantic.modeling_draft_builder import SemanticModelDraftBuilder


class ModelingProposalService:
    """用有状态 Proposal 包装现有建模助手动作链。"""

    def __init__(
        self,
        *,
        repository: IModelingProposalRepository,
        builder: "SemanticModelDraftBuilder",
        readiness_checker: PublishReadinessChecker,
        asset_registry_repository: Any = None,
        release_service: Any = None,
        asset_namespace: str = "default",
        coverage_analyzer: Optional[CoverageAnalyzer] = None,
        validation_matrix_builder: Optional[ValidationMatrixBuilder] = None,
    ):
        self._repository = repository
        self._builder = builder
        self._readiness_checker = readiness_checker
        self._asset_registry_repository = asset_registry_repository
        self._release_service = release_service
        self._asset_namespace = asset_namespace or "default"
        self._coverage_analyzer = coverage_analyzer or CoverageAnalyzer(readiness_checker)
        self._validation_matrix_builder = validation_matrix_builder or ValidationMatrixBuilder()

    def create_proposal(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        source_mode = str(payload.get("source_mode") or "human_led")
        if source_mode not in {"human_led", "agent_led"}:
            source_mode = "human_led"
        proposal = ModelingProposal(
            id=str(payload.get("id") or f"proposal_{uuid4().hex}"),
            source_mode=source_mode,  # type: ignore[arg-type]
            status="created",
            intent=self._build_intent(payload),
            source_context={
                "request_payload": deepcopy(payload),
                "source_kind": payload.get("source_kind") or "physical_table",
                "source_id": payload.get("source_id"),
                "dataset_id": payload.get("dataset_id"),
                "database": payload.get("database"),
                "schema": payload.get("schema"),
                "table": payload.get("table"),
            },
            audit_snapshot={"spec_is_runtime_source": False, "created_via": "modeling_proposal"},
        )
        self._repository.save(proposal)
        return self._dump(proposal)

    def get_proposal(self, proposal_id: str) -> Dict[str, Any]:
        return self._dump(self._require(proposal_id))

    def get_gap_view(self, proposal_id: str) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        self._sync_readiness_label(proposal)
        return {
            "id": proposal.id,
            "status": proposal.status,
            "display_status": self._display_status(proposal),
            "question": self._gap_question(proposal),
            "coverage": self._gap_coverage(proposal),
            "gaps": self._gap_items(proposal),
            "patch_plan": self._gap_patch_plan(proposal),
            "validation": self._gap_validation(proposal),
            "technical_change": self._gap_technical_change(proposal),
            "primary_action": self._gap_primary_action(proposal),
        }

    def confirm_source(self, proposal_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        source_patch = self._source_patch(payload)
        source_hash = self._stable_hash(source_patch)
        idempotency_key = str(
            payload.get("idempotency_key") or f"{proposal.id}:confirm_source:{source_hash}"
        )
        if proposal.has_action("confirm_source", idempotency_key):
            return self._dump(proposal)

        request_payload = dict(proposal.source_context.get("request_payload") or {})
        request_payload.update(source_patch)
        proposal.source_context.update(source_patch)
        proposal.source_context["request_payload"] = request_payload
        proposal.source_context["confirmed_source"] = source_patch
        self._bump_revision(proposal)
        if proposal.spec:
            proposal.status = "drafted"
        actor = str(payload.get("actor") or payload.get("confirmed_by") or "semantic_owner")
        self._mark_transition(proposal, actor=actor)
        proposal.record_action(
            "confirm_source",
            actor=actor,
            idempotency_key=idempotency_key,
            payload={"source_hash": source_hash, "source": source_patch},
        )
        self._repository.save(proposal)
        return self._dump(proposal)

    def update_spec(self, proposal_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        next_spec = self._next_spec(proposal, payload)
        spec_hash = self._stable_hash(next_spec)
        current_hash = self._stable_hash(proposal.spec or {})
        if spec_hash == current_hash:
            return self._dump(proposal)
        idempotency_key = str(payload.get("idempotency_key") or f"{proposal.id}:update_spec:{spec_hash}")
        if proposal.has_action("update_spec", idempotency_key):
            return self._dump(proposal)

        proposal.spec = next_spec
        proposal.coverage_result = self._coverage_from_spec(next_spec)
        proposal.validation_matrix = {"blockers": [], "warnings": [], "infos": []}
        proposal.runtime_consumption_result = {}
        proposal.publish_result = {}
        proposal.status = "drafted"
        self._bump_revision(proposal)
        actor = str(payload.get("actor") or payload.get("updated_by") or "semantic_owner")
        self._mark_transition(proposal, actor=actor)
        proposal.record_action(
            "update_spec",
            actor=actor,
            idempotency_key=idempotency_key,
            payload={"spec_hash": spec_hash, "updated_keys": self._spec_update_keys(payload)},
        )
        self._repository.save(proposal)
        return self._dump(proposal)

    def draft(self, proposal_id: str) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        payload = deepcopy(proposal.source_context.get("request_payload") or {})
        # Copilot / 会话工作台已生成完整 SemanticModelDraft spec 时，附带 embedded_spec，
        # 避免再次用 source_kind=business_question 走 create_spec_draft（会触发「不支持的建模源类型」）。
        embedded_spec = payload.pop("embedded_spec", None)
        spec_result: Dict[str, Any]
        if (
            isinstance(embedded_spec, dict)
            and str(embedded_spec.get("spec_version") or "") == "v1"
            and isinstance(embedded_spec.get("cube"), dict)
            and embedded_spec["cube"]
        ):
            spec_result = {
                "spec": deepcopy(embedded_spec),
                "next_actions": {"default_publish_target": "cube_and_ontology"},
            }
        else:
            spec_result = self._builder.create_spec_draft(payload)
        spec = spec_result.get("spec") or {}
        if proposal.source_mode == "agent_led":
            spec = repair_modeling_spec(
                spec,
                user_goal=str(proposal.intent.get("user_question") or payload.get("user_question") or ""),
                source_mode=proposal.source_mode,
            )
        proposal.spec = spec
        proposal.coverage_result = self._coverage_from_spec(spec)
        if proposal.coverage_result.get("decision") == "covered":
            proposal.status = "closed"
            proposal.close_reason = "reused_existing"
            self._mark_transition(proposal, actor="coverage_analyzer")
            self._repository.save(proposal)
            return self._dump(proposal)
        draft_result = self._builder.draft_from_spec(spec)
        proposal.drafts = {
            "cube": draft_result.get("cube") or {},
            "ontology": draft_result.get("ontology") or {},
        }
        proposal.semantic_diff = draft_result.get("diff") or {
            "source": "user_confirmed_spec",
            "has_user_editable_spec": True,
        }
        proposal.status = "drafted"
        proposal.audit_snapshot = draft_result.get("audit") or proposal.audit_snapshot
        self._mark_transition(proposal, actor="modeling_agent")
        self._repository.save(proposal)
        return self._dump(proposal)

    def validate(self, proposal_id: str) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        if not proposal.spec:
            raise ValueError("Proposal must be drafted before validate")
        if proposal.source_mode == "agent_led":
            proposal.spec = repair_modeling_spec(
                proposal.spec,
                user_goal=str(proposal.intent.get("user_question") or ""),
                source_mode=proposal.source_mode,
            )
        validation = self._builder.validate(proposal.spec)
        proposal.validation_matrix = self._validation_matrix(proposal.spec, validation)
        proposal.coverage_result = self._coverage_from_spec(proposal.spec, validation)
        proposal.runtime_consumption_result = self._readiness_checker.evaluate(proposal.spec, validation)
        proposal.status = "blocked" if proposal.validation_matrix["blockers"] else "validated"
        self._mark_transition(proposal, actor="validation_matrix")
        self._repository.save(proposal)
        return self._dump(proposal)

    def approve(self, proposal_id: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        approved_hash = self._stable_hash(proposal.spec)
        if proposal.status in {"approved", "applied", "published"}:
            if (
                proposal.approved_spec_hash == approved_hash
                and proposal.approved_proposal_revision_no == proposal.proposal_revision_no
            ):
                return self._dump(proposal)
            raise ValueError("Approved proposal revision does not match current spec")
        if proposal.status != "validated":
            raise ValueError("Proposal must be validated before approved")
        review = dict(payload or {})
        review.setdefault("approved_by", "semantic_owner")
        review.setdefault("review_type", "single_owner")
        proposal.review_records.append(review)
        proposal.audit_snapshot["approved_spec"] = deepcopy(proposal.spec)
        proposal.audit_snapshot["approved_semantic_diff"] = deepcopy(proposal.semantic_diff)
        proposal.audit_snapshot["approved_spec_hash"] = approved_hash
        proposal.approved_spec_hash = approved_hash
        proposal.approved_proposal_revision_no = proposal.proposal_revision_no
        proposal.status = "approved"
        actor = str(review.get("approved_by") or "semantic_owner")
        self._mark_transition(proposal, actor=actor)
        proposal.record_action(
            "approve",
            actor=actor,
            idempotency_key=self._proposal_action_key(proposal, "approve", approved_hash),
            payload={"approved_spec_hash": approved_hash},
        )
        self._repository.save(proposal)
        return self._dump(proposal)

    def apply(self, proposal_id: str) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        if proposal.status in {"applied", "published"}:
            return self._dump(proposal)
        if proposal.status != "approved":
            raise ValueError("Proposal must be approved before apply")
        approved_spec = proposal.audit_snapshot.get("approved_spec") or proposal.spec
        approved_hash = proposal.approved_spec_hash or self._stable_hash(approved_spec)
        current_hash = self._stable_hash(proposal.spec)
        if current_hash != approved_hash:
            raise ValueError("Approved spec changed before apply")
        result = (
            self._apply_to_sql_registry(proposal)
            if self._uses_sql_registry()
            else self._builder.apply(proposal.spec)
        )
        applied_spec = result.get("spec") or proposal.spec
        applied_hash = self._stable_hash(applied_spec)
        proposal.drafts["apply_result"] = result
        proposal.spec = applied_spec
        proposal.applied_spec_hash = applied_hash
        proposal.audit_snapshot["applied_spec_hash"] = applied_hash
        proposal.applied_proposal_revision_no = proposal.proposal_revision_no
        proposal.status = "applied"
        self._mark_transition(proposal, actor="semantic_bundle_builder")
        proposal.record_action(
            "apply",
            actor="semantic_bundle_builder",
            idempotency_key=self._proposal_action_key(proposal, "apply", approved_hash),
            payload={
                "approved_spec_hash": approved_hash,
                "applied_spec_hash": applied_hash,
            },
        )
        self._repository.save(proposal)
        return self._dump(proposal)

    def publish(self, proposal_id: str, publish_targets: Optional[Dict[str, bool]] = None) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        scope_hash = self._stable_hash(publish_targets or {"cube": True, "ontology": True})
        if proposal.status == "published":
            existing_scope_hash = proposal.audit_snapshot.get("publish_scope_hash")
            if existing_scope_hash and existing_scope_hash != scope_hash:
                raise ValueError("Proposal already published with different publish scope")
            return self._dump(proposal)
        if proposal.status != "applied":
            raise ValueError("Proposal must be applied before publish")
        result = (
            self._publish_from_sql_registry(proposal, publish_targets=publish_targets, scope_hash=scope_hash)
            if self._uses_sql_registry()
            else self._builder.publish(proposal.spec, publish_targets=publish_targets)
        )
        proposal.publish_result = result
        proposal.audit_snapshot["publish_scope_hash"] = scope_hash
        proposal.status = "published"
        self._mark_transition(proposal, actor="semantic_publisher")
        proposal.record_action(
            "publish",
            actor="semantic_publisher",
            idempotency_key=self._proposal_action_key(proposal, "publish", scope_hash),
            payload={"publish_scope_hash": scope_hash},
        )
        self._repository.save(proposal)
        return self._dump(proposal)

    def _uses_sql_registry(self) -> bool:
        return self._asset_registry_repository is not None and self._release_service is not None

    def _apply_to_sql_registry(self, proposal: ModelingProposal) -> Dict[str, Any]:
        spec = deepcopy(proposal.spec or {})
        asset = self._upsert_sql_registry_asset(proposal, spec, status="draft")
        revision = self._asset_registry_repository.append_revision(
            asset.id,
            spec,
            proposal_id=proposal.id,
            actor="semantic_bundle_builder",
        )
        return {
            "published": False,
            "source": "sql_registry",
            "spec": spec,
            "assets": {
                "cube": {
                    "id": asset.id,
                    "name": asset.asset_key,
                    "status": asset.status,
                    "revision_id": revision.id,
                    "revision_no": revision.revision_no,
                    "namespace": asset.namespace,
                    "source": "sql_registry",
                }
            },
            "registry": {
                "namespace": asset.namespace,
                "asset_id": asset.id,
                "asset_key": asset.asset_key,
                "revision_id": revision.id,
                "revision_no": revision.revision_no,
                "spec_checksum": revision.spec_checksum,
            },
        }

    def _publish_from_sql_registry(
        self,
        proposal: ModelingProposal,
        *,
        publish_targets: Optional[Dict[str, bool]],
        scope_hash: str,
    ) -> Dict[str, Any]:
        targets = publish_targets or {"cube": True, "ontology": True}
        if targets.get("cube") is False:
            raise ValueError("SQL Registry publish requires cube target")

        spec = deepcopy(proposal.spec or {})
        asset = self._upsert_sql_registry_asset(proposal, spec, status="draft")
        revision_id = self._registry_revision_id(proposal)
        revision = self._asset_registry_repository.get_revision(revision_id) if revision_id else None
        if revision is None or revision.asset_id != asset.id:
            revision = self._asset_registry_repository.append_revision(
                asset.id,
                spec,
                proposal_id=proposal.id,
                actor="semantic_publisher",
            )

        release = self._release_service.publish(
            namespace=asset.namespace,
            revision_ids=[revision.id],
            actor="semantic_publisher",
            gate_result={
                "decision": "allow",
                "source": "modeling_proposal",
                "proposal_id": proposal.id,
                "approved_spec_hash": proposal.approved_spec_hash,
                "publish_scope_hash": scope_hash,
            },
            idempotency_key=self._proposal_action_key(proposal, "publish", scope_hash),
        )
        active_asset = self._asset_registry_repository.get_asset_by_id(asset.id) or asset
        snapshot = self._active_registry_snapshot(asset.namespace)
        cube_result = {
            "id": active_asset.id,
            "name": active_asset.asset_key,
            "status": active_asset.status,
            "revision_id": revision.id,
            "release_id": release.id,
            "release_no": release.release_no,
            "namespace": active_asset.namespace,
            "source": "sql_registry",
        }
        result = {
            "publish_targets": targets,
            "source": "sql_registry",
            "cube": cube_result,
            "published": {"cube": cube_result},
            "release": {
                "id": release.id,
                "release_no": release.release_no,
                "status": release.status,
                "namespace": release.namespace,
            },
            "registry": {
                "namespace": active_asset.namespace,
                "asset_id": active_asset.id,
                "asset_key": active_asset.asset_key,
                "revision_id": revision.id,
                "release_id": release.id,
                "snapshot_id": getattr(snapshot, "id", None) if snapshot is not None else None,
            },
        }
        if targets.get("ontology"):
            result["ontology"] = {"status": "active", "source": "sql_registry", "asset_id": active_asset.id}
            result["published"]["ontology"] = result["ontology"]
        return result

    def _upsert_sql_registry_asset(
        self,
        proposal: ModelingProposal,
        spec: Dict[str, Any],
        *,
        status: str,
    ) -> SemanticAsset:
        namespace = self._registry_namespace(proposal)
        cube = spec.get("cube") or {}
        ontology = spec.get("ontology") or {}
        obj = ontology.get("object") or {}
        asset_key = str(cube.get("name") or obj.get("name") or "").strip()
        if not asset_key:
            raise ValueError("Semantic spec must include cube.name before registry apply")
        existing = self._asset_registry_repository.get_asset(namespace, "cube", asset_key)
        title = (
            cube.get("title")
            or obj.get("title")
            or (spec.get("business") or {}).get("subject")
            or asset_key
        )
        asset = SemanticAsset(
            id=existing.id if existing is not None else f"asset_{uuid4().hex}",
            namespace=namespace,
            asset_type="cube",
            asset_key=asset_key,
            title=str(title),
            status=existing.status if existing is not None else status,
            current_revision_id=getattr(existing, "current_revision_id", None),
            current_release_id=getattr(existing, "current_release_id", None),
            owner_principal_id=self._registry_owner(proposal),
            source_kind="copilot" if proposal.source_mode == "agent_led" else "human",
        )
        return self._asset_registry_repository.create_or_update_asset(asset)

    def _registry_namespace(self, proposal: ModelingProposal) -> str:
        payload = proposal.source_context.get("request_payload") or {}
        return str(
            payload.get("semantic_namespace")
            or payload.get("namespace")
            or proposal.source_context.get("semantic_namespace")
            or self._asset_namespace
            or "default"
        )

    def _registry_owner(self, proposal: ModelingProposal) -> str:
        for record in reversed(proposal.review_records or []):
            owner = record.get("approved_by") or record.get("actor") or record.get("reviewer")
            if owner:
                return str(owner)
        return "semantic_owner"

    def _registry_revision_id(self, proposal: ModelingProposal) -> Optional[str]:
        apply_result = proposal.drafts.get("apply_result") or {}
        registry = apply_result.get("registry") or {}
        revision_id = registry.get("revision_id")
        if revision_id:
            return str(revision_id)
        cube = (apply_result.get("assets") or {}).get("cube") or {}
        if cube.get("revision_id"):
            return str(cube["revision_id"])
        return None

    def _active_registry_snapshot(self, namespace: str) -> Any:
        getter = getattr(self._asset_registry_repository, "get_active_snapshot", None)
        if getter is None:
            return None
        return getter(namespace)

    def close(self, proposal_id: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        proposal = self._require(proposal_id)
        body = dict(payload or {})
        reason = str(body.get("close_reason") or body.get("reason") or "abandoned")
        if reason not in {"reused_existing", "rejected", "abandoned"}:
            raise ValueError("Unsupported close_reason")
        actor = str(body.get("actor") or body.get("reviewer") or "semantic_owner")
        proposal.status = "closed"
        proposal.close_reason = reason
        proposal.review_records.append(
            {
                "action": "close",
                "actor": actor,
                "close_reason": reason,
                "comment": body.get("comment"),
            }
        )
        self._mark_transition(proposal, actor=actor)
        self._repository.save(proposal)
        return self._dump(proposal)

    def _coverage_from_spec(self, spec: Dict[str, Any], validation: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._coverage_analyzer.evaluate(spec, validation)

    def _validation_matrix(self, spec: Dict[str, Any], validation: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        return self._validation_matrix_builder.build(spec, validation)

    def _build_intent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "business_subject": payload.get("business_subject") or payload.get("subject") or payload.get("title"),
            "user_question": payload.get("user_question"),
            "use_cases": payload.get("use_cases"),
            "default_roles": payload.get("default_roles"),
            "sensitivity_level": payload.get("sensitivity_level") or "restricted",
        }

    def _require(self, proposal_id: str) -> ModelingProposal:
        proposal = self._repository.get(proposal_id)
        if proposal is None:
            raise ValueError(f"ModelingProposal not found: {proposal_id}")
        return proposal

    def _dump(self, proposal: ModelingProposal) -> Dict[str, Any]:
        self._sync_readiness_label(proposal)
        return proposal.model_dump(mode="json", exclude_none=True)

    def _display_status(self, proposal: ModelingProposal) -> str:
        if proposal.close_reason == "reused_existing":
            return "已有语义可回答"
        return {
            "created": "待诊断",
            "drafted": "待校验",
            "validated": "可确认",
            "blocked": "校验未通过",
            "approved": "已确认",
            "applied": "已保存草稿",
            "published": "已发布",
            "closed": "已关闭",
            "rejected": "已拒绝",
            "archived": "已归档",
        }.get(proposal.status, proposal.status)

    def _gap_question(self, proposal: ModelingProposal) -> Dict[str, Any]:
        payload = proposal.source_context.get("request_payload") or {}
        text = (
            proposal.intent.get("user_question")
            or payload.get("user_question")
            or payload.get("question")
            or proposal.intent.get("business_subject")
            or payload.get("business_subject")
            or payload.get("table")
            or "未命名业务问题"
        )
        context = []
        for key, label, value in [
            ("subject", "主题", proposal.intent.get("business_subject") or payload.get("business_subject")),
            ("source", "入口", self._source_label(payload.get("source_kind") or proposal.source_context.get("source_kind"))),
            ("table", "候选表", payload.get("table") or proposal.source_context.get("table")),
            ("sensitivity", "敏感等级", proposal.intent.get("sensitivity_level")),
        ]:
            if value:
                context.append({"key": key, "label": label, "value": str(value)})
        return {"text": str(text), "extracted_context": context}

    def _gap_coverage(self, proposal: ModelingProposal) -> Dict[str, Any]:
        coverage = proposal.coverage_result or {}
        decision = str(coverage.get("decision") or ("pending" if proposal.status == "created" else "create_new"))
        labels = {
            "covered": "已有语义可回答",
            "create_new": "需要补齐语义",
            "need_human_binding": "需要确认执行口径",
            "blocked": "存在阻断项",
            "pending": "等待诊断",
        }
        summaries = {
            "covered": "已有 Ontology / Cube / Binding 可以复用，不需要新增语义资产。",
            "create_new": "当前语义还不能直接回答，需要补齐模型、指标或执行口径。",
            "need_human_binding": "存在多个候选执行口径，需要人工选择后才能继续。",
            "blocked": "当前补齐方案存在阻断项，需先修复后再确认。",
            "pending": "提交业务问题后，系统会先检查已有语义覆盖情况。",
        }
        return {
            "decision": decision,
            "label": labels.get(decision, decision),
            "summary": summaries.get(decision, "语义覆盖状态已更新。"),
            "reusable_assets": coverage.get("reusable_assets") or [],
        }

    def _gap_items(self, proposal: ModelingProposal) -> List[Dict[str, Any]]:
        coverage = proposal.coverage_result or {}
        decision = str(coverage.get("decision") or "")
        if proposal.close_reason == "reused_existing" or decision == "covered":
            return []

        items: List[Dict[str, Any]] = []
        if proposal.status == "created":
            items.append(
                self._gap_item(
                    "gap_pending",
                    "model_missing",
                    "optional",
                    "等待语义诊断",
                    "点击开始诊断后，系统会检查已有语义并生成补齐建议。",
                    "proposal.status=created",
                )
            )
            return items

        items.append(
            self._gap_item(
                "gap_coverage",
                "model_missing",
                "required" if decision != "need_human_binding" else "needs_confirmation",
                "当前语义还不能直接回答",
                self._gap_coverage(proposal)["summary"],
                f"coverage.decision={decision or 'create_new'}",
                requires_confirmation=decision == "need_human_binding",
            )
        )

        for reason in coverage.get("blocking_reasons") or []:
            items.append(
                self._gap_item(
                    f"gap_{reason}",
                    "binding_missing" if "binding" in str(reason) else "policy_missing",
                    "required",
                    self._reason_title(str(reason)),
                    "需要先处理该阻断原因，再进入确认和发布。",
                    str(reason),
                )
            )

        for issue in (proposal.validation_matrix.get("blockers") or []):
            code = str(issue.get("code") or issue.get("path") or "validation_blocker")
            items.append(
                self._gap_item(
                    f"gap_{code}",
                    "validation_blocker",
                    "required",
                    str(issue.get("message") or "校验阻断"),
                    "该问题会影响语义发布或 Agent 正式消费。",
                    str(issue.get("path") or code),
                )
            )
        return items

    def _gap_item(
        self,
        item_id: str,
        item_type: str,
        severity: str,
        title: str,
        description: str,
        technical_hint: str,
        *,
        requires_confirmation: bool = False,
    ) -> Dict[str, Any]:
        return {
            "id": item_id,
            "type": item_type,
            "severity": severity,
            "title": title,
            "description": description,
            "technical_hint": technical_hint,
            "requires_confirmation": requires_confirmation,
        }

    def _gap_patch_plan(self, proposal: ModelingProposal) -> List[Dict[str, Any]]:
        spec = proposal.spec or {}
        ontology = spec.get("ontology") or {}
        cube = spec.get("cube") or {}
        subject = str((spec.get("business") or {}).get("subject") or proposal.intent.get("business_subject") or "")
        items: List[Dict[str, Any]] = []

        obj = ontology.get("object") or {}
        if obj:
            name = str(obj.get("name") or cube.get("name") or "semantic_model")
            items.append(self._patch_item("model", name, obj.get("title") or subject or name, "新增或更新可被业务问题复用的语义模型。"))

        for metric in ontology.get("metrics") or []:
            name = str(metric.get("name") or "metric")
            title = str(metric.get("title") or self._metric_title(subject, name))
            items.append(self._patch_item("metric", name, title, "新增可被 Agent 使用的业务指标。"))

        dimensions = cube.get("dimensions") or {}
        if isinstance(dimensions, dict):
            for name, payload in dimensions.items():
                title = payload.get("title") if isinstance(payload, dict) else None
                items.append(self._patch_item("dimension", str(name), str(title or name), "补齐分析下钻或过滤维度。"))

        for policy in ontology.get("policies") or []:
            name = str(policy.get("name") or "policy")
            items.append(self._patch_item("policy", name, str(policy.get("title") or name), "补齐数据使用和可见性规则。"))

        if not items and proposal.status == "created":
            items.append(
                {
                    "id": "patch_pending",
                    "type": "pending",
                    "title": "等待补齐建议",
                    "business_name": "等待补齐建议",
                    "technical_name": None,
                    "description": "开始诊断后会展示建议新增或复用的语义资产。",
                }
            )
        if not items:
            items.extend(self._repair_patch_plan(proposal))
        return items

    def _patch_item(self, item_type: str, technical_name: str, business_name: str, description: str) -> Dict[str, Any]:
        return {
            "id": f"{item_type}_{technical_name}",
            "type": item_type,
            "title": business_name,
            "business_name": business_name,
            "technical_name": technical_name,
            "description": description,
        }

    def _repair_patch_plan(self, proposal: ModelingProposal) -> List[Dict[str, Any]]:
        """当草稿本身缺关键资产时，把 blockers 转成业务可执行的补齐项。"""

        repairs: List[Dict[str, Any]] = []
        seen = set()

        for issue in proposal.validation_matrix.get("blockers") or []:
            code = str(issue.get("code") or issue.get("path") or "validation_blocker")
            path = str(issue.get("path") or code)
            message = str(issue.get("message") or self._reason_title(code))
            item_type, title, description = self._repair_patch_item_text(code=code, path=path, message=message)
            key = (item_type, title, path)
            if key in seen:
                continue
            seen.add(key)
            repairs.append(
                {
                    "id": f"repair_{self._safe_fragment(code)}",
                    "type": item_type,
                    "title": title,
                    "business_name": title,
                    "technical_name": path,
                    "description": description,
                }
            )

        if repairs:
            return repairs

        for reason in (proposal.coverage_result or {}).get("blocking_reasons") or []:
            reason_text = str(reason)
            item_type, title, description = self._repair_patch_item_text(
                code=reason_text,
                path=reason_text,
                message=self._reason_title(reason_text),
            )
            repairs.append(
                {
                    "id": f"repair_{self._safe_fragment(reason_text)}",
                    "type": item_type,
                    "title": title,
                    "business_name": title,
                    "technical_name": reason_text,
                    "description": description,
                }
            )
        return repairs

    def _repair_patch_item_text(self, *, code: str, path: str, message: str) -> tuple[str, str, str]:
        needle = f"{code} {path} {message}".lower()
        if "cube.name" in needle or "cube_name" in needle:
            return (
                "cube",
                "补充语义模型名称",
                "为 Cube 设置稳定技术名，后续草稿保存、指标绑定和发布都依赖这个名称。",
            )
        if "measure" in needle or "measures" in needle:
            return (
                "metric",
                "补充指标计算口径",
                "至少补齐一个 Measure 或指标口径，并明确字段、聚合方式和业务含义。",
            )
        if "grain" in needle:
            return ("metric", "补充指标粒度", "明确指标按什么业务粒度统计，避免 Agent 汇总和下钻口径不一致。")
        if "time_dimension" in needle or "time dimension" in needle:
            return ("dimension", "补充默认时间维度", "为指标绑定默认时间维度，支持最近 7 天、昨日等时间条件。")
        if "additivity" in needle or "可加性" in message:
            return ("metric", "补充指标可加性", "声明指标是否可跨时间、学校或班级累加，避免聚合结果失真。")
        if "binding" in needle or "口径" in message:
            return ("binding", "确认可执行口径", "将业务指标绑定到可执行的 Cube Measure，并确认该绑定可被 Agent 使用。")
        if "policy" in needle or "规则" in message:
            return ("policy", "补充数据使用规则", "补齐该语义资产的可见范围和使用限制，避免发布后被不合规调用。")
        if "evidence" in needle or "证据" in message:
            return ("evidence", "补充可信证据", "补充或更新业务负责人、已认证模型或高可信文档证据后再确认发布。")
        return ("repair", f"处理阻断项：{message}", "先修复该阻断项，再进入确认、保存草稿和发布链路。")

    def _safe_fragment(self, value: str) -> str:
        fragment = "".join(ch if ch.isalnum() else "_" for ch in value).strip("_")
        return fragment or "issue"

    def _gap_validation(self, proposal: ModelingProposal) -> Dict[str, Any]:
        checks: List[Dict[str, Any]] = []
        for issue in proposal.validation_matrix.get("blockers") or []:
            checks.append(self._validation_check(issue, "failed"))
        for issue in proposal.validation_matrix.get("warnings") or []:
            checks.append(self._validation_check(issue, "needs_confirmation"))
        for issue in proposal.validation_matrix.get("infos") or []:
            checks.append(self._validation_check(issue, "passed"))

        for reason in proposal.runtime_consumption_result.get("reasons") or []:
            checks.append(
                {
                    "id": f"runtime_{reason}",
                    "status": "needs_confirmation",
                    "title": self._reason_title(str(reason)),
                    "description": "发布前该项会影响语义中心发布快照的消费者验证，确认后仍需走保存和发布链路。",
                    "technical_hint": str(reason),
                }
            )

        if not checks:
            if proposal.status in {"validated", "approved", "applied", "published"}:
                checks.append(
                    {
                        "id": "validation_passed",
                        "status": "passed",
                        "title": "语义校验通过",
                        "description": "未发现阻断项，可以继续确认变更。",
                        "technical_hint": "validation_matrix.empty",
                    }
                )
            else:
                checks.append(
                    {
                        "id": "validation_pending",
                        "status": "needs_confirmation",
                        "title": "等待校验",
                        "description": "生成补齐建议后会运行语义校验。",
                        "technical_hint": "validation.pending",
                    }
                )
        return {"summary": self._validation_summary(checks), "checks": checks}

    def _validation_check(self, issue: Dict[str, Any], status: str) -> Dict[str, Any]:
        code = str(issue.get("code") or issue.get("path") or "validation_issue")
        return {
            "id": code,
            "status": status,
            "title": str(issue.get("message") or code),
            "description": "来自现有 ModelingProposal 校验矩阵。",
            "technical_hint": str(issue.get("path") or code),
        }

    def _gap_technical_change(self, proposal: ModelingProposal) -> Dict[str, Any]:
        changed_objects = [
            {
                "type": item["type"],
                "name": item.get("technical_name") or item["title"],
                "operation": "create" if proposal.source_mode == "agent_led" else "update",
            }
            for item in self._gap_patch_plan(proposal)
            if item["type"] != "pending"
        ]
        return {
            "changed_objects": changed_objects,
            "yaml_diff": json.dumps(proposal.semantic_diff or proposal.drafts or {}, ensure_ascii=False, indent=2),
            "sql_validation": "由现有 ModelingProposal 校验矩阵执行，不生成独立 SQL 审批脚本。",
            "impact_summary": self._impact_summary(proposal),
            "approval_wording": "变更确认",
        }

    def _gap_primary_action(self, proposal: ModelingProposal) -> Dict[str, Any]:
        mapping = {
            "created": ("生成补齐建议", "draft", False, "primary"),
            "drafted": ("运行校验", "validate", False, "primary"),
            "validated": ("确认变更", "approve", False, "primary"),
            "approved": ("保存语义草稿", "apply", False, "primary"),
            "applied": ("发布到语义层", "publish", False, "primary"),
            "published": ("已发布", "none", True, "success"),
            "blocked": ("查看失败原因", "inspect_failure", False, "danger"),
            "closed": ("去问数", "open_query", False, "neutral"),
        }
        label, action, disabled, tone = mapping.get(proposal.status, ("继续", "none", True, "neutral"))
        if proposal.close_reason == "reused_existing":
            label, action, disabled, tone = ("去问数", "open_query", False, "success")
        return {"label": label, "action": action, "disabled": disabled, "tone": tone}

    def _impact_summary(self, proposal: ModelingProposal) -> List[str]:
        result = []
        if proposal.runtime_consumption_result.get("canonical_ready") is True:
            result.append("发布后可进入正式 Agent 问数链路")
        else:
            result.append("不会默认进入正式运行时，需完成保存和发布")
        blockers = proposal.validation_matrix.get("blockers") or []
        if blockers:
            result.append(f"{len(blockers)} 个阻断项需要先修复")
        return result

    def _validation_summary(self, checks: List[Dict[str, Any]]) -> str:
        passed = sum(1 for item in checks if item["status"] == "passed")
        failed = sum(1 for item in checks if item["status"] == "failed")
        pending = sum(1 for item in checks if item["status"] == "needs_confirmation")
        if failed:
            return f"{passed} 项通过，{failed} 项失败"
        if pending:
            return f"{passed} 项通过，{pending} 项待确认"
        return f"{passed} 项通过，可以确认变更"

    def _source_label(self, source_kind: Any) -> str:
        return {
            "business_question": "业务问题",
            "physical_table": "物理表",
            "dataset": "数据集",
            "datasource": "数据源",
            "semantic_gap": "未命中 Trace",
        }.get(str(source_kind or ""), str(source_kind or "业务问题"))

    def _reason_title(self, reason: str) -> str:
        return {
            "binding_coverage_missing": "缺少可执行口径",
            "binding_not_approved": "执行口径尚未确认",
            "policy_missing": "缺少数据使用规则",
            "validation_blocked": "语义校验未通过",
            "cube_not_active": "发布前不可被正式 Agent 消费",
            "ontology_not_active": "业务语义尚未发布",
            "binding_not_linked": "指标未绑定执行口径",
        }.get(reason, reason)

    def _metric_title(self, subject: str, name: str) -> str:
        if subject and name.endswith("total_count"):
            return f"{subject}总数"
        if subject and name.endswith("count"):
            return f"{subject}数"
        return name

    def _sync_readiness_label(self, proposal: ModelingProposal) -> None:
        coverage_decision = proposal.coverage_result.get("decision")
        if proposal.close_reason == "reused_existing" or coverage_decision == "covered":
            proposal.readiness_label = "Covered by Existing Semantics"
            return
        if proposal.runtime_consumption_result.get("canonical_ready") is True:
            proposal.readiness_label = "Can Publish"
            return
        blockers = proposal.validation_matrix.get("blockers") or []
        if proposal.status in {"blocked", "rejected"} or blockers:
            proposal.readiness_label = "Blocked"
            return
        proposal.readiness_label = "Save Draft Only"

    def _source_patch(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        patch = {
            key: deepcopy(payload[key])
            for key in (
                "candidate_id",
                "asset_id",
                "source_kind",
                "source_id",
                "dataset_id",
                "database",
                "schema",
                "table",
            )
            if payload.get(key) not in (None, "")
        }
        if not patch:
            raise ValueError("Source confirmation requires at least one source field")
        return patch

    def _next_spec(self, proposal: ModelingProposal, payload: Dict[str, Any]) -> Dict[str, Any]:
        if "spec" in payload:
            next_spec = deepcopy(payload.get("spec") or {})
        else:
            next_spec = deepcopy(proposal.spec or {})
            for key in self._spec_update_keys(payload):
                current = next_spec.get(key)
                value = payload.get(key)
                if isinstance(current, dict) and isinstance(value, dict):
                    next_spec[key] = self._deep_merge(current, value)
                else:
                    next_spec[key] = deepcopy(value)
        if proposal.source_mode == "agent_led":
            next_spec = repair_modeling_spec(
                next_spec,
                user_goal=str(proposal.intent.get("user_question") or ""),
                source_mode=proposal.source_mode,
            )
        return next_spec

    def _spec_update_keys(self, payload: Dict[str, Any]) -> List[str]:
        return [
            key
            for key in (
                "spec",
                "source",
                "business",
                "cube",
                "ontology",
                "binding",
                "policy",
                "governance",
                "evidence_pack",
            )
            if key in payload
        ]

    def _bump_revision(self, proposal: ModelingProposal) -> None:
        proposal.proposal_revision_no += 1
        proposal.approved_proposal_revision_no = None
        proposal.applied_proposal_revision_no = None
        proposal.approved_spec_hash = None
        proposal.applied_spec_hash = None
        for key in (
            "approved_spec",
            "approved_semantic_diff",
            "approved_spec_hash",
            "applied_spec_hash",
            "publish_scope_hash",
        ):
            proposal.audit_snapshot.pop(key, None)

    def _deep_merge(self, base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
        merged = deepcopy(base)
        for key, value in patch.items():
            if isinstance(merged.get(key), dict) and isinstance(value, dict):
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = deepcopy(value)
        return merged

    def _mark_transition(self, proposal: ModelingProposal, *, actor: str) -> None:
        proposal.last_transition_actor = actor
        proposal.last_transition_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        self._sync_readiness_label(proposal)

    def _proposal_action_key(
        self,
        proposal: ModelingProposal,
        action: str,
        checksum: str,
    ) -> str:
        return f"{proposal.id}:{proposal.proposal_revision_no}:{action}:{checksum}"

    def _stable_hash(self, value: Dict[str, Any]) -> str:
        payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()
