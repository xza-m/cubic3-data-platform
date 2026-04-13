"""治理与审计 API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.shared.response import not_found, success


def create_governance_blueprint(audit_repository):
    bp = Blueprint("governance", __name__, url_prefix="/api/v1/governance")

    @bp.route("/audit-traces", methods=["GET"])
    def list_audit_traces():
        policy_name = (request.args.get("policy") or "").strip()
        target_type = (request.args.get("target_type") or "").strip() or None
        target_name = (request.args.get("target_name") or "").strip() or None
        decision = (request.args.get("decision") or "").strip() or None
        route_type = (request.args.get("route_type") or "").strip() or None
        if policy_name or target_type or target_name or decision or route_type:
            items = audit_repository.list_filtered(
                policy_name=policy_name or None,
                target_type=target_type,
                target_name=target_name,
                decision=decision,
                route_type=route_type,
            )
        else:
            items = audit_repository.list_all()
        return success(
            data={
                "items": [item.model_dump(mode="json") for item in items],
                "total": len(items),
            }
        )

    @bp.route("/audit-traces/<trace_id>", methods=["GET"])
    def get_audit_trace(trace_id: str):
        trace = audit_repository.get(trace_id)
        if trace is None:
            return not_found("未找到审计记录")
        return success(data=trace.model_dump(mode="json"))

    return bp
