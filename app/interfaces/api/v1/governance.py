"""治理与审计 API。"""
from __future__ import annotations

from typing import Any

from flask import Blueprint, current_app, request

from app.extensions import db
from app.infrastructure.gateway.telemetry_client import GatewayTelemetryClient, GatewayTelemetryError
from app.infrastructure.governance.repositories import SqlAccessGovernanceRepository
from app.interfaces.api.middleware.auth import require_access_roles, require_auth
from app.shared.response import bad_request, created, not_found, success


GOVERNANCE_READ_ROLES = ("viewer", "auditor", "governance_admin", "platform_admin")
GOVERNANCE_WRITE_ROLES = ("governance_admin", "platform_admin")


def create_governance_blueprint(audit_repository):
    bp = Blueprint("governance", __name__, url_prefix="/api/v1/governance")

    def _access_repo() -> SqlAccessGovernanceRepository:
        return SqlAccessGovernanceRepository(db.session)

    def _json() -> dict[str, Any]:
        return request.get_json(silent=True) or {}

    def _gateway_client() -> GatewayTelemetryClient:
        base_url = current_app.config.get("QUERY_GATEWAY_BASE_URL") or "http://dw-query-gateway:8000"
        token = current_app.config.get("QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN")
        timeout = int(current_app.config.get("QUERY_GATEWAY_TIMEOUT_SECONDS") or 5)
        if not token:
            raise GatewayTelemetryError("未配置 QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN")
        return GatewayTelemetryClient(
            base_url=base_url,
            platform_service_token=token,
            timeout_seconds=timeout,
        )

    def _profile_to_dict(row) -> dict[str, Any]:
        return {
            "profile_code": row.profile_code,
            "name": row.name,
            "description": row.description,
            "credential_mode": row.credential_mode,
            "data_level": row.data_level,
            "allowed_operations": list(row.allowed_operations or []),
            "max_rows": row.max_rows,
            "timeout_seconds": row.timeout_seconds,
            "export_allowed": bool(row.export_allowed),
            "requires_strong_audit": bool(row.requires_strong_audit),
            "status": row.status,
        }

    def _policy_to_dict(row) -> dict[str, Any]:
        return {
            "policy_code": row.policy_code,
            "name": row.name,
            "description": row.description,
            "status": row.status,
            "priority": int(row.priority or 0),
            "subject_roles": list(row.subject_roles or []),
            "resource_scope": dict(row.resource_scope or {}),
            "actions": list(row.actions or []),
            "effect": row.effect,
            "execution_profile_code": row.execution_profile_code,
            "reason": row.reason,
            "policy_version": row.policy_version,
            "policy_epoch": int(row.policy_epoch or 1),
        }

    def _validate_profile_payload(body: dict[str, Any]) -> tuple[bool, str | None]:
        if "credential_ref" in body and body.get("credential_ref"):
            return False, "data-platform 不保存真实 RAM 凭据，请在 dw-query-gateway CredentialBinding 中配置"
        if body.get("credential_mode") in {"ram_role", "ram_user"}:
            return False, "RAM Role/User 绑定属于 dw-query-gateway CredentialBinding，请使用 gateway_binding 执行模式"
        return True, None

    def _validate_policy_payload(body: dict[str, Any]) -> tuple[bool, str | None]:
        if body.get("effect") and body.get("effect") not in {"allow", "deny"}:
            return False, "effect 仅支持 allow / deny；M3 治理阻断由默认规则承接"
        blocked = {"approval_policy_code", "row_scope", "column_scope"}
        if blocked & set(body):
            return False, "第一版不在 DataPolicy 中配置审批、行级或列级规则"
        return True, None

    @bp.get("/execution-profiles")
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def list_execution_profiles():
        rows = _access_repo().list_execution_profiles(
            status=request.args.get("status") or None,
            data_level=request.args.get("data_level") or None,
        )
        return success({"items": [_profile_to_dict(row) for row in rows], "total": len(rows)})

    @bp.post("/execution-profiles")
    @require_access_roles(*GOVERNANCE_WRITE_ROLES)
    def create_execution_profile():
        body = _json()
        valid, error = _validate_profile_payload(body)
        if not valid:
            return bad_request(error or "无效执行方式")
        missing = [key for key in ("profile_code", "name", "credential_mode") if not body.get(key)]
        if missing:
            return bad_request(f"缺少必填字段: {', '.join(missing)}")
        row = _access_repo().upsert_execution_profile(body)
        db.session.commit()
        return created(_profile_to_dict(row), message="执行方式已保存")

    @bp.patch("/execution-profiles/<profile_code>")
    @require_access_roles(*GOVERNANCE_WRITE_ROLES)
    def patch_execution_profile(profile_code: str):
        body = _json()
        valid, error = _validate_profile_payload(body)
        if not valid:
            return bad_request(error or "无效执行方式")
        body["profile_code"] = profile_code
        existing = _access_repo().get_execution_profile(profile_code)
        if existing is None:
            return not_found("执行方式不存在")
        row = _access_repo().upsert_execution_profile(body)
        db.session.commit()
        return success(_profile_to_dict(row), message="执行方式已更新")

    @bp.get("/data-policies")
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def list_data_policies():
        rows = _access_repo().list_data_policies(
            status=request.args.get("status") or None,
            data_level=request.args.get("data_level") or None,
            q=request.args.get("q") or None,
        )
        return success({"items": [_policy_to_dict(row) for row in rows], "total": len(rows)})

    @bp.post("/data-policies")
    @require_access_roles(*GOVERNANCE_WRITE_ROLES)
    def create_data_policy():
        body = _json()
        valid, error = _validate_policy_payload(body)
        if not valid:
            return bad_request(error or "无效策略")
        missing = [key for key in ("policy_code", "name") if not body.get(key)]
        if missing:
            return bad_request(f"缺少必填字段: {', '.join(missing)}")
        row = _access_repo().upsert_data_policy(body)
        db.session.commit()
        return created(_policy_to_dict(row), message="数据访问规则已保存")

    @bp.patch("/data-policies/<policy_code>")
    @require_access_roles(*GOVERNANCE_WRITE_ROLES)
    def patch_data_policy(policy_code: str):
        body = _json()
        valid, error = _validate_policy_payload(body)
        if not valid:
            return bad_request(error or "无效策略")
        body["policy_code"] = policy_code
        existing = _access_repo().get_data_policy(policy_code)
        if existing is None:
            return not_found("数据访问规则不存在")
        row = _access_repo().upsert_data_policy(body)
        db.session.commit()
        return success(_policy_to_dict(row), message="数据访问规则已更新")

    @bp.get("/rule-summary")
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def get_rule_summary():
        rows = _access_repo().list_data_policies()
        return success(
            {
                "items": [_policy_to_dict(row) for row in rows],
                "total": len(rows),
                "product_model": "permission_packages_and_default_rules",
            }
        )

    @bp.get("/policy-decisions")
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def list_policy_decisions():
        limit = request.args.get("limit", 50, type=int)
        items = _access_repo().list_policy_decisions(
            principal_id=request.args.get("principal_id") or None,
            decision=request.args.get("decision") or None,
            data_level=request.args.get("data_level") or None,
            policy_code=request.args.get("policy_code") or None,
            limit=limit,
        )
        return success({"items": items, "total": len(items)})

    @bp.get("/gateway/summary")
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def get_gateway_summary():
        try:
            return success(_gateway_client().get_summary())
        except GatewayTelemetryError as exc:
            return bad_request(str(exc))

    @bp.get("/gateway/query-runs")
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def list_gateway_query_runs():
        try:
            limit = request.args.get("limit", 50, type=int)
            limit = min(max(int(limit or 50), 1), 200)
            return success(_gateway_client().list_query_runs(limit=limit))
        except GatewayTelemetryError as exc:
            return bad_request(str(exc))

    @bp.route("/audit-traces", methods=["GET"])
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def list_audit_traces():
        policy_name = (request.args.get("policy") or "").strip()
        target_type = (request.args.get("target_type") or "").strip() or None
        target_name = (request.args.get("target_name") or "").strip() or None
        decision = (request.args.get("decision") or "").strip() or None
        route_type = (request.args.get("route_type") or "").strip() or None
        principal_id = (request.args.get("principal_id") or "").strip() or None
        semantic_plan_id = (request.args.get("semantic_plan_id") or "").strip() or None
        sql_hash = (request.args.get("sql_hash") or "").strip() or None
        filters = {
            "policy_name": policy_name or None,
            "target_type": target_type,
            "target_name": target_name,
            "decision": decision,
            "route_type": route_type,
            "principal_id": principal_id,
            "semantic_plan_id": semantic_plan_id,
            "sql_hash": sql_hash,
        }
        filters = {key: value for key, value in filters.items() if value}
        if filters:
            items = audit_repository.list_filtered(**filters)
        else:
            items = audit_repository.list_all()
        return success(
            data={
                "items": [item.model_dump(mode="json") for item in items],
                "total": len(items),
            }
        )

    @bp.route("/audit-traces/<trace_id>", methods=["GET"])
    @require_access_roles(*GOVERNANCE_READ_ROLES)
    def get_audit_trace(trace_id: str):
        trace = audit_repository.get(trace_id)
        if trace is None:
            return not_found("未找到审计记录")
        return success(data=trace.model_dump(mode="json"))

    return bp
