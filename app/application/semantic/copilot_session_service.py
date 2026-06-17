"""建模 Copilot 会话生命周期服务：创建、读取、列表、删除、重命名。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional
from uuid import uuid4

from app.application.semantic.copilot_service_base import CopilotServiceBase
from app.domain.semantic.modeling_agent_session import AgentSession


class CopilotSessionService(CopilotServiceBase):
    """会话 CRUD 与 principal 鉴权边界。"""

    def create_session(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        user_goal = str(
            payload.get("user_goal")
            or payload.get("goal")
            or payload.get("message")
            or payload.get("user_question")
            or ""
        ).strip()
        if not user_goal:
            raise ValueError("缺少必填字段: user_goal")
        entry_type = str(payload.get("entry_type") or self._infer_entry_type(payload))
        if entry_type not in {"table_known", "business_question", "semantic_gap"}:
            entry_type = "business_question"
        principal_id = payload.get("principal_id")
        principal_id = str(principal_id).strip() if principal_id else None
        title = payload.get("title")
        title = str(title).strip() if title else None
        workbench_state = self._initial_workbench_state(user_goal, entry_type)
        workbench_context = self._normalize_workbench_context(payload.get("workbench_context"))
        if workbench_context:
            entry_type = "table_known"
            workbench_state = self._seed_workbench_context(
                workbench_state,
                user_goal=user_goal,
                context=workbench_context,
            )
        session = AgentSession(
            id=str(payload.get("id") or f"modeling_session_{uuid4().hex}"),
            user_goal=user_goal,
            entry_type=entry_type,  # type: ignore[arg-type]
            principal_id=principal_id,
            title=title,
            workbench_state=workbench_state,
        )
        session.add_message(role="user", content=user_goal)
        session.record_event(
            "session_action",
            actor=principal_id,
            action="create_session",
            payload={"entry_type": entry_type},
        )
        self._save_session(session)
        return self._dump(session)

    def get_session(
        self,
        session_id: str,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self._require(session_id)
        self._authorize(session, principal_id)
        if self._refresh_session_spec_state(session):
            self._save_session(session)
        return self._dump(session)

    def list_sessions(
        self,
        principal_id: Optional[str] = None,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        include_legacy: bool = True,
    ) -> Dict[str, Any]:
        """列出会话。详细语义见仓储端口注释。"""
        items = self._sessions.list(
            principal_id=principal_id,
            limit=limit,
            offset=offset,
            status=status,
            include_legacy=include_legacy,
        )
        return {
            "items": [self._dump(s) for s in items],
            "total": len(items),
            "limit": limit,
            "offset": offset,
        }

    def delete_session(self, session_id: str, *, principal_id: Optional[str] = None) -> Dict[str, Any]:
        session = self._sessions.get(session_id)
        if session is None:
            return {"deleted": False, "id": session_id}
        self._authorize(session, principal_id)
        self._sessions.delete(session_id)
        return {"deleted": True, "id": session_id}

    def rename_session(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        title = payload.get("title")
        if title is None:
            raise ValueError("缺少必填字段: title")
        session = self._require(session_id)
        self._authorize(session, principal_id)
        normalized = str(title).strip()
        updated = self._sessions.update_metadata(session_id, title=normalized or None)
        if updated is None:
            raise ValueError(f"AgentSession not found: {session_id}")
        return self._dump(updated)

    # ------------------------------------------------------------------
    # 创建会话辅助
    # ------------------------------------------------------------------

    def _infer_entry_type(self, payload: Dict[str, Any]) -> str:
        if payload.get("miss_trace_id"):
            return "semantic_gap"
        if payload.get("table") or payload.get("source_id") or payload.get("dataset_id"):
            return "table_known"
        return "business_question"

    def _initial_workbench_state(self, user_goal: str, entry_type: str) -> Dict[str, Any]:
        return {
            "agent_message": "我会先理解建模目标，并检索已有 Ontology、Cube、Binding 与候选数据资产。",
            "semantic_canvas": {"objects": [], "metrics": [], "dimensions": [], "bindings": [], "policies": []},
            "candidate_cards": [],
            "required_confirmations": [],
            "evidence_summary": [],
            "validation_summary": [],
            "readiness": {"canonical_ready": False, "exploratory_ready": False, "reasons": ["session_created"]},
            "suggested_actions": ["send_goal"],
            "proposal_summary": {},
            "proposal_patch": {
                "source_mode": "agent_led" if entry_type != "table_known" else "human_led",
                "user_question": user_goal,
            },
            "advanced_refs": {"proposal_id": None, "spec_available": False, "trace_available": False},
        }

    def _normalize_workbench_context(self, value: Any) -> Dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        source = str(value.get("source") or value.get("table") or "").strip()
        if not source:
            return {}
        target = str(value.get("target") or "semantic_center").strip()
        if target and target != "semantic_center":
            return {}
        evidence = value.get("evidence")
        modeling_source = value.get("modelingSource") or value.get("modeling_source")
        return {
            "workbench_mode": str(value.get("workbenchMode") or value.get("workbench_mode") or "").strip(),
            "project_id": str(value.get("projectId") or value.get("project_id") or "").strip(),
            "candidate_id": str(value.get("candidateId") or value.get("candidate_id") or "").strip(),
            "candidate_title": str(value.get("candidateTitle") or value.get("candidate_title") or "").strip(),
            "source": source,
            "grain": str(value.get("grain") or "").strip(),
            "risk": str(value.get("risk") or "medium").strip(),
            "evidence": [str(item) for item in evidence if item is not None] if isinstance(evidence, list) else [],
            "modeling_source": deepcopy(modeling_source) if isinstance(modeling_source, dict) else {},
            "target": "semantic_center",
        }

    def _seed_workbench_context(
        self,
        state: Dict[str, Any],
        *,
        user_goal: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        next_state = deepcopy(state)
        source = str(context.get("source") or "").strip()
        database, table = self._split_source_name(source)
        modeling_source = context.get("modeling_source") if isinstance(context.get("modeling_source"), dict) else {}
        source_table = str(modeling_source.get("table") or table or source).strip()
        source_database = modeling_source.get("database") if modeling_source.get("database") is not None else database
        source_schema = modeling_source.get("schema")
        candidate_id = str(context.get("candidate_id") or table or source).strip()
        candidate = {
            "id": f"workbench:{candidate_id or table or source}",
            "asset_type": "workbench_candidate",
            "source_kind": str(modeling_source.get("source_kind") or "physical_table"),
            "source_id": modeling_source.get("source_id"),
            "database": source_database,
            "schema": source_schema,
            "table": source_table,
            "name": source,
            "title": str(modeling_source.get("title") or context.get("candidate_title") or source),
            "confidence": "medium",
            "risk": str(context.get("risk") or "medium"),
            "evidence": context.get("evidence") or [],
            "workbench_context": context,
        }
        if isinstance(modeling_source.get("asset_ref"), dict):
            candidate["asset_ref"] = deepcopy(modeling_source["asset_ref"])
        if isinstance(modeling_source.get("evidence_bundle"), dict):
            candidate["evidence_bundle"] = deepcopy(modeling_source["evidence_bundle"])
        next_state["source_candidates"] = [candidate]
        next_state["agent_message"] = (
            f"已从语义建设工作台带入候选来源 {source}。请确认来源后生成可审阅 spec。"
        )
        next_state["readiness"] = {
            "canonical_ready": False,
            "exploratory_ready": False,
            "reasons": ["source_candidate_confirmation_required", "spec_not_generated"],
        }
        next_state["suggested_actions"] = ["confirm_source_candidate"]
        next_state["proposal_patch"] = {
            **(next_state.get("proposal_patch") or {}),
            "source_mode": "agent_led",
            "user_question": user_goal,
            "candidate_source_table": source,
            "candidate_table": source,
            "table": source_table,
            "database": source_database,
            "schema": source_schema,
            "source_id": modeling_source.get("source_id"),
            "source_kind": str(modeling_source.get("source_kind") or "physical_table"),
            **({"asset_ref": deepcopy(modeling_source["asset_ref"])} if isinstance(modeling_source.get("asset_ref"), dict) else {}),
            **({"evidence_bundle": deepcopy(modeling_source["evidence_bundle"])} if isinstance(modeling_source.get("evidence_bundle"), dict) else {}),
            "grain": context.get("grain"),
            "candidate_id": context.get("candidate_id"),
            "project_id": context.get("project_id"),
            "target": "semantic_center",
        }
        next_state["advanced_refs"] = {
            **(next_state.get("advanced_refs") or {}),
            "proposal_id": None,
            "spec_available": False,
            "source_candidates_available": True,
            "candidate_source_table": source,
            "workbench_context": context,
            "trace_available": True,
        }
        return next_state

    @staticmethod
    def _split_source_name(source: str) -> tuple[Optional[str], str]:
        parts = [part.strip() for part in source.split(".") if part.strip()]
        if len(parts) >= 2:
            return ".".join(parts[:-1]), parts[-1]
        return None, source
