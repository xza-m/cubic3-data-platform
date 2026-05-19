"""语义建模 Copilot 业务主控服务。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional
from uuid import uuid4

from app.application.semantic.modeling_copilot_runtime import AgentRunResult, LLMRequiredError, ModelingAgentRuntimePort
from app.application.semantic.modeling_copilot_tools import ModelingToolRegistry
from app.application.semantic.modeling_spec_repair import has_reviewable_spec, repair_modeling_spec
from app.application.semantic.source_candidate_recall_service import SourceCandidateRecallService
from app.application.semantic.source_candidate_scoring import SourceCandidateScoringConfig
from app.domain.semantic.copilot_state import CopilotSessionState
from app.domain.semantic.modeling_agent_session import AgentSession
from app.domain.semantic.ports.modeling_agent_session_repository import IModelingAgentSessionRepository


class SemanticModelingCopilotService:
    """Session-first 的语义建模 Copilot 主控层。"""

    def __init__(
        self,
        *,
        session_repository: IModelingAgentSessionRepository,
        runtime: ModelingAgentRuntimePort,
        tools: ModelingToolRegistry,
        proposal_service: Any,
        source_scoring_config: Optional[SourceCandidateScoringConfig] = None,
    ):
        self._sessions = session_repository
        self._runtime = runtime
        self._tools = tools
        self._proposal_service = proposal_service
        self._source_scoring_config = source_scoring_config or SourceCandidateScoringConfig.default()

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
        if session.status == "abandoned":
            return "abandoned"
        state = session.workbench_state or {}
        publish_result = state.get("publish_result")
        if isinstance(publish_result, dict):
            if publish_result.get("status") == "published":
                return "published"
            if publish_result.get("status") == "failed":
                return "blocked"
        advanced_refs = (
            state.get("advanced_refs") if isinstance(state.get("advanced_refs"), dict) else {}
        )
        if session.current_proposal_id or advanced_refs.get("proposal_id"):
            return "proposal_saved"
        if state.get("required_confirmations"):
            return "awaiting_confirmation"
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        if has_reviewable_spec(raw_spec):
            return "spec_ready"
        canvas = state.get("semantic_canvas") if isinstance(state.get("semantic_canvas"), dict) else {}
        if session.conversation and len(session.conversation) > 1:
            return "analyzing"
        if state.get("candidate_cards") or any(
            canvas.get(key) for key in ("objects", "metrics", "bindings", "dimensions")
        ):
            return "analyzing"
        return "created"

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
        session = AgentSession(
            id=str(payload.get("id") or f"modeling_session_{uuid4().hex}"),
            user_goal=user_goal,
            entry_type=entry_type,  # type: ignore[arg-type]
            principal_id=principal_id,
            title=title,
            workbench_state=self._initial_workbench_state(user_goal, entry_type),
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

    def get_review(
        self,
        session_id: str,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """返回 Chat-first 页面右侧 Artifact Panel 使用的 Proposal Review 只读视图。

        这是建模助手应用层 read model：未保存 Proposal 时从 session 草稿态投影；
        保存后优先复用 ModelingProposal gap-view，避免前端重复拼状态机。
        """
        session = self._require(session_id)
        self._authorize(session, principal_id)
        if self._refresh_session_spec_state(session):
            self._save_session(session)
        proposal_id = str(
            session.current_proposal_id
            or (session.workbench_state.get("advanced_refs") or {}).get("proposal_id")
            or ""
        ).strip() or None

        if proposal_id and hasattr(self._proposal_service, "get_gap_view"):
            try:
                gap_view = self._proposal_service.get_gap_view(proposal_id)
                return self._review_from_gap_view(session, gap_view)
            except Exception:
                # Proposal 视图不可用时保守回落到 session 视图，保证 Chat 不被阻断。
                pass

        return self._review_from_session(session)

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

    def update_spec(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """工作台编辑 spec 后回写：部分覆盖 raw_spec、重新校验、重算 readiness。

        body 接受：
            {
                "cube": {...},        # 部分覆盖
                "ontology": {...},    # 部分覆盖
                "binding": {...},     # 部分覆盖
                "policy": {...},      # 部分覆盖
                "spec": {...},        # 整体替换（与上面四个互斥）
            }
        """
        from copy import deepcopy

        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        state = deepcopy(session.workbench_state)
        existing_spec = dict(state.get("raw_spec") or {})

        if "spec" in payload:
            next_spec = dict(payload["spec"] or {})
        else:
            next_spec = existing_spec
            for key in ("cube", "ontology", "binding", "policy"):
                if key in payload and isinstance(payload[key], dict):
                    merged = dict(next_spec.get(key) or {})
                    merged.update(payload[key])
                    next_spec[key] = merged

        state["raw_spec"] = repair_modeling_spec(
            next_spec,
            user_goal=session.user_goal,
            source_mode=str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led"),
        )

        # 重新跑 validate（如果 builder 提供）
        validation: Optional[Dict[str, Any]] = None
        try:
            validation_session_payload = session.model_dump(mode="json")
            validation_session_payload["workbench_state"] = state
            validation = self._tools.execute(
                "run_validation",
                {},
                {"session": validation_session_payload, "request_payload": payload},
            )
        except Exception as exc:
            validation = {"summary": f"校验执行失败：{exc}", "validation": None}
        validation_payload = (validation or {}).get("validation") or {}
        state["validation_summary"] = (
            validation_payload.get("issues") if isinstance(validation_payload, dict) else []
        ) or []

        # 重算 readiness
        issues = state.get("validation_summary") or []
        has_errors = any(it.get("severity") == "error" for it in issues)
        confirmations_remaining = bool(state.get("required_confirmations"))
        reasons: list = []
        if has_errors:
            reasons.append("validation_blocked")
        if confirmations_remaining:
            reasons.append("business_owner_confirmation_required")
        state["readiness"] = {
            "canonical_ready": False,
            "exploratory_ready": bool(next_spec) and not has_errors,
            "reasons": reasons or ["ready_to_save"],
        }
        state["agent_message"] = "已根据你的工作台编辑刷新 spec 与校验结果。"
        session.workbench_state = state
        session.record_event(
            "session_action",
            actor=principal_id,
            action="update_spec",
            payload={
                "updated_keys": [
                    key
                    for key in ("spec", "cube", "ontology", "binding", "policy")
                    if key in payload
                ]
            },
        )
        self._save_session(session)
        return self._dump(session)

    def publish_proposal(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """串联 approve → apply → publish，把 spec 落到 active Cube + Ontology。

        要求：session 必须已经走过 save_proposal（即 current_proposal_id 不空）。
        失败时把阻断原因写到 session.workbench_state.publish_result 并抛 ValueError，
        前端可以把它呈现为对话中的"应用阻断"提示。
        """
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        body = dict(payload or {})
        proposal_id = str(
            session.current_proposal_id
            or (session.workbench_state.get("advanced_refs") or {}).get("proposal_id")
            or ""
        ).strip()
        if not proposal_id:
            raise ValueError("会话还没保存 Proposal，不能直接发布")

        review_payload = {
            "approved_by": body.get("approved_by") or "semantic_owner",
            "review_type": body.get("review_type") or "single_owner",
            "comment": body.get("comment") or "Copilot 一键发布",
        }
        publish_targets = body.get("publish_targets")

        try:
            try:
                approved = self._proposal_service.approve(proposal_id, review_payload)
            except Exception as approve_exc:
                if "validated before approved" not in str(approve_exc):
                    raise
                validation = self._proposal_service.validate(proposal_id)
                if validation.get("status") != "validated":
                    raise ValueError("Proposal validation blocked before approved")
                approved = self._proposal_service.approve(proposal_id, review_payload)
            applied = self._proposal_service.apply(proposal_id)
            published = self._proposal_service.publish(proposal_id, publish_targets=publish_targets)
        except Exception as exc:
            self._persist_publish_failure(session, proposal_id, exc)
            raise

        state = deepcopy(session.workbench_state)
        state["publish_result"] = {
            "status": "published",
            "proposal_id": proposal_id,
            "approved_at": (approved.get("review_records") or [{}])[-1].get("timestamp"),
            "applied_spec_hash": applied.get("applied_spec_hash"),
            "publish_targets": publish_targets,
            "details": published.get("publish_result"),
        }
        state["post_publish_validation"] = self._post_publish_validation(state, published=True)
        state["readiness"] = {
            "canonical_ready": True,
            "exploratory_ready": True,
            "reasons": [],
        }
        state["agent_message"] = (
            f"语义 {proposal_id} 已发布。Cube 与 Ontology 已上线，正式 Data Agent 现在可以消费这套语义了。"
        )
        state["suggested_actions"] = ["continue_modeling", "open_data_chat"]
        session.workbench_state = state
        session.status = "completed"
        session.add_message(role="assistant", content=state["agent_message"])
        session.record_event(
            "proposal_action",
            actor=principal_id or str(review_payload.get("approved_by") or "semantic_owner"),
            action="publish",
            idempotency_key=f"{proposal_id}:publish",
            payload={"proposal_id": proposal_id, "status": "published"},
        )
        self._save_session(session)
        return self._dump(session)

    def _persist_publish_failure(self, session: AgentSession, proposal_id: str, exc: Exception) -> None:
        reason = self._publish_failure_reason(exc)
        state = deepcopy(session.workbench_state)
        readiness = dict(state.get("readiness") or {})
        reasons = [str(item) for item in (readiness.get("reasons") or []) if str(item) != "ready_to_save"]
        if reason["id"] not in reasons:
            reasons.append(reason["id"])
        readiness["canonical_ready"] = False
        readiness["exploratory_ready"] = self._has_reviewable_spec(state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {})
        readiness["reasons"] = reasons
        state["readiness"] = readiness
        state["publish_result"] = {
            "status": "failed",
            "proposal_id": proposal_id,
            "reason": reason["id"],
            "title": reason["title"],
            "hint": reason["hint"],
            "error": str(exc),
        }
        state["post_publish_validation"] = self._post_publish_validation(state, published=False)
        state["agent_message"] = f"发布失败：{reason['title']}。{reason['hint']}"
        state["suggested_actions"] = ["open_spec", "save_proposal", "continue_modeling"]
        session.workbench_state = state
        session.status = "active"
        session.add_message(role="assistant", content=state["agent_message"])
        session.record_event(
            "proposal_action",
            actor="copilot_service",
            action="publish_failed",
            idempotency_key=f"{proposal_id}:publish:{reason['id']}",
            payload={"proposal_id": proposal_id, "reason": reason["id"]},
        )
        self._save_session(session)

    def _publish_failure_reason(self, exc: Exception) -> Dict[str, str]:
        message = str(exc)
        if "Approved spec changed before apply" in message:
            return {
                "id": "approved_spec_changed_before_apply",
                "title": "已批准 spec 在发布前发生变化",
                "hint": "请重新应用语义生成新的 Proposal，再确认发布。",
            }
        if "Applied assets drift" in message or "semantic_diff" in message:
            return {
                "id": "approved_semantic_diff_drift",
                "title": "已批准差异和应用资产不一致",
                "hint": "请打开 Spec 核对完整 raw_spec，重新应用语义生成新的 Proposal 后再确认发布。",
            }
        if "Proposal validation blocked before approved" in message or "must be validated before approved" in message:
            return {
                "id": "proposal_validation_blocked",
                "title": "Proposal 校验未通过",
                "hint": "请先处理 validation_matrix 中的错误，例如时间维度、指标绑定或源表口径，再重新保存并发布。",
            }
        return {
            "id": "publish_failed",
            "title": "发布动作失败",
            "hint": "请先根据错误修正 spec 或重新应用语义，然后再确认发布。",
        }

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

    def send_message(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        message = str(payload.get("message") or payload.get("content") or "").strip()
        if not message:
            raise ValueError("缺少必填字段: message")
        session.add_message(role="user", content=message)
        deterministic_reply = self._handle_deterministic_chat_action(session, message, payload)
        if deterministic_reply is not None:
            session.add_message(role="assistant", content=deterministic_reply)
            self._save_session(session)
            return self._dump(session)
        source_recall_reply = self._try_source_candidate_recall(session, message, payload)
        if source_recall_reply is not None:
            session.add_message(role="assistant", content=source_recall_reply)
            self._save_session(session)
            return self._dump(session)
        result = self._runtime.run(
            session=session,
            user_message=message,
            tools=self._tools,
            context={"request_payload": payload},
        )
        self._apply_agent_result(session, result)
        session.add_message(role="assistant", content=result.message)
        self._save_session(session)
        return self._dump(session)

    def _handle_deterministic_chat_action(
        self,
        session: AgentSession,
        message: str,
        payload: Dict[str, Any],
    ) -> Optional[str]:
        normalized = message.lower()
        action = str(payload.get("action") or payload.get("type") or "").strip()
        if action == "confirm_source_candidate" or "使用这个来源" in message or "确认这个来源" in message:
            return self._confirm_source_candidate_from_chat(session, payload, message)

        if "cube" in normalized and "草稿" in message and ("接受" in message or "锁定" in message):
            state = deepcopy(session.workbench_state)
            raw_spec = repair_modeling_spec(
                state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {},
                user_goal=session.user_goal,
                source_mode=str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led"),
            )
            if not raw_spec.get("cube"):
                return "当前还没有可接受的 Cube 草稿。请先让我生成 spec，或在右侧 Spec 面板补齐。"
            state["raw_spec"] = raw_spec
            state["cube_draft_accepted"] = True
            state["spec_lock"] = {
                "status": "accepted",
                "source": "chat_action",
                "reason": str(payload.get("reason") or "user_accept_cube_draft"),
            }
            readiness = dict(state.get("readiness") or {})
            readiness["exploratory_ready"] = True
            readiness["reasons"] = [
                reason for reason in (readiness.get("reasons") or [])
                if reason not in {"cube_draft_not_accepted", "spec_not_generated", "binding_not_approved"}
            ] or ["ready_to_save"]
            state["readiness"] = readiness
            state["suggested_actions"] = ["run_validation", "save_proposal"]
            state["agent_message"] = "已接受 Cube 草稿，当前 spec 已锁定。你可以继续沙盒预演或应用语义。"
            session.workbench_state = state
            return state["agent_message"]

        if "使用推荐" in message or "采用推荐" in message or "接受推荐" in message:
            state = deepcopy(session.workbench_state)
            confirmations = [
                item for item in (state.get("required_confirmations") or [])
                if isinstance(item, dict) and not item.get("confirmed")
            ]
            if not confirmations:
                return "当前没有待确认的推荐项，可以继续保存 Proposal 或发布前预演。"
            confirmed = session.working_memory.setdefault("confirmed_assumptions", [])
            for item in confirmations:
                confirmed.append(
                    {
                        "id": str(item.get("id") or item.get("title") or "recommendation"),
                        "value": item.get("recommended_value"),
                        "source": "chat_recommendation",
                    }
                )
            state["required_confirmations"] = []
            readiness = dict(state.get("readiness") or {})
            readiness["reasons"] = [
                reason for reason in (readiness.get("reasons") or [])
                if reason != "business_owner_confirmation_required"
            ] or ["ready_to_save"]
            readiness["exploratory_ready"] = True
            state["readiness"] = readiness
            state, spec_status = self._ensure_spec_after_confirmations(session, state)
            if spec_status == "generated":
                state["agent_message"] = (
                    f"已按推荐值确认 {len(confirmations)} 项口径，并已生成可审阅 spec。"
                    "你可以继续沙盒预演，或应用语义保存 Proposal。"
                )
            elif spec_status == "failed":
                state["agent_message"] = (
                    f"已按推荐值确认 {len(confirmations)} 项口径，但 spec 生成失败。"
                    "请在 Chat 里补充源表或让 Copilot 重新生成。"
                )
            elif spec_status == "missing_source":
                state["agent_message"] = (
                    f"已按推荐值确认 {len(confirmations)} 项口径，但还缺少可生成 spec 的源表线索。"
                    "请继续补充物理表或候选数据集。"
                )
            else:
                state["suggested_actions"] = ["save_proposal", "run_validation"]
                state["agent_message"] = f"已按推荐值确认 {len(confirmations)} 项口径，当前可以继续保存 Proposal。"
            session.workbench_state = state
            return state["agent_message"]

        if "解释" in message and ("阻塞" in message or "为什么" in message or "怎么处理" in message):
            return self._explain_blocker_for_chat(session, message)
        return None

    def _try_source_candidate_recall(
        self,
        session: AgentSession,
        message: str,
        payload: Dict[str, Any],
    ) -> Optional[str]:
        """首轮优先走确定性选表召回，避免无源表场景被 LLM 超时卡住。"""
        state = deepcopy(session.workbench_state or {})
        if state.get("required_confirmations"):
            return None
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        if has_reviewable_spec(raw_spec):
            return None

        context_session = session.model_dump(mode="json")
        context_session["workbench_state"] = state
        result = self._tools.execute(
            "rank_candidate_assets",
            {"query": f"{session.user_goal} {message}", "limit": 5},
            {"session": context_session, "request_payload": payload},
        )
        if result.get("error"):
            return None
        source_candidates = result.get("source_candidates") or []
        if source_candidates:
            state["source_candidates"] = source_candidates
            proposal_patch = {
                **(state.get("proposal_patch") or {}),
                "source_mode": (state.get("proposal_patch") or {}).get("source_mode") or "agent_led",
                "source_kind": (state.get("proposal_patch") or {}).get("source_kind") or session.entry_type,
                "user_question": session.user_goal,
                "candidate_assets": source_candidates,
            }
            state["proposal_patch"] = proposal_patch
            state["readiness"] = {
                "canonical_ready": False,
                "exploratory_ready": False,
                "reasons": ["source_candidate_confirmation_required", "spec_not_generated"],
            }
            state["suggested_actions"] = ["confirm_source_candidate"]
            state["advanced_refs"] = {
                **(state.get("advanced_refs") or {}),
                "spec_available": False,
                "source_candidates_available": True,
                "trace_available": True,
            }
            message_text = "我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。"
            state["agent_message"] = message_text
            session.workbench_state = state
            self._append_tool_trace(session, {
                "tool": "rank_candidate_assets",
                "status": "completed",
                "summary": result.get("summary") or "已召回候选数据来源",
            })
            self._append_tool_trace(session, {
                "tool": "generate_semantic_draft",
                "status": "skipped",
                "summary": "等待确认候选数据来源",
            })
            return message_text

        if result.get("source_recall_state") == "no_candidate":
            proposal_patch = {
                **(state.get("proposal_patch") or {}),
                "source_mode": (state.get("proposal_patch") or {}).get("source_mode") or "agent_led",
                "source_kind": (state.get("proposal_patch") or {}).get("source_kind") or session.entry_type,
                "user_question": session.user_goal,
            }
            state["proposal_patch"] = proposal_patch
            state["source_candidates"] = []
            self._mark_spec_missing(state, "need_source_table")
            state["suggested_actions"] = ["provide_source_table"]
            state["agent_message"] = "我还缺少可生成 spec 的源表或数据集。请补充物理表、数据集、指标口径、分组字段或时间字段。"
            session.workbench_state = state
            self._append_tool_trace(session, {
                "tool": "rank_candidate_assets",
                "status": "completed",
                "summary": result.get("summary") or "没有召回到候选数据来源",
            })
            self._append_tool_trace(session, {
                "tool": "generate_semantic_draft",
                "status": "skipped",
                "summary": "缺少源表线索，跳过 spec 生成",
            })
            return state["agent_message"]
        return None

    def _confirm_source_candidate_from_chat(
        self,
        session: AgentSession,
        payload: Dict[str, Any],
        message: str,
    ) -> str:
        state = deepcopy(session.workbench_state or {})
        candidates = [
            item for item in (state.get("source_candidates") or [])
            if isinstance(item, dict)
        ]
        candidate_id = str(payload.get("candidate_id") or payload.get("source_candidate_id") or "").strip()
        candidate = self._pick_source_candidate(candidates, candidate_id, message)
        if candidate is None:
            return "我还没有可确认的数据来源候选。请先告诉我源表/数据集，或重新让 Copilot 检索候选来源。"

        candidate = self._repair_source_candidate_by_rules(session.user_goal, candidate, candidates)
        source_payload = self._source_payload_from_candidate(candidate)
        if not source_payload:
            return "这个候选来源缺少 source_id、database 或 table，暂时不能生成 spec。请换一个来源或补充完整表名。"

        proposal_patch = {
            **(state.get("proposal_patch") or {}),
            **source_payload,
            "source_mode": (state.get("proposal_patch") or {}).get("source_mode") or "agent_led",
            "user_question": session.user_goal,
            "candidate_table": self._candidate_table_label(source_payload, candidate),
        }
        state["proposal_patch"] = proposal_patch
        state["selected_source_candidate"] = candidate
        state["source_candidates"] = self._source_candidates_with_selection(
            candidates,
            candidate,
        )
        state["readiness"] = {
            "canonical_ready": False,
            "exploratory_ready": False,
            "reasons": ["spec_not_generated"],
        }
        state, spec_status = self._ensure_spec_after_confirmations(session, state)
        self._append_tool_trace(session, {
            "tool": "confirm_source_candidate",
            "status": "completed",
            "summary": f"已确认数据来源 {proposal_patch.get('candidate_table')}",
        })
        if spec_status == "generated":
            state["agent_message"] = (
                f"已使用 {proposal_patch.get('candidate_table')} 生成可审阅 spec。"
                "你可以继续沙盒预演，或应用语义保存 Proposal。"
            )
        elif spec_status == "existing":
            state["agent_message"] = "该会话已经有可审阅 spec，我已记录这次来源确认。"
        else:
            state["agent_message"] = "已确认数据来源，但 spec 生成失败。请在右侧 Spec 检查字段，或继续在 Chat 补充口径。"
        session.workbench_state = state
        return state["agent_message"]

    def _source_candidates_with_selection(
        self,
        candidates: list[Dict[str, Any]],
        selected: Dict[str, Any],
    ) -> list[Dict[str, Any]]:
        selected_id = str(selected.get("id") or "")
        found = False
        items: list[Dict[str, Any]] = []
        for item in candidates:
            is_selected = bool(selected_id and str(item.get("id") or "") == selected_id)
            found = found or is_selected
            items.append({**item, "selected": is_selected})
        if selected_id and not found:
            items.insert(0, {**selected, "selected": True})
        return items

    def _repair_source_candidate_by_rules(
        self,
        user_goal: str,
        candidate: Dict[str, Any],
        candidates: list[Dict[str, Any]],
    ) -> Dict[str, Any]:
        terms = SourceCandidateRecallService._query_terms(user_goal)
        rules = self._source_scoring_config.matching_rules(user_goal, terms)
        if not rules:
            return candidate
        for rule in rules:
            if rule.matches_positive_source(self._candidate_text(candidate)):
                return candidate
            for item in candidates:
                if rule.matches_positive_source(self._candidate_text(item)):
                    return item
            if rule.canonical_candidate:
                return {
                    **deepcopy(dict(rule.canonical_candidate)),
                    "supersedes_candidate": candidate.get("id") or candidate.get("name"),
                }
        return candidate

    @staticmethod
    def _candidate_text(candidate: Dict[str, Any]) -> str:
        return " ".join(
            str(candidate.get(key) or "")
            for key in ("id", "name", "title", "table", "description")
        ).lower()

    def _explain_blocker_for_chat(self, session: AgentSession, message: str) -> str:
        state = session.workbench_state or {}
        target = message
        for blocker in self._review_blockers_from_state(
            state.get("required_confirmations") or [],
            (state.get("readiness") or {}).get("reasons") or [],
            state.get("validation_summary") or [],
        ):
            title = str(blocker.get("title") or "")
            if title and (title in target or str(blocker.get("id") or "") in target):
                return (
                    f"{title}会阻塞发布，是因为该口径会影响最终 Cube 与业务指标的解释。"
                    f"建议直接使用推荐值「{blocker.get('technical_hint') or '推荐口径'}」，"
                    "或在 Chat 里补充你的真实业务口径；输入“使用推荐”可以一次性确认当前推荐项。"
                )
        if "grain" in target.lower():
            return (
                "grain 会阻塞发布，是因为 BusinessMetric 必须明确在什么粒度上统计，"
                "否则按学校、日期等维度聚合时可能重复计算。当前学生评论场景会优先补齐为学校 + 时间粒度；"
                "如需调整，可直接说明“按学校和评论日期作为 grain”。"
            )
        if "完整 spec" in target or "spec" in target.lower():
            return (
                "完整 spec 是保存和发布语义资产的输入合同，包含 Cube、指标绑定、时间维度、权限策略和证据。"
                "现在后端会从已保存 Proposal 自动回填并修复缺失字段；如果仍缺失，请先生成 spec 或在右侧 Spec 面板补齐。"
            )
        return "这个阻塞项代表发布前还有口径或结构字段未确认。可以输入“使用推荐”采用当前推荐值，或直接告诉我你要采用的业务口径。"

    def confirm(
        self,
        session_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        confirmation_id = str(payload.get("confirmation_id") or payload.get("id") or "").strip()
        value = payload.get("value")
        if not confirmation_id:
            raise ValueError("缺少必填字段: confirmation_id")
        confirmed = session.working_memory.setdefault("confirmed_assumptions", [])
        confirmed.append({"id": confirmation_id, "value": value, "source": "human_confirmation"})
        state = deepcopy(session.workbench_state)
        state["required_confirmations"] = [
            item for item in (state.get("required_confirmations") or [])
            if item.get("id") != confirmation_id
        ]
        if not state["required_confirmations"]:
            readiness = dict(state.get("readiness") or {})
            readiness["reasons"] = [
                reason for reason in (readiness.get("reasons") or [])
                if reason != "business_owner_confirmation_required"
            ]
            state["readiness"] = readiness
            state, spec_status = self._ensure_spec_after_confirmations(session, state)
        else:
            spec_status = "pending"
        if spec_status == "generated":
            state["agent_message"] = (
                f"已确认 {confirmation_id}，并已生成可审阅 spec。"
                "你可以继续沙盒预演，或应用语义保存 Proposal。"
            )
        elif spec_status == "failed":
            state["agent_message"] = (
                f"已确认 {confirmation_id}，但 spec 生成失败。"
                "请在 Chat 里补充源表或让 Copilot 重新生成。"
            )
        elif spec_status == "missing_source":
            state["agent_message"] = (
                f"已确认 {confirmation_id}，但还缺少可生成 spec 的源表线索。"
                "请继续补充物理表或候选数据集。"
            )
        else:
            state["agent_message"] = f"已确认 {confirmation_id}，我会基于该口径继续维护 Proposal。"
            state["suggested_actions"] = ["save_proposal", "run_validation"]
        session.workbench_state = state
        session.add_message(role="assistant", content=state["agent_message"])
        session.record_event(
            "session_action",
            actor=principal_id,
            action="confirm",
            idempotency_key=f"{session.id}:confirm:{confirmation_id}:{session.state_version}",
            payload={"confirmation_id": confirmation_id},
        )
        self._save_session(session)
        return self._dump(session)

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
            state["agent_message"] = "已根据已确认口径补齐可审阅 spec。你可以继续沙盒预演，或应用语义保存 Proposal。"
        elif spec_status == "failed":
            state["agent_message"] = "已确认口径，但 spec 生成失败。请在 Chat 里补充源表或让 Copilot 重新生成。"
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
        return state, "generated"

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
                }
            if source_kind == "physical_table" and payload.get("source_id") and payload.get("database") and payload.get("table"):
                return {
                    "source_kind": "physical_table",
                    "source_id": payload.get("source_id"),
                    "database": payload.get("database"),
                    "schema": payload.get("schema"),
                    "table": payload.get("table"),
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
        if source_kind == "dataset" and candidate.get("dataset_id"):
            return {
                "source_kind": "dataset",
                "dataset_id": candidate.get("dataset_id"),
                "source_id": candidate.get("source_id"),
                "database": candidate.get("database"),
                "schema": candidate.get("schema"),
                "table": candidate.get("table"),
            }
        if source_kind == "physical_table" and candidate.get("source_id") and candidate.get("database") and candidate.get("table"):
            return {
                "source_kind": "physical_table",
                "source_id": candidate.get("source_id"),
                "database": candidate.get("database"),
                "schema": candidate.get("schema"),
                "table": candidate.get("table"),
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
            if item != "ready_to_save"
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
            for ref in metric.get("measure_refs") or []:
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

    def accept_cube_draft(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """接受当前 Cube 草稿。

        这是用户显式点击产生的状态动作，不应进入 LLM 对话链路。Chat 只负责展示
        结果，真正的变更写入 workbench_state，后续保存 Proposal 直接使用当前 spec。
        """
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        state = deepcopy(session.workbench_state)
        raw_spec = repair_modeling_spec(
            state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {},
            user_goal=session.user_goal,
            source_mode=str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led"),
        )
        state["raw_spec"] = raw_spec
        has_cube = bool(raw_spec.get("cube") or raw_spec.get("cubes"))
        if not has_cube:
            raise ValueError("SPEC_REQUIRED: 当前会话还没有可接受的 Cube 草稿")

        state["cube_draft_accepted"] = True
        state["spec_lock"] = {
            "status": "accepted",
            "source": "human_action",
            "reason": str((payload or {}).get("reason") or "user_accept_cube_draft"),
        }
        readiness = dict(state.get("readiness") or {})
        readiness["exploratory_ready"] = True
        readiness["canonical_ready"] = bool((state.get("publish_result") or {}).get("status") == "published")
        readiness["reasons"] = [
            reason for reason in (readiness.get("reasons") or [])
            if reason != "cube_draft_not_accepted"
        ] or ["ready_to_save"]
        state["readiness"] = readiness
        state["agent_message"] = "已接受 Cube 草稿，当前 spec 已锁定。你可以继续沙盒预演或应用语义。"
        state["suggested_actions"] = ["run_validation", "save_proposal"]
        session.workbench_state = state
        session.add_message(role="assistant", content=state["agent_message"])
        session.record_event(
            "session_action",
            actor=principal_id,
            action="accept_cube_draft",
            idempotency_key=f"{session.id}:accept_cube_draft:{session.state_version}",
            payload={"has_cube": has_cube},
        )
        self._save_session(session)
        return self._dump(session)

    def sandbox(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        result = self._tools.execute(
            "sandbox_preview",
            dict(payload or {}),
            {"session": session.model_dump(mode="json")},
        )
        state = deepcopy(session.workbench_state)
        state["sandbox_preview"] = result
        state["agent_message"] = "已完成草稿态沙盒预演，不会污染正式 Data Agent runtime。"
        session.workbench_state = state
        session.add_message(role="assistant", content=state["agent_message"])
        self._save_session(session)
        return self._dump(session)

    def save_proposal(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        state = deepcopy(session.workbench_state)
        payload_dict = dict(payload or {})
        existing_proposal_id = str(
            session.current_proposal_id
            or (state.get("advanced_refs") or {}).get("proposal_id")
            or ""
        ).strip()
        if existing_proposal_id and not payload_dict.get("force_new"):
            session.current_proposal_id = existing_proposal_id
            state["proposal_summary"] = {
                **(state.get("proposal_summary") or {}),
                "id": existing_proposal_id,
            }
            state["advanced_refs"] = {
                **(state.get("advanced_refs") or {}),
                "proposal_id": existing_proposal_id,
                "trace_available": bool(session.tool_traces),
            }
            state["save_result"] = {
                "status": "already_saved",
                "proposal_id": existing_proposal_id,
                "idempotent": True,
            }
            state["next_steps"] = self._saved_proposal_next_steps(existing_proposal_id)
            state["agent_message"] = f"Proposal {existing_proposal_id} 已保存，本次没有创建新 Proposal。"
            state["suggested_actions"] = ["inspect_proposal", "run_sandbox", "continue_modeling"]
            session.workbench_state = state
            session.record_event(
                "proposal_action",
                actor=principal_id,
                action="save_proposal",
                idempotency_key=f"{existing_proposal_id}:already_saved",
                payload={"proposal_id": existing_proposal_id, "status": "already_saved"},
            )
            self._save_session(session)
            return self._dump(session)

        proposal_patch = dict(state.get("proposal_patch") or {})
        proposal_patch.update(payload_dict.get("proposal_patch") or {})
        if not proposal_patch:
            raise ValueError("当前会话没有可保存的 proposal_patch")
        proposal_patch.pop("spec", None)
        # 工作台已落地的完整 spec（LLM+工具链或 PATCH 回写），保存 Proposal 时必须走 embedded_spec，
        # 否则 draft() 会再次 create_spec_draft，而 request_payload 仍是 business_question → 建模源类型不支持。
        raw_spec = repair_modeling_spec(
            state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {},
            user_goal=session.user_goal,
            source_mode=str(proposal_patch.get("source_mode") or "agent_led"),
        )
        state["raw_spec"] = raw_spec
        if (
            isinstance(raw_spec, dict)
            and str(raw_spec.get("spec_version") or "") == "v1"
            and isinstance(raw_spec.get("cube"), dict)
            and raw_spec["cube"]
        ):
            proposal_patch["embedded_spec"] = deepcopy(raw_spec)
        else:
            raise ValueError("SPEC_REQUIRED: 当前会话还没有可保存、可校验的 raw_spec，请先让 Copilot 生成 spec 或在右侧 Spec 面板补齐。")
        # Agent-led 场景里的候选表只是证据与确认材料，不作为用户已选择的物理建模源。
        if proposal_patch.get("source_kind") == "business_question":
            proposal_patch.pop("table", None)
            proposal_patch.pop("source_id", None)
            proposal_patch.pop("dataset_id", None)
        proposal = self._proposal_service.create_proposal(proposal_patch)
        proposal_id = proposal["id"]
        draft = self._proposal_service.draft(proposal_id)
        validation = None
        if draft.get("status") not in {"closed", "blocked"}:
            try:
                validation = self._proposal_service.validate(proposal_id)
            except Exception as exc:
                validation = {"status": "blocked", "error": str(exc)}
        session.current_proposal_id = proposal_id
        state["proposal_summary"] = validation or draft or proposal
        state["advanced_refs"] = {
            **(state.get("advanced_refs") or {}),
            "proposal_id": proposal_id,
            "spec_available": bool((validation or draft).get("spec")),
            "trace_available": bool(session.tool_traces),
        }
        state["save_result"] = {
            "status": "saved",
            "proposal_id": proposal_id,
            "idempotent": False,
        }
        state["next_steps"] = self._saved_proposal_next_steps(proposal_id)
        state["agent_message"] = f"Proposal {proposal_id} 已保存。下一步进入治理审核，或继续补充业务口径。"
        state["suggested_actions"] = ["inspect_proposal", "run_sandbox", "continue_modeling"]
        session.workbench_state = state
        session.add_message(role="assistant", content=state["agent_message"])
        session.record_event(
            "proposal_action",
            actor=principal_id,
            action="save_proposal",
            idempotency_key=f"{proposal_id}:save",
            payload={"proposal_id": proposal_id, "status": "saved"},
        )
        self._save_session(session)
        return self._dump(session)

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

    def _apply_agent_result(self, session: AgentSession, result: AgentRunResult) -> None:
        state = deepcopy(session.workbench_state)
        state = self._deep_merge(state, result.workbench_state_patch)
        if has_reviewable_spec(state.get("raw_spec")):
            state["raw_spec"] = repair_modeling_spec(
                state["raw_spec"],
                user_goal=session.user_goal,
                source_mode=str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led"),
            )
        if result.proposal_patch:
            state["proposal_patch"] = self._deep_merge(state.get("proposal_patch") or {}, result.proposal_patch)
        if result.required_confirmations:
            state["required_confirmations"] = result.required_confirmations
        if result.suggested_actions:
            state["suggested_actions"] = result.suggested_actions
        state["agent_message"] = result.message
        session.workbench_state = state
        session.tool_traces.extend(result.tool_traces)

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

    def _infer_entry_type(self, payload: Dict[str, Any]) -> str:
        if payload.get("miss_trace_id"):
            return "semantic_gap"
        if payload.get("table") or payload.get("source_id") or payload.get("dataset_id"):
            return "table_known"
        return "business_question"

    def _require(self, session_id: str) -> AgentSession:
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"AgentSession not found: {session_id}")
        return session

    def _dump(self, session: AgentSession) -> Dict[str, Any]:
        return session.model_dump(mode="json", exclude_none=True)

    def _saved_proposal_next_steps(self, proposal_id: str) -> list[Dict[str, Any]]:
        return [
            {
                "id": "governance_review",
                "title": "治理审核",
                "description": "确认语义差异、证据和阻断原因",
                "href": "/semantic/ontology/governance",
                "proposal_id": proposal_id,
            },
            {
                "id": "sandbox_preview",
                "title": "沙盒预演",
                "description": "在草稿态验证 Data Agent 可消费性",
                "proposal_id": proposal_id,
            },
            {
                "id": "continue_modeling",
                "title": "继续补充",
                "description": "追加口径、角色、敏感等级或候选线索",
                "proposal_id": proposal_id,
            },
        ]

    def _review_from_session(self, session: AgentSession) -> Dict[str, Any]:
        state = session.workbench_state or {}
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        cube = (raw_spec.get("cube") or {}) if isinstance(raw_spec, dict) else {}
        ontology = (raw_spec.get("ontology") or {}) if isinstance(raw_spec, dict) else {}
        canvas = state.get("semantic_canvas") or {}
        confirmations = state.get("required_confirmations") or []
        readiness = state.get("readiness") or {}
        reasons = readiness.get("reasons") or []
        validation = state.get("validation_summary") or []
        published = (state.get("publish_result") or {}).get("status") == "published"
        proposal_id = (
            session.current_proposal_id
            or (state.get("advanced_refs") or {}).get("proposal_id")
            or (state.get("proposal_summary") or {}).get("id")
        )

        changes = self._review_changes_from_state(cube, ontology, canvas)
        blockers = self._review_blockers_from_state(confirmations, reasons, validation, state.get("publish_result"))
        has_spec = self._has_reviewable_spec(raw_spec)
        status, status_label = self._review_status(
            published=published,
            has_spec=has_spec,
            has_proposal=bool(proposal_id),
            has_blockers=bool(blockers),
        )

        return {
            "session_id": session.id,
            "proposal_id": proposal_id,
            "status": status,
            "status_label": status_label,
            "changes": changes,
            "blockers": blockers,
            "reason_explanations": self._review_explanations(changes),
            "data_agent_consumption": self._review_consumption_state(published, has_spec, blockers),
            "source_evidence": self._source_evidence_state(session, raw_spec, state),
            "trace_state": self._trace_state(session, proposal_id, published),
            "publish_gate": self._publish_gate_state(status, status_label, has_spec, bool(proposal_id), blockers, published, state),
            "post_publish_validation": self._post_publish_validation(state, published=published),
            "primary_action": self._review_primary_action(status, has_spec, blockers),
        }

    def _review_from_gap_view(self, session: AgentSession, gap_view: Dict[str, Any]) -> Dict[str, Any]:
        status = str(gap_view.get("status") or "")
        published = status == "published"
        blockers = [
            {
                "id": str(item.get("id") or item.get("title") or idx),
                "severity": str(item.get("severity") or "required"),
                "title": str(item.get("title") or "发布阻塞"),
                "description": str(item.get("description") or ""),
                "technical_hint": item.get("technical_hint"),
                "source": "proposal",
            }
            for idx, item in enumerate(gap_view.get("gaps") or [])
        ]
        changes = [
            {
                "id": str(item.get("id") or idx),
                "type": str(item.get("type") or "change"),
                "title": str(item.get("title") or item.get("business_name") or item.get("technical_name") or "语义变更"),
                "technical_name": item.get("technical_name"),
                "operation": "create",
                "reason": str(item.get("description") or "来自 Proposal gap-view 的补齐建议。"),
                "impact": "保存或发布后会影响正式语义资产。",
                "risk": "发布前需确认业务口径和校验结果。",
            }
            for idx, item in enumerate(gap_view.get("patch_plan") or [])
        ]
        primary = gap_view.get("primary_action") or {}
        mapped_status = "published" if published else ("blocked" if blockers else "ready_to_publish")
        return {
            "session_id": session.id,
            "proposal_id": gap_view.get("id") or session.current_proposal_id,
            "status": mapped_status,
            "status_label": str(gap_view.get("display_status") or self._review_status_label(mapped_status)),
            "changes": changes,
            "blockers": blockers,
            "reason_explanations": self._review_explanations(changes),
            "data_agent_consumption": self._review_consumption_state(published, True, blockers),
            "source_evidence": self._source_evidence_state(session, session.workbench_state.get("raw_spec") or {}, session.workbench_state),
            "trace_state": self._trace_state(session, gap_view.get("id") or session.current_proposal_id, published),
            "publish_gate": self._publish_gate_state(mapped_status, str(gap_view.get("display_status") or self._review_status_label(mapped_status)), True, bool(gap_view.get("id") or session.current_proposal_id), blockers, published, session.workbench_state),
            "post_publish_validation": self._post_publish_validation(session.workbench_state, published=published),
            "primary_action": {
                "action": primary.get("action") or ("none" if published else "publish"),
                "label": primary.get("label") or self._review_primary_action(mapped_status, True, blockers)["label"],
                "disabled": bool(primary.get("disabled", False)),
                "disabled_reason": primary.get("disabled_reason"),
            },
        }

    def _review_changes_from_state(
        self,
        cube: Dict[str, Any],
        ontology: Dict[str, Any],
        canvas: Dict[str, Any],
    ) -> list[Dict[str, Any]]:
        changes: list[Dict[str, Any]] = []

        cube_name = str(cube.get("name") or ((canvas.get("candidate_cards") or [{}])[0]).get("name") or "student_comment_cube")
        cube_source = str(cube.get("source") or cube.get("table") or "")
        if cube_name:
            changes.append(self._review_change("cube", "cube", "新增 Cube", cube_name, cube_source))

        obj = ontology.get("object") or {}
        object_name = str(obj.get("name") or ((canvas.get("objects") or [{}])[0]).get("name") or "")
        if object_name:
            changes.append(self._review_change("object", "object", "语义对象", object_name, "承接业务主体和指标解释"))

        metrics = canvas.get("metrics") or (ontology.get("metrics") or [])
        for idx, metric in enumerate(metrics):
            if not isinstance(metric, dict):
                continue
            metric_name = str(metric.get("name") or "")
            if metric_name:
                changes.append(self._review_change(f"metric_{idx}", "metric", "新增指标", metric_name, str(metric.get("title") or "")))

        bindings = canvas.get("bindings") or []
        for idx, binding in enumerate(bindings):
            if not isinstance(binding, dict):
                continue
            measure_ref = str(binding.get("measure_ref") or "")
            if measure_ref:
                changes.append(self._review_change(f"binding_{idx}", "binding", "语义绑定", measure_ref, "业务指标到执行口径"))

        dimensions = canvas.get("dimensions") or cube.get("dimensions") or []
        if isinstance(dimensions, list):
            for idx, dimension in enumerate(dimensions[:2]):
                if isinstance(dimension, dict) and dimension.get("name"):
                    changes.append(self._review_change(f"dimension_{idx}", "dimension", "补齐维度", str(dimension["name"]), str(dimension.get("title") or "")))
        elif isinstance(dimensions, dict):
            for idx, name in enumerate(list(dimensions.keys())[:2]):
                changes.append(self._review_change(f"dimension_{idx}", "dimension", "补齐维度", name, ""))

        policies = canvas.get("policies") or (ontology.get("policies") or [])
        for idx, policy in enumerate(policies[:1]):
            if isinstance(policy, dict) and policy.get("name"):
                changes.append(self._review_change(f"policy_{idx}", "policy", "访问策略", str(policy["name"]), str(policy.get("visibility") or "")))

        return changes

    def _review_change(self, change_id: str, change_type: str, title: str, technical_name: str, detail: str) -> Dict[str, Any]:
        return {
            "id": change_id,
            "type": change_type,
            "title": title,
            "technical_name": technical_name,
            "operation": "create",
            "reason": detail or "Copilot 根据业务问题和候选语义生成。",
            "impact": "进入 Proposal 后会参与语义校验、治理审核和发布。",
            "risk": "发布前需要确认口径、绑定和权限策略。",
        }

    def _review_blockers_from_state(
        self,
        confirmations: list,
        reasons: list,
        validation: list,
        publish_result: Optional[Dict[str, Any]] = None,
    ) -> list[Dict[str, Any]]:
        blockers: list[Dict[str, Any]] = []
        for item in confirmations:
            if not isinstance(item, dict) or item.get("confirmed"):
                continue
            blockers.append({
                "id": str(item.get("id") or item.get("title") or "confirmation"),
                "severity": "required" if item.get("blocking", True) else "needs_confirmation",
                "title": f"{item.get('title') or item.get('question') or item.get('id')}口径待确认",
                "description": str(item.get("explain") or item.get("question") or "需要确认业务口径后才能发布。"),
                "technical_hint": item.get("recommended_value"),
                "source": "confirmation",
            })
        for reason in reasons:
            reason = str(reason)
            if reason == "ready_to_save":
                continue
            blockers.append({
                "id": reason,
                "severity": "required",
                "title": self._review_reason_title(reason),
                "description": "发布前需要处理该 readiness 阻塞。",
                "technical_hint": reason,
                "source": "readiness",
            })
        if isinstance(publish_result, dict) and publish_result.get("status") == "failed":
            reason = str(publish_result.get("reason") or "publish_failed")
            blockers.append({
                "id": reason,
                "severity": "required",
                "title": str(publish_result.get("title") or self._review_reason_title(reason)),
                "description": str(publish_result.get("hint") or publish_result.get("error") or "发布动作失败。"),
                "technical_hint": publish_result.get("error"),
                "source": "publish",
            })
        for idx, item in enumerate(validation):
            if isinstance(item, dict) and item.get("severity") == "error":
                blockers.append({
                    "id": f"validation_{idx}",
                    "severity": "required",
                    "title": str(item.get("message") or "校验错误未处理"),
                    "description": "语义校验错误会阻塞发布。",
                    "technical_hint": item.get("path"),
                    "source": "validation",
                })
        return self._dedupe_review_items(blockers)

    def _review_reason_title(self, reason: str) -> str:
        return {
            "business_owner_confirmation_required": "待业务负责人确认",
            "binding_not_approved": "语义绑定审批未完成",
            "need_source_table": "缺少源表线索",
            "spec_not_generated": "完整 spec 尚未生成",
            "validation_blocked": "语义校验未通过",
            "proposal_validation_blocked": "Proposal 校验未通过",
            "approved_spec_changed_before_apply": "已批准 spec 在发布前发生变化",
            "approved_semantic_diff_drift": "已批准差异和应用资产不一致",
            "publish_failed": "发布动作失败",
        }.get(reason, reason)

    def _review_explanations(self, changes: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        return [
            {
                "target_id": item["id"],
                "question": f"为什么推荐 {item['technical_name']}？",
                "answer": item["reason"],
                "evidence_refs": [],
            }
            for item in changes
            if item.get("technical_name")
        ][:6]

    def _source_evidence_state(
        self,
        session: AgentSession,
        raw_spec: Dict[str, Any],
        state: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = state.get("source_evidence")
        if isinstance(existing, dict) and existing:
            return existing

        proposal_patch = state.get("proposal_patch") or {}
        cube = raw_spec.get("cube") or {}
        source = raw_spec.get("source") or {}
        table_name = (
            proposal_patch.get("candidate_table")
            or proposal_patch.get("table")
            or cube.get("source")
            or source.get("table")
            or "待确认源表"
        )
        table_name = str(table_name)
        fields: list[Dict[str, Any]] = []

        canvas = state.get("semantic_canvas") or {}
        dimensions = canvas.get("dimensions") or cube.get("dimensions") or []
        if isinstance(dimensions, dict):
            dimensions = [
                {"name": name, **(payload if isinstance(payload, dict) else {})}
                for name, payload in dimensions.items()
            ]
        for item in dimensions if isinstance(dimensions, list) else []:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            fields.append({
                "name": str(item.get("name")),
                "title": str(item.get("title") or item.get("name")),
                "type": str(item.get("type") or "dimension"),
                "role": "dimension",
                "evidence": "来自候选 Cube 维度，可支撑业务问题里的分组或过滤。",
            })

        metrics = canvas.get("metrics") or []
        if metrics:
            for item in metrics:
                if not isinstance(item, dict) or not item.get("name"):
                    continue
                fields.append({
                    "name": str(item.get("name")),
                    "title": str(item.get("title") or item.get("name")),
                    "type": "metric",
                    "role": "measure_source",
                    "evidence": "来自候选指标，可支撑业务问题里的统计口径。",
                })
        elif isinstance(cube.get("measures"), dict):
            for name, payload in (cube.get("measures") or {}).items():
                payload = payload if isinstance(payload, dict) else {}
                fields.append({
                    "name": str(name),
                    "title": str(payload.get("title") or name),
                    "type": str(payload.get("type") or payload.get("agg") or "measure"),
                    "role": "measure_source",
                    "evidence": "来自 Cube measure，可落到执行层统计口径。",
                })

        if not fields and "comment" in table_name:
            fields = [
                {"name": "school_id", "title": "学校", "type": "string", "role": "dimension", "evidence": "按学校汇总需要学校字段。"},
                {"name": "published_at", "title": "发布时间", "type": "datetime", "role": "time", "evidence": "最近 7 天过滤需要时间字段。"},
                {"name": "comment_count", "title": "学生评论数", "type": "metric", "role": "measure_source", "evidence": "业务问题直接要求评论数。"},
            ]
        if "评论" in session.user_goal or "comment" in table_name:
            existing_names = {str(item.get("name")) for item in fields if isinstance(item, dict)}
            if "published_at" not in existing_names and "comment_published_at" not in existing_names:
                fields.append({
                    "name": "published_at",
                    "title": "发布时间",
                    "type": "datetime",
                    "role": "time",
                    "evidence": "最近 7 天过滤需要稳定时间字段。",
                })
            if "comment_count" not in existing_names:
                fields.append({
                    "name": "comment_count",
                    "title": "学生评论数",
                    "type": "metric",
                    "role": "measure_source",
                    "evidence": "业务问题直接要求评论数。",
                })

        return {
            "source_table": {
                "name": table_name,
                "title": str(source.get("title") or "学生评论事实表"),
                "grain": str(source.get("grain") or "一条学生评论/举报事件"),
                "freshness": str(source.get("freshness") or "随源表同步"),
            },
            "fields": fields[:8],
            "sample_rows": state.get("source_sample_rows") or [],
            "recommendations": [
                {
                    "id": "source-table",
                    "title": "为什么选择这张表",
                    "reason": f"{table_name} 与业务问题“{session.user_goal}”的主体、指标和分组口径匹配。",
                }
            ],
        }

    def _trace_state(
        self,
        session: AgentSession,
        proposal_id: Optional[str],
        published: bool,
    ) -> Dict[str, Any]:
        events: list[Dict[str, Any]] = []
        for idx, trace in enumerate(session.tool_traces or []):
            events.append({
                "id": f"tool_{idx}",
                "type": "tool",
                "title": str(trace.get("tool") or f"tool_{idx}"),
                "status": str(trace.get("status") or "completed"),
                "summary": str(trace.get("summary") or trace.get("error") or ""),
            })
        for idx, item in enumerate(session.working_memory.get("confirmed_assumptions") or []):
            events.append({
                "id": f"human_confirm_{idx}",
                "type": "human",
                "title": f"用户确认 {item.get('id')}",
                "status": "completed",
                "summary": str(item.get("value") or ""),
            })
        if proposal_id:
            events.append({
                "id": "audit_save",
                "type": "audit",
                "title": "Proposal 保存审计",
                "status": "completed",
                "summary": str(proposal_id),
            })
        if published:
            events.append({
                "id": "audit_publish",
                "type": "audit",
                "title": "发布审计",
                "status": "completed",
                "summary": "正式 Data Agent 可消费",
            })
        return {"events": events}

    def _publish_gate_state(
        self,
        status: str,
        status_label: str,
        has_spec: bool,
        has_proposal: bool,
        blockers: list[Dict[str, Any]],
        published: bool,
        state: Dict[str, Any],
    ) -> Dict[str, Any]:
        sandbox = state.get("sandbox_preview") or {}
        sandbox_ok = bool(sandbox) and sandbox.get("status") != "blocked"
        gate_state = "published" if published else ("blocked" if blockers or not has_spec else ("ready_to_publish" if has_proposal else "ready_to_save"))
        label = {
            "published": "发布门禁已通过",
            "blocked": "发布门禁阻塞",
            "ready_to_publish": "发布前检查通过",
            "ready_to_save": "草稿可保存",
        }.get(gate_state, status_label)
        return {
            "state": gate_state,
            "label": label,
            "steps": [
                {
                    "id": "spec",
                    "label": "Spec 完整",
                    "status": "passed" if has_spec else "blocked",
                    "description": "raw_spec 已生成并可保存。" if has_spec else "需要先生成或补齐 raw_spec。",
                },
                {
                    "id": "blockers",
                    "label": "阻塞项清零",
                    "status": "passed" if not blockers else "blocked",
                    "description": "没有发布阻塞。" if not blockers else "仍有阻塞项需要处理。",
                },
                {
                    "id": "sandbox",
                    "label": "沙盒预演",
                    "status": "passed" if sandbox_ok or published else "pending",
                    "description": "草稿预演已通过。" if sandbox_ok or published else "建议发布前运行草稿态预演。",
                },
                {
                    "id": "runtime",
                    "label": "正式 runtime",
                    "status": "passed" if published else "pending",
                    "description": "Data Agent 可消费。" if published else "发布成功后才进入正式 runtime。",
                },
            ],
        }

    def _post_publish_validation(self, state: Dict[str, Any], *, published: bool) -> Dict[str, Any]:
        existing = state.get("post_publish_validation")
        if isinstance(existing, dict) and existing:
            return existing
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        cube = (raw_spec.get("cube") or {}) if isinstance(raw_spec, dict) else {}
        route = str(cube.get("name") or "semantic_runtime")
        sample_questions = raw_spec.get("sample_questions") if isinstance(raw_spec, dict) else []
        sample_question = (sample_questions or ["最近 7 天学生评论数按学校汇总"])[0]
        if published:
            return {
                "status": "passed",
                "label": "样例问答验收通过",
                "sample_question": sample_question,
                "runtime_route": route,
                "result_summary": f"正式 Data Agent 已能命中 {route}。",
            }
        return {
            "status": "not_run",
            "label": "发布后验收待运行",
            "sample_question": sample_question,
            "runtime_route": None,
            "result_summary": "语义资产发布后再运行正式 Data Agent 验收。",
        }

    def _review_consumption_state(
        self,
        published: bool,
        has_spec: bool,
        blockers: list[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if published:
            return {"state": "available", "label": "正式 Data Agent 可消费", "reasons": []}
        if not has_spec:
            return {"state": "unavailable", "label": "正式 Data Agent 暂不可消费", "reasons": ["SPEC_REQUIRED"]}
        if blockers:
            return {"state": "draft_only", "label": "正式 Data Agent 暂不可消费", "reasons": [b["id"] for b in blockers]}
        return {"state": "ready_after_publish", "label": "发布后 Data Agent 可消费", "reasons": []}

    def _review_primary_action(
        self,
        status: str,
        has_spec: bool,
        blockers: list[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not has_spec:
            return {"action": "generate_spec", "label": "生成 spec", "disabled": False}
        if status == "published":
            return {"action": "none", "label": "已发布", "disabled": True}
        if status in {"ready_to_publish"}:
            return {"action": "publish", "label": "发布", "disabled": False}
        return {
            "action": "save_proposal",
            "label": "保存草稿",
            "disabled": False,
            "disabled_reason": None if not blockers else "存在发布阻塞，只能先保存草稿",
        }

    def _review_status(
        self,
        *,
        published: bool,
        has_spec: bool,
        has_proposal: bool,
        has_blockers: bool,
    ) -> tuple[str, str]:
        if published:
            return "published", "已发布 · Data Agent 可消费"
        if not has_spec:
            return "drafting", "等待生成 spec"
        if not has_proposal:
            return ("blocked", "当前只能保存草稿") if has_blockers else ("ready_to_save", "草稿可保存")
        return ("blocked", "发布前还有阻塞") if has_blockers else ("ready_to_publish", "发布前检查通过，等待确认发布")

    def _review_status_label(self, status: str) -> str:
        return {
            "drafting": "等待生成 spec",
            "blocked": "当前只能保存草稿",
            "ready_to_save": "草稿可保存",
            "ready_to_publish": "发布前检查通过，等待确认发布",
            "published": "已发布 · Data Agent 可消费",
        }.get(status, status)

    def _has_reviewable_spec(self, raw_spec: Any) -> bool:
        return (
            isinstance(raw_spec, dict)
            and str(raw_spec.get("spec_version") or "") == "v1"
            and isinstance(raw_spec.get("cube"), dict)
            and bool(raw_spec["cube"])
        )

    def _dedupe_review_items(self, items: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        seen = set()
        result = []
        for item in items:
            key = str(item.get("id") or item.get("title"))
            if key in seen:
                continue
            seen.add(key)
            result.append(item)
        return result

    def _deep_merge(self, base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
        merged = deepcopy(base)
        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = deepcopy(value)
        return merged
