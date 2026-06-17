"""建模 Copilot 服务共享基类。

持有会话仓储、runtime、工具与 Proposal 服务等依赖，并提供
会话持久化、状态机同步、spec 水合等跨服务共享的辅助逻辑。
"""
from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any, Dict, Optional

from app.application.semantic.modeling_copilot_tools import ModelingToolRegistry
from app.application.semantic.modeling_spec_repair import has_reviewable_spec, repair_modeling_spec
from app.application.semantic.source_candidate_scoring import SourceCandidateScoringConfig
from app.domain.ontology.entities import measure_ref_strings
from app.domain.semantic.copilot_state import CopilotSessionState, derive_session_state
from app.domain.semantic.modeling_agent_session import AgentSession
from app.domain.semantic.ports.modeling_agent_session_repository import IModelingAgentSessionRepository


class CopilotServiceBase:
    """三个 Copilot 子服务共享的依赖与会话基础设施。"""

    def __init__(
        self,
        *,
        session_repository: IModelingAgentSessionRepository,
        agent_app: Any,
        tools: ModelingToolRegistry,
        proposal_service: Any,
        source_scoring_config: Optional[SourceCandidateScoringConfig] = None,
        release_preview_service: Any | None = None,
    ):
        self._sessions = session_repository
        self._agent_app = agent_app
        self._tools = tools
        self._proposal_service = proposal_service
        self._source_scoring_config = source_scoring_config or SourceCandidateScoringConfig.default()
        self._release_preview_service = release_preview_service
        self._logger = logging.getLogger(__name__)

    # ------------------------------------------------------------------
    # 会话持久化与状态机
    # ------------------------------------------------------------------

    def _save_session(self, session: AgentSession) -> None:
        previous_state_version = session.state_version
        self._sync_session_state(session)
        expected_state_version = (
            previous_state_version if session.state_version != previous_state_version else None
        )
        self._sessions.save(session, expected_state_version=expected_state_version)

    def _sync_session_state(self, session: AgentSession) -> None:
        next_state = self._derive_session_state(session)
        if session.state != next_state:
            session.transition_state(
                next_state,
                actor="copilot_service",
                reason="workbench_state_sync",
            )

    def _derive_session_state(self, session: AgentSession) -> CopilotSessionState:
        # 状态推导权威实现在 domain copilot_state.derive_session_state。
        return derive_session_state(
            status=session.status,
            workbench_state=session.workbench_state,
            current_proposal_id=session.current_proposal_id,
            conversation_turns=len(session.conversation or []),
        )

    def _require(self, session_id: str) -> AgentSession:
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"AgentSession not found: {session_id}")
        return session

    def _authorize(self, session: AgentSession, principal_id: Optional[str]) -> None:
        # legacy（session.principal_id 为空）会话视为已登录用户共同可访问，避免历史草稿不可见。
        # service 调用方未传 principal_id 时视为可信内部/历史调用；HTTP API 会始终传当前登录 principal。
        if session.principal_id is None:
            return
        if principal_id is None:
            return
        if session.principal_id != principal_id:
            raise PermissionError(
                f"AgentSession {session.id} 属于其他用户，不能改写"
            )

    def _dump(self, session: AgentSession) -> Dict[str, Any]:
        return session.model_dump(mode="json", exclude_none=True)

    # ------------------------------------------------------------------
    # spec 水合与恢复
    # ------------------------------------------------------------------

    def _hydrate_session_spec(self, session: AgentSession) -> bool:
        """把已保存 Proposal 中的 spec 回填到 session，避免右侧工作台显示空 spec。"""
        state = deepcopy(session.workbench_state or {})
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        source_mode = str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led")
        candidate = raw_spec if has_reviewable_spec(raw_spec) else self._proposal_backed_spec(session, state)
        if not has_reviewable_spec(candidate):
            return False
        repaired = repair_modeling_spec(candidate, user_goal=session.user_goal, source_mode=source_mode)
        if raw_spec == repaired and (state.get("advanced_refs") or {}).get("spec_available") is True:
            return False

        state["raw_spec"] = repaired
        state["advanced_refs"] = {
            **(state.get("advanced_refs") or {}),
            "proposal_id": session.current_proposal_id or (state.get("advanced_refs") or {}).get("proposal_id"),
            "spec_available": True,
            "trace_available": bool(session.tool_traces),
        }
        readiness = dict(state.get("readiness") or {})
        reasons = [
            reason for reason in (readiness.get("reasons") or [])
            if reason not in {"spec_not_generated", "binding_not_approved"}
        ]
        if not state.get("required_confirmations"):
            reasons = [
                reason for reason in reasons
                if reason != "business_owner_confirmation_required"
            ]
        readiness["exploratory_ready"] = True
        readiness["canonical_ready"] = bool((state.get("publish_result") or {}).get("status") == "published")
        readiness["reasons"] = reasons or ["ready_to_save"]
        state["readiness"] = readiness
        session.workbench_state = state
        return True

    def _proposal_backed_spec(self, session: AgentSession, state: Dict[str, Any]) -> Dict[str, Any]:
        proposal_summary = state.get("proposal_summary") if isinstance(state.get("proposal_summary"), dict) else {}
        for candidate in (
            proposal_summary.get("spec"),
            ((proposal_summary.get("source_context") or {}).get("request_payload") or {}).get("embedded_spec"),
        ):
            if has_reviewable_spec(candidate):
                return deepcopy(candidate)

        proposal_id = str(
            session.current_proposal_id
            or (state.get("advanced_refs") or {}).get("proposal_id")
            or proposal_summary.get("id")
            or ""
        ).strip()
        if not proposal_id or not hasattr(self._proposal_service, "get_proposal"):
            return {}
        try:
            proposal = self._proposal_service.get_proposal(proposal_id)
        except Exception:
            return {}
        for candidate in (
            proposal.get("spec"),
            ((proposal.get("source_context") or {}).get("request_payload") or {}).get("embedded_spec"),
        ):
            if has_reviewable_spec(candidate):
                return deepcopy(candidate)
        return {}

    def _refresh_session_spec_state(self, session: AgentSession) -> bool:
        """读会话时恢复已确认但停在 spec 生成前的状态。

        旧会话可能已经清空确认项，但因为之前的状态机缺口没有写入 raw_spec。
        这里只在确认已完成、存在候选表或明确带有 spec_not_generated 阻塞时触发，
        避免刚创建的空会话被 GET 请求推进。
        """
        changed = self._hydrate_session_spec(session)
        if not self._should_resume_spec_generation(session.workbench_state):
            return changed

        state, spec_status = self._ensure_spec_after_confirmations(session, deepcopy(session.workbench_state))
        if spec_status == "generated":
            message_text = "已根据已确认口径补齐可审阅 spec。你可以继续沙盒预演，或应用语义保存 Proposal。"
            binding_hint = self._binding_suggestion_hint(state)
            if binding_hint:
                message_text = f"{message_text}\n{binding_hint}"
            state["agent_message"] = message_text
        elif spec_status == "failed":
            state["agent_message"] = "已确认口径，但 spec 生成失败。请在对话里补充源表或让 AI 建模助手重新生成。"
        elif spec_status == "missing_source":
            state["agent_message"] = "已确认口径，但还缺少可生成 spec 的源表线索。请继续补充物理表或候选数据集。"
        else:
            return changed
        session.workbench_state = state
        return True

    def _should_resume_spec_generation(self, state: Dict[str, Any]) -> bool:
        if not isinstance(state, dict):
            return False
        if state.get("required_confirmations"):
            return False
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        if has_reviewable_spec(raw_spec):
            return False
        reasons = (state.get("readiness") or {}).get("reasons") or []
        return "spec_not_generated" in reasons or bool(self._candidate_source_table(state))

    def _ensure_spec_after_confirmations(self, session: AgentSession, state: Dict[str, Any]) -> tuple[Dict[str, Any], str]:
        """最后一个口径确认后，用确定性工具补齐可审阅 spec。

        该步骤是状态机推进，不进入 LLM 对话链路；否则用户点击确认后会停在
        "等待生成 spec"，还可能因为 LLM 超时而无法继续建模。
        """
        if state.get("required_confirmations"):
            return state, "pending"

        source_mode = str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led")
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        if has_reviewable_spec(raw_spec):
            state["raw_spec"] = repair_modeling_spec(raw_spec, user_goal=session.user_goal, source_mode=source_mode)
            self._mark_spec_available(session, state)
            return state, "existing"

        table = self._candidate_source_table(state)
        source_payload = self._candidate_source_payload(state)
        proposal_patch = dict(state.get("proposal_patch") or {})
        if source_payload:
            proposal_patch.update(source_payload)
            state["proposal_patch"] = proposal_patch
            table = self._candidate_table_label(source_payload, state.get("selected_source_candidate") or {})
            proposal_patch.setdefault("candidate_table", table)
        elif table:
            proposal_patch.setdefault("candidate_table", table)
            proposal_patch.setdefault("table", table)
            state["proposal_patch"] = proposal_patch
        elif str(proposal_patch.get("source_kind") or "business_question") == "business_question":
            self._mark_spec_missing(state, "need_source_table")
            state["suggested_actions"] = ["continue_modeling"]
            return state, "missing_source"

        args: Dict[str, Any] = {"source_mode": source_mode}
        if source_payload:
            args.update(source_payload)
        elif table:
            args["table"] = table
        context_session = session.model_dump(mode="json")
        context_session["workbench_state"] = state
        try:
            draft = self._tools.execute(
                "generate_semantic_draft",
                args,
                {"session": context_session, "request_payload": {"trigger": "confirmation_completed"}},
            )
        except Exception as exc:
            draft = {"error": str(exc)}

        if draft.get("error"):
            self._append_tool_trace(
                session,
                {
                    "tool": "generate_semantic_draft",
                    "status": "failed",
                    "summary": str(draft.get("error") or "spec 生成失败"),
                    "table": table,
                },
            )
            self._mark_spec_missing(state, "spec_not_generated")
            state["suggested_actions"] = ["continue_modeling"]
            return state, "failed"

        spec = draft.get("spec") if isinstance(draft, dict) else {}
        repaired = repair_modeling_spec(
            spec if isinstance(spec, dict) else {},
            user_goal=session.user_goal,
            source_mode=source_mode,
        )
        if not has_reviewable_spec(repaired):
            self._append_tool_trace(
                session,
                {
                    "tool": "generate_semantic_draft",
                    "status": "failed",
                    "summary": "工具没有返回可审阅 spec",
                    "table": table,
                },
            )
            self._mark_spec_missing(state, "spec_not_generated")
            state["suggested_actions"] = ["continue_modeling"]
            return state, "failed"

        state["raw_spec"] = repaired
        state["semantic_canvas"] = self._semantic_canvas_from_spec(repaired, state.get("semantic_canvas") or {})
        self._mark_spec_available(session, state, table=table)
        state["suggested_actions"] = ["run_sandbox", "save_proposal"]
        self._append_tool_trace(
            session,
            {
                "tool": "generate_semantic_draft",
                "status": "completed",
                "summary": draft.get("summary") or "已生成可审阅 spec",
                "table": table,
            },
        )
        self._attach_bindable_object_suggestions(session, state, repaired)
        return state, "generated"

    def _attach_bindable_object_suggestions(
        self,
        session: AgentSession,
        state: Dict[str, Any],
        spec: Dict[str, Any],
    ) -> None:
        """来源确认生成 spec 后，推荐该 cube 可绑定的已有 object，避免重复建对象。"""
        cube = spec.get("cube") if isinstance(spec.get("cube"), dict) else {}
        if not cube:
            return
        subject = str((spec.get("business") or {}).get("subject") or "")
        try:
            result = self._tools.execute(
                "recommend_bindable_objects",
                {"cube": cube, "subject": subject},
                {"session": session.model_dump(mode="json")},
            )
        except Exception:
            return
        if not isinstance(result, dict) or result.get("error"):
            return
        suggestions = [
            item for item in (result.get("suggestions") or []) if isinstance(item, dict)
        ]
        state["bindable_object_suggestions"] = suggestions
        if not suggestions:
            return
        self._append_tool_trace(
            session,
            {
                "tool": "recommend_bindable_objects",
                "status": "completed",
                "summary": str(result.get("summary") or f"找到 {len(suggestions)} 个可绑定的已有业务对象"),
            },
        )
    @staticmethod
    def _binding_suggestion_hint(state: Dict[str, Any]) -> Optional[str]:
        suggestions = [
            item for item in (state.get("bindable_object_suggestions") or []) if isinstance(item, dict)
        ]
        if not suggestions:
            return None
        names = ", ".join(
            str(item.get("title") or item.get("object_name") or "") for item in suggestions[:3]
        )
        return f"提示：检测到已有业务对象（{names}）可能与本次建模对象相同，可以直接绑定该 cube，避免重复建对象。"

    # ------------------------------------------------------------------
    # 候选来源
    # ------------------------------------------------------------------

    def _candidate_source_table(self, state: Dict[str, Any]) -> Optional[str]:
        proposal_patch = state.get("proposal_patch") if isinstance(state.get("proposal_patch"), dict) else {}
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        source = raw_spec.get("source") if isinstance(raw_spec.get("source"), dict) else {}
        cube = raw_spec.get("cube") if isinstance(raw_spec.get("cube"), dict) else {}
        for value in (
            proposal_patch.get("candidate_table"),
            proposal_patch.get("table"),
            proposal_patch.get("candidate_source_table"),
            source.get("table") if isinstance(source, dict) else None,
            cube.get("source") if isinstance(cube, dict) else None,
        ):
            text = str(value or "").strip()
            if text:
                return text
        return None

    def _candidate_source_payload(self, state: Dict[str, Any]) -> Dict[str, Any]:
        proposal_patch = state.get("proposal_patch") if isinstance(state.get("proposal_patch"), dict) else {}
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        source = raw_spec.get("source") if isinstance(raw_spec.get("source"), dict) else {}
        for payload in (proposal_patch, source):
            source_kind = str(payload.get("source_kind") or "").strip()
            if source_kind == "dataset" and payload.get("dataset_id"):
                return {
                    "source_kind": "dataset",
                    "dataset_id": payload.get("dataset_id"),
                    "source_id": payload.get("source_id"),
                    "database": payload.get("database"),
                    "schema": payload.get("schema"),
                    "table": payload.get("table"),
                    **({"asset_ref": deepcopy(payload["asset_ref"])} if isinstance(payload.get("asset_ref"), dict) else {}),
                    **({"evidence_bundle": deepcopy(payload["evidence_bundle"])} if isinstance(payload.get("evidence_bundle"), dict) else {}),
                }
            if source_kind == "physical_table" and payload.get("table"):
                return {
                    "source_kind": "physical_table",
                    "source_id": payload.get("source_id"),
                    "database": payload.get("database"),
                    "schema": payload.get("schema"),
                    "table": payload.get("table"),
                    **({"asset_ref": deepcopy(payload["asset_ref"])} if isinstance(payload.get("asset_ref"), dict) else {}),
                    **({"evidence_bundle": deepcopy(payload["evidence_bundle"])} if isinstance(payload.get("evidence_bundle"), dict) else {}),
                }
        return {}

    @staticmethod
    def _pick_source_candidate(
        candidates: list[Dict[str, Any]],
        candidate_id: str,
        message: str,
    ) -> Optional[Dict[str, Any]]:
        if candidate_id:
            for item in candidates:
                if str(item.get("id") or "") == candidate_id:
                    return item
        lowered = message.lower()
        for item in candidates:
            for key in ("name", "table", "title"):
                text = str(item.get(key) or "").lower()
                if text and text in lowered:
                    return item
        return candidates[0] if len(candidates) == 1 else None

    @staticmethod
    def _source_payload_from_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
        source_kind = str(candidate.get("source_kind") or "").strip()
        extra_payload: Dict[str, Any] = {}
        if isinstance(candidate.get("asset_ref"), dict):
            extra_payload["asset_ref"] = deepcopy(candidate["asset_ref"])
        if isinstance(candidate.get("evidence_bundle"), dict):
            extra_payload["evidence_bundle"] = deepcopy(candidate["evidence_bundle"])
        if source_kind == "dataset" and candidate.get("dataset_id"):
            return {
                "source_kind": "dataset",
                "dataset_id": candidate.get("dataset_id"),
                "source_id": candidate.get("source_id"),
                "database": candidate.get("database"),
                "schema": candidate.get("schema"),
                "table": candidate.get("table"),
                **extra_payload,
            }
        if source_kind == "physical_table" and candidate.get("table"):
            return {
                "source_kind": "physical_table",
                "source_id": candidate.get("source_id"),
                "database": candidate.get("database"),
                "schema": candidate.get("schema"),
                "table": candidate.get("table"),
                **extra_payload,
            }
        return {}

    @staticmethod
    def _candidate_table_label(source_payload: Dict[str, Any], candidate: Dict[str, Any]) -> str:
        if candidate.get("name"):
            return str(candidate.get("name"))
        database = str(source_payload.get("database") or "").strip()
        table = str(source_payload.get("table") or "").strip()
        if database and table:
            return f"{database}.{table}"
        return table or str(source_payload.get("dataset_id") or "")

    # ------------------------------------------------------------------
    # readiness / trace / canvas
    # ------------------------------------------------------------------

    def _mark_spec_available(self, session: AgentSession, state: Dict[str, Any], *, table: Optional[str] = None) -> None:
        readiness = dict(state.get("readiness") or {})
        readiness["exploratory_ready"] = True
        readiness["canonical_ready"] = bool((state.get("publish_result") or {}).get("status") == "published")
        readiness["reasons"] = [
            reason for reason in (readiness.get("reasons") or [])
            if reason not in {
                "business_owner_confirmation_required",
                "spec_not_generated",
                "source_candidate_confirmation_required",
                "binding_not_approved",
                "need_source_table",
                "session_created",
            }
        ] or ["ready_to_save"]
        state["readiness"] = readiness
        refs = {
            **(state.get("advanced_refs") or {}),
            "proposal_id": session.current_proposal_id or (state.get("advanced_refs") or {}).get("proposal_id"),
            "spec_available": True,
            "trace_available": bool(session.tool_traces) or True,
        }
        candidate_table = table or self._candidate_source_table(state)
        if candidate_table:
            refs["candidate_source_table"] = candidate_table
        state["advanced_refs"] = refs

    def _mark_spec_missing(self, state: Dict[str, Any], reason: str) -> None:
        readiness = dict(state.get("readiness") or {})
        readiness["exploratory_ready"] = False
        reasons = [
            str(item) for item in (readiness.get("reasons") or [])
            if item not in {"ready_to_save", "session_created"}
        ]
        if "spec_not_generated" not in reasons:
            reasons.append("spec_not_generated")
        if reason and reason not in reasons:
            reasons.append(reason)
        readiness["reasons"] = reasons
        state["readiness"] = readiness
        state["advanced_refs"] = {
            **(state.get("advanced_refs") or {}),
            "spec_available": False,
        }

    def _append_tool_trace(self, session: AgentSession, trace: Dict[str, Any]) -> None:
        if session.tool_traces and session.tool_traces[-1] == trace:
            return
        session.tool_traces.append(trace)

    def _semantic_canvas_from_spec(self, spec: Dict[str, Any], existing: Dict[str, Any]) -> Dict[str, Any]:
        canvas = deepcopy(existing) if isinstance(existing, dict) else {}
        cube = spec.get("cube") if isinstance(spec.get("cube"), dict) else {}
        ontology = spec.get("ontology") if isinstance(spec.get("ontology"), dict) else {}

        object_payload = ontology.get("object") if isinstance(ontology.get("object"), dict) else None
        metrics = ontology.get("metrics") if isinstance(ontology.get("metrics"), list) else None
        dimensions_payload = cube.get("dimensions") if isinstance(cube.get("dimensions"), dict) else {}
        dimensions = [
            {"name": name, **(payload if isinstance(payload, dict) else {})}
            for name, payload in dimensions_payload.items()
        ]
        bindings = []
        for metric in metrics or []:
            if not isinstance(metric, dict):
                continue
            for ref in measure_ref_strings(metric.get("measure_refs")):
                bindings.append({
                    "metric": metric.get("name"),
                    "measure_ref": ref,
                    "status": metric.get("binding_status") or "approved",
                })

        return {
            "objects": [object_payload] if object_payload else (canvas.get("objects") or []),
            "metrics": metrics or (canvas.get("metrics") or []),
            "dimensions": dimensions or (canvas.get("dimensions") or []),
            "bindings": bindings or (canvas.get("bindings") or []),
            "policies": ontology.get("policies") or (canvas.get("policies") or []),
        }

    def _has_reviewable_spec(self, raw_spec: Any) -> bool:
        return has_reviewable_spec(raw_spec)

    def _deep_merge(self, base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
        merged = deepcopy(base)
        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = deepcopy(value)
        return merged
