"""建模 Copilot 对话轮次服务。

持有 runtime（agent_app）与工具注册表，负责 send_message / confirm /
update_spec / sandbox / accept_cube_draft 以及 Codex review / repair run 的提交。
"""
from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any, Dict, Optional

from app.application.semantic.copilot_review_projection import review_blockers_from_state
from app.application.semantic.copilot_service_base import CopilotServiceBase
from app.application.semantic.modeling_spec_repair import has_reviewable_spec, repair_modeling_spec
from app.application.semantic.semantic_modeling_agent_app import SemanticModelingChatOutput
from app.application.semantic.source_candidate_recall_service import SourceCandidateRecallService
from app.domain.semantic.modeling_agent_session import AgentSession


class CopilotTurnService(CopilotServiceBase):
    """对话轮次推进与确定性状态动作。"""

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
        if not self._is_duplicate_user_turn(session, message):
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
        result = self._agent_app.run_chat(
            session=session,
            user_message=message,
            request_payload=payload,
        )
        self._apply_agent_result(session, result)
        session.add_message(role="assistant", content=result.message)
        self._save_session(session)
        return self._dump(session)

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
                "请在对话里补充源表或让 AI 建模助手重新生成。"
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
        state["agent_message"] = "已完成草稿态沙盒预演，不会写入语义中心发布快照。"
        session.workbench_state = state
        session.add_message(role="assistant", content=state["agent_message"])
        self._save_session(session)
        return self._dump(session)

    # ------------------------------------------------------------------
    # Codex review / repair run（runtime 提交，只记录生命周期元数据）
    # ------------------------------------------------------------------

    def start_review_run(
        self,
        session_id: str,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """启动 Codex Proposal Review run，只记录生命周期元数据，不应用输出。"""
        session = self._require(session_id)
        self._authorize(session, principal_id)
        proposal_id = str(
            session.current_proposal_id
            or (session.workbench_state.get("advanced_refs") or {}).get("proposal_id")
            or ""
        ).strip()
        if not proposal_id:
            raise ValueError("当前会话还没有可 review 的 Proposal")
        effective_principal_id = session.principal_id or principal_id
        idempotency_key = self._review_run_idempotency_key(session.id, proposal_id)
        existing_run = self._active_existing_codex_run(
            session.workbench_state.get("codex_review_run"),
            action="semantic.modeling.review_proposal",
            idempotency_key=idempotency_key,
            proposal_id=proposal_id,
        )
        if existing_run is not None:
            return self._dump(session)

        run = self._agent_app.start_review_proposal(
            session=session,
            proposal_id=proposal_id,
            principal_id=effective_principal_id,
            idempotency_key=idempotency_key,
        )
        metadata = self._codex_run_metadata(
            run,
            action="semantic.modeling.review_proposal",
            session_id=session.id,
            proposal_id=proposal_id,
            idempotency_key=idempotency_key,
        )
        state = deepcopy(session.workbench_state or {})
        state["codex_review_run"] = metadata
        state["advanced_refs"] = {
            **(state.get("advanced_refs") or {}),
            "codex_review_run_id": metadata.get("run_id"),
        }
        session.workbench_state = state
        session.record_event(
            "runtime_action",
            actor=effective_principal_id,
            action="semantic.modeling.review_proposal",
            payload={"run_id": metadata.get("run_id"), "status": metadata.get("status")},
        )
        self._save_runtime_action_session(session, metadata)
        return self._dump(session)

    def start_repair_run(
        self,
        session_id: str,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """启动 Codex validation repair run，只记录生命周期元数据，不应用输出。"""
        session = self._require(session_id)
        self._authorize(session, principal_id)
        state = session.workbench_state or {}
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        validation_summary = state.get("validation_summary") or []
        has_validation_error = any(
            isinstance(item, dict) and item.get("severity") == "error"
            for item in validation_summary
        )
        if not raw_spec or not has_validation_error:
            raise ValueError("当前会话没有可修复的校验失败上下文")
        effective_principal_id = session.principal_id or principal_id
        idempotency_key = self._repair_run_idempotency_key(session.id, raw_spec, validation_summary)
        existing_run = self._active_existing_codex_run(
            state.get("codex_repair_run"),
            action="semantic.modeling.repair_validation_failure",
            idempotency_key=idempotency_key,
        )
        if existing_run is not None:
            return self._dump(session)

        run = self._agent_app.start_repair_validation_failure(
            session=session,
            principal_id=effective_principal_id,
            idempotency_key=idempotency_key,
        )
        metadata = self._codex_run_metadata(
            run,
            action="semantic.modeling.repair_validation_failure",
            session_id=session.id,
            idempotency_key=idempotency_key,
        )
        next_state = deepcopy(state)
        next_state["codex_repair_run"] = metadata
        next_state["advanced_refs"] = {
            **(next_state.get("advanced_refs") or {}),
            "codex_repair_run_id": metadata.get("run_id"),
        }
        session.workbench_state = next_state
        session.record_event(
            "runtime_action",
            actor=effective_principal_id,
            action="semantic.modeling.repair_validation_failure",
            payload={"run_id": metadata.get("run_id"), "status": metadata.get("status")},
        )
        self._save_runtime_action_session(session, metadata)
        return self._dump(session)

    # ------------------------------------------------------------------
    # 确定性 Chat 动作
    # ------------------------------------------------------------------

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
                message_text = (
                    f"已按推荐值确认 {len(confirmations)} 项口径，并已生成可审阅 spec。"
                    "你可以继续沙盒预演，或应用语义保存 Proposal。"
                )
                binding_hint = self._binding_suggestion_hint(state)
                if binding_hint:
                    message_text = f"{message_text}\n{binding_hint}"
                state["agent_message"] = message_text
            elif spec_status == "failed":
                state["agent_message"] = (
                    f"已按推荐值确认 {len(confirmations)} 项口径，但 spec 生成失败。"
                    "请在对话里补充源表或让 AI 建模助手重新生成。"
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
        if state.get("source_candidates"):
            message_text = "已从建模工作台带入候选数据来源。请先确认来源，我会基于它生成可审阅 spec。"
            state["agent_message"] = message_text
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
            session.workbench_state = state
            self._append_tool_trace(session, {
                "tool": "rank_candidate_assets",
                "status": "skipped",
                "summary": "已存在工作台候选来源，跳过重新召回",
            })
            self._append_tool_trace(session, {
                "tool": "generate_semantic_draft",
                "status": "skipped",
                "summary": "等待确认工作台候选来源",
            })
            return message_text

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
            return "我还没有可确认的数据来源候选。请先告诉我源表/数据集，或重新让 AI 建模助手检索候选来源。"

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
        if isinstance(candidate.get("asset_ref"), dict):
            proposal_patch["asset_ref"] = deepcopy(candidate["asset_ref"])
        if isinstance(candidate.get("evidence_bundle"), dict):
            proposal_patch["evidence_bundle"] = deepcopy(candidate["evidence_bundle"])
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
            message_text = (
                f"已使用 {proposal_patch.get('candidate_table')} 生成可审阅 spec。"
                "你可以继续沙盒预演，或应用语义保存 Proposal。"
            )
            binding_hint = self._binding_suggestion_hint(state)
            if binding_hint:
                message_text = f"{message_text}\n{binding_hint}"
            state["agent_message"] = message_text
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
        for blocker in review_blockers_from_state(
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

    # ------------------------------------------------------------------
    # runtime 结果回写
    # ------------------------------------------------------------------

    def _apply_agent_result(self, session: AgentSession, result: SemanticModelingChatOutput) -> None:
        state = deepcopy(session.workbench_state)
        state = self._deep_merge(state, self._sanitize_agent_workbench_patch(result.workbench_state_patch))
        if has_reviewable_spec(state.get("raw_spec")):
            state["raw_spec"] = repair_modeling_spec(
                state["raw_spec"],
                user_goal=session.user_goal,
                source_mode=str((state.get("proposal_patch") or {}).get("source_mode") or "agent_led"),
            )
        if result.proposal_patch:
            sanitized_proposal_patch = self._sanitize_agent_proposal_patch(result.proposal_patch)
            if sanitized_proposal_patch:
                state["proposal_patch"] = self._deep_merge(
                    state.get("proposal_patch") or {},
                    sanitized_proposal_patch,
                )
        if result.required_confirmations:
            state["required_confirmations"] = result.required_confirmations
        if result.suggested_actions:
            state["suggested_actions"] = result.suggested_actions
        state["agent_message"] = result.message
        self._reconcile_agent_workbench_state(session, state)
        session.workbench_state = state
        session.tool_traces.extend(result.tool_traces)

    @staticmethod
    def _sanitize_agent_workbench_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
        """LLM 只能写草稿态工作台，不能伪造服务端治理动作结果。"""
        if not isinstance(patch, dict):
            return {}
        allowed_keys = {
            "agent_message",
            "semantic_canvas",
            "candidate_cards",
            "source_candidates",
            "evidence_summary",
            "validation_summary",
            "suggested_actions",
            "raw_spec",
            "proposal_patch",
            "advanced_refs",
        }
        sanitized = {
            key: deepcopy(value)
            for key, value in patch.items()
            if key in allowed_keys
        }
        proposal_patch = sanitized.get("proposal_patch")
        if isinstance(proposal_patch, dict):
            proposal_patch = CopilotTurnService._sanitize_agent_proposal_patch(proposal_patch)
            if proposal_patch:
                sanitized["proposal_patch"] = proposal_patch
            else:
                sanitized.pop("proposal_patch", None)
        else:
            sanitized.pop("proposal_patch", None)
        advanced_refs = sanitized.get("advanced_refs")
        if isinstance(advanced_refs, dict):
            allowed_ref_keys = {
                "candidate_source_table",
                "need_source_table",
                "source_candidates_available",
            }
            advanced_refs = {
                key: deepcopy(value)
                for key, value in advanced_refs.items()
                if key in allowed_ref_keys
            }
            sanitized["advanced_refs"] = advanced_refs
        else:
            sanitized.pop("advanced_refs", None)
        return sanitized

    def _reconcile_agent_workbench_state(self, session: AgentSession, state: Dict[str, Any]) -> None:
        """根据服务端可验证草稿线索重算 runtime 不可直接写入的治理状态。"""
        raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
        if has_reviewable_spec(raw_spec):
            self._mark_spec_available(session, state)
            if state.get("required_confirmations"):
                readiness = dict(state.get("readiness") or {})
                readiness["canonical_ready"] = bool((state.get("publish_result") or {}).get("status") == "published")
                readiness["exploratory_ready"] = True
                reasons = [
                    str(reason)
                    for reason in (readiness.get("reasons") or [])
                    if str(reason) not in {"ready_to_save", "session_created"}
                ]
                if "business_owner_confirmation_required" not in reasons:
                    reasons.append("business_owner_confirmation_required")
                readiness["reasons"] = reasons
                state["readiness"] = readiness
            return

        if state.get("source_candidates"):
            self._mark_spec_missing(state, "source_candidate_confirmation_required")
            state["advanced_refs"] = {
                **(state.get("advanced_refs") or {}),
                "source_candidates_available": True,
            }
            return

        proposal_patch = state.get("proposal_patch") if isinstance(state.get("proposal_patch"), dict) else {}
        advanced_refs = state.get("advanced_refs") if isinstance(state.get("advanced_refs"), dict) else {}
        if proposal_patch.get("need_source_table") or advanced_refs.get("need_source_table"):
            self._mark_spec_missing(state, "need_source_table")

    @staticmethod
    def _sanitize_agent_proposal_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
        """Runtime 只能提供候选线索，不能写入治理归属或服务端状态字段。"""
        if not isinstance(patch, dict):
            return {}
        allowed_keys = {
            "user_question",
            "candidate_source_table",
            "candidate_table",
            "business_context",
            "business_subject",
            "notes",
            "confidence",
            "candidate_bindings",
            "candidate_metrics",
            "candidate_dimensions",
            "candidate_objects",
            "intent_summary",
            "clarifying_question",
            "need_source_table",
            "assumptions",
        }
        return {
            key: deepcopy(value)
            for key, value in patch.items()
            if key in allowed_keys
        }

    @staticmethod
    def _is_duplicate_user_turn(session: AgentSession, message: str) -> bool:
        if not session.conversation:
            return False
        last = session.conversation[-1]
        return last.role == "user" and last.content.strip() == message.strip()

    # ------------------------------------------------------------------
    # Codex run 元数据
    # ------------------------------------------------------------------

    def _codex_run_metadata(
        self,
        run: Dict[str, Any],
        *,
        action: str,
        session_id: str,
        idempotency_key: str,
        proposal_id: str | None = None,
    ) -> Dict[str, Any]:
        metadata = {
            "run_id": run.get("run_id"),
            "provider_run_id": run.get("provider_run_id"),
            "status": run.get("status"),
            "action": action,
            "session_id": session_id,
            "proposal_id": proposal_id,
            "idempotency_key": idempotency_key,
        }
        return {key: value for key, value in metadata.items() if value is not None}

    def _save_runtime_action_session(
        self,
        session: AgentSession,
        metadata: Dict[str, Any],
    ) -> None:
        try:
            self._save_session(session)
        except Exception:
            self._logger.exception(
                "semantic codex runtime action submitted but session save failed",
                extra={
                    "run_id": metadata.get("run_id"),
                    "action": metadata.get("action"),
                    "session_id": metadata.get("session_id"),
                    "idempotency_key": metadata.get("idempotency_key"),
                },
            )
            raise

    def _active_existing_codex_run(
        self,
        run: Any,
        *,
        action: str,
        idempotency_key: str,
        proposal_id: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        if not isinstance(run, dict):
            return None
        if run.get("action") != action:
            return None
        status = str(run.get("status") or "")
        if status not in {"queued", "running"}:
            return None
        existing_key = run.get("idempotency_key")
        if existing_key and existing_key != idempotency_key:
            return None
        if proposal_id is not None and run.get("proposal_id") not in {None, proposal_id}:
            return None
        return run

    def _review_run_idempotency_key(self, session_id: str, proposal_id: str) -> str:
        return f"semantic.modeling.review_proposal:{session_id}:{proposal_id}"

    def _repair_run_idempotency_key(
        self,
        session_id: str,
        raw_spec: Dict[str, Any],
        validation_summary: Any,
    ) -> str:
        payload = {
            "raw_spec": raw_spec,
            "validation_summary": validation_summary,
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        ).hexdigest()[:16]
        return f"semantic.modeling.repair_validation_failure:{session_id}:{digest}"
