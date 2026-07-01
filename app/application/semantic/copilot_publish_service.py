"""建模 Copilot Proposal 保存与发布服务。

持有 proposal_service（治理链路）与 release preview 服务，
负责 save_proposal / publish_proposal / preview_release / get_review。
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

from app.application.semantic.copilot_review_projection import (
    post_publish_validation,
    review_from_gap_view,
    review_from_session,
)
from app.application.semantic.copilot_service_base import CopilotServiceBase
from app.application.semantic.modeling_spec_repair import repair_modeling_spec
from app.domain.semantic.modeling_agent_session import AgentSession


class CopilotPublishService(CopilotServiceBase):
    """Proposal 保存、发布与 review 只读视图。"""

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
                return review_from_gap_view(session, gap_view)
            except Exception:
                # Proposal 视图不可用时保守回落到 session 视图，保证 Chat 不被阻断。
                pass

        return review_from_session(session)

    def preview_release(
        self,
        session_id: str,
        payload: Optional[Dict[str, Any]] = None,
        *,
        principal_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """基于当前 session raw_spec 生成发布前只读校验预演，不发布、不应用资产。"""
        session = self._require(session_id)
        self._authorize(session, principal_id)
        self._hydrate_session_spec(session)
        state = deepcopy(session.workbench_state)
        raw_spec = state.get("raw_spec")
        if not self._has_reviewable_spec(raw_spec):
            raise ValueError("缺少可校验的语义 Spec")
        if self._release_preview_service is None:
            raise ValueError("release preview service 未配置")

        payload_dict = dict(payload or {})
        previous_spec = payload_dict.get("previous_spec")
        preview = self._release_preview_service.preview(
            session_id=session.id,
            namespace=str(payload_dict.get("namespace") or "default"),
            spec=deepcopy(raw_spec),
            previous_spec=deepcopy(previous_spec) if isinstance(previous_spec, dict) else None,
            sample_questions=self._release_preview_sample_questions(
                payload_dict.get("sample_questions")
            ),
            viewer_roles=self._release_preview_viewer_roles(
                payload_dict.get("viewer_roles")
            ),
        )
        state["release_preview"] = preview
        state["agent_message"] = "已生成发布前校验预演，发布目标为语义中心。"
        session.workbench_state = state
        session.add_message(role="assistant", content=state["agent_message"])
        session.record_event(
            "session_action",
            actor=principal_id,
            action="preview_release",
            payload={
                "namespace": preview.get("namespace"),
                "gateway_status": (preview.get("gateway_validation") or {}).get("status"),
            },
        )
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
            raise ValueError("SPEC_REQUIRED: 当前会话还没有可保存、可校验的 raw_spec，请先让 AI 建模助手生成 spec 或在右侧 Spec 面板补齐。")
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
            "comment": body.get("comment") or "AI 建模助手一键发布",
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
        state["post_publish_validation"] = post_publish_validation(state, published=True)
        state["readiness"] = {
            "canonical_ready": True,
            "exploratory_ready": True,
            "reasons": [],
        }
        state["agent_message"] = (
            f"语义 {proposal_id} 已发布到语义中心。Cube 与轻本体锚定已进入发布快照；"
            "Data Agent、BI、数据分析等消费者可基于同一快照继续验证。"
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

    # ------------------------------------------------------------------
    # 发布失败与辅助
    # ------------------------------------------------------------------

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
        state["post_publish_validation"] = post_publish_validation(state, published=False)
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
        if "数据源不存在" in message or "未绑定 source_id" in message:
            return {
                "id": "yaml_datasource_unresolved",
                "title": "Cube 未能解析到真实数据源",
                "hint": "请确认 spec.cube.source_id 指向的数据源仍然存在且未被禁用，再重新应用语义并发布。",
            }
        if "不支持的 Cube 状态" in message or "Cube 必须绑定 source_id" in message:
            return {
                "id": "yaml_cube_precondition_failed",
                "title": "Cube 建模前置条件不满足",
                "hint": "请检查 spec.cube 的 status/source_id 是否符合要求，修正后重新应用语义并发布。",
            }
        if "认证指标发布失败" in message:
            return {
                "id": "yaml_certified_measure_unlinked",
                "title": "认证指标未关联业务指标",
                "hint": "请先在 Ontology 里把提示中的 Measure 关联到对应 BusinessMetric，再重新应用语义并发布。",
            }
        if "未找到 Cube" in message:
            return {
                "id": "yaml_cube_missing",
                "title": "YAML 仓储中尚未生成对应 Cube",
                "hint": "请先重新执行一次「应用」步骤生成 Cube 定义，确认成功后再确认发布。",
            }
        return {
            "id": "publish_failed",
            "title": "发布动作失败",
            "hint": "请先根据错误修正 spec 或重新应用语义，然后再确认发布。",
        }

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
                "description": "在草稿态验证发布快照候选，不写入语义中心。",
                "proposal_id": proposal_id,
            },
            {
                "id": "continue_modeling",
                "title": "继续补充",
                "description": "追加口径、角色、敏感等级或候选线索",
                "proposal_id": proposal_id,
            },
        ]

    def _release_preview_sample_questions(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            question = value.strip()
            return [question] if question else []
        if isinstance(value, dict):
            return []
        if isinstance(value, (list, tuple, set)):
            return [
                question
                for question in (str(item).strip() for item in value)
                if question
            ]
        return []

    def _release_preview_viewer_roles(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            values = value.split(",")
        elif isinstance(value, (list, tuple, set)):
            values = value
        else:
            return []
        result: list[str] = []
        for item in values:
            role = str(item).strip()
            if role and role not in result:
                result.append(role)
        return result
