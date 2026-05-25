"""语义建模 Copilot 的确定性工具层。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, TYPE_CHECKING

from app.domain.semantic.modeling_agent_session import AgentSession

if TYPE_CHECKING:
    from app.application.semantic.modeling_draft_builder import SemanticModelDraftBuilder


class ModelingToolRegistry:
    """为建模 Agent 暴露可审计、可测试的确定性工具。"""

    def __init__(
        self,
        *,
        builder: "SemanticModelDraftBuilder",
        readiness_checker: Any,
        source_candidate_recall_service: Any = None,
    ):
        self._builder = builder
        self._readiness_checker = readiness_checker
        self._source_candidate_recall_service = source_candidate_recall_service

    def execute(self, tool_name: str, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        handler = getattr(self, f"_tool_{tool_name}", None)
        if not callable(handler):
            return {"error": f"未知建模工具: {tool_name}"}
        try:
            return handler(arguments, context)
        except Exception as exc:
            return {"error": f"建模工具执行失败: {str(exc)}", "tool": tool_name}

    def bootstrap(self, *, session: AgentSession, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """确定性 fallback：用于本地、测试和未配置模型时的冷启动体验。"""
        tool_context = {**context, "session": session.model_dump(mode="json")}
        ontology = self.execute("search_ontology", {"query": user_message}, tool_context)
        cubes = self.execute("search_cube", {"query": user_message}, tool_context)
        assets = self.execute("rank_candidate_assets", {"query": user_message}, tool_context)
        if self._source_candidate_recall_service is not None:
            source_candidates = assets.get("source_candidates") or assets.get("candidates") or []
            if source_candidates:
                candidate_cards = self._candidate_cards(user_message, assets)
                readiness = {
                    "canonical_ready": False,
                    "exploratory_ready": False,
                    "reasons": ["source_candidate_confirmation_required", "spec_not_generated"],
                }
                proposal_patch = {
                    "source_mode": "agent_led",
                    "source_kind": session.entry_type,
                    "user_question": user_message or session.user_goal,
                    "business_subject": self._subject_from_text(f"{session.user_goal} {user_message}"),
                    "candidate_assets": source_candidates,
                }
                message = "我找到了候选数据来源。请先在 Chat 中选择一项，确认后我会生成可审阅 spec。"
                return {
                    "message": message,
                    "workbench_state_patch": {
                        "agent_message": message,
                        "semantic_canvas": self._semantic_canvas({}, user_message),
                        "candidate_cards": candidate_cards,
                        "source_candidates": source_candidates,
                        "required_confirmations": [],
                        "evidence_summary": [],
                        "validation_summary": [],
                        "readiness": readiness,
                        "suggested_actions": ["confirm_source_candidate"],
                        "proposal_patch": proposal_patch,
                        "proposal_summary": {"status": "source_candidate"},
                        "advanced_refs": {
                            "proposal_id": session.current_proposal_id,
                            "spec_available": False,
                            "source_candidates_available": True,
                            "trace_available": True,
                        },
                        "raw_spec": {},
                    },
                    "proposal_patch": proposal_patch,
                    "required_confirmations": [],
                    "suggested_actions": ["confirm_source_candidate"],
                    "tool_traces": [
                        {"tool": "search_ontology", "status": "completed", "summary": ontology.get("summary")},
                        {"tool": "search_cube", "status": "completed", "summary": cubes.get("summary")},
                        {"tool": "rank_candidate_assets", "status": "completed", "summary": assets.get("summary")},
                        {
                            "tool": "generate_semantic_draft",
                            "status": "skipped",
                            "summary": "等待用户确认候选数据来源",
                        },
                    ],
                }
            if assets.get("source_recall_state") == "no_candidate":
                message = "当前还缺少可生成 spec 的源表或数据集。请在 Chat 里补充数据来源、指标口径、分组字段和时间字段。"
                return {
                    "message": message,
                    "workbench_state_patch": {
                        "agent_message": message,
                        "semantic_canvas": self._semantic_canvas({}, user_message),
                        "candidate_cards": [],
                        "source_candidates": [],
                        "required_confirmations": [],
                        "evidence_summary": [],
                        "validation_summary": [],
                        "readiness": {
                            "canonical_ready": False,
                            "exploratory_ready": False,
                            "reasons": ["spec_not_generated", "need_source_table"],
                        },
                        "suggested_actions": ["provide_source_table"],
                        "proposal_patch": {
                            "source_mode": "agent_led",
                            "source_kind": session.entry_type,
                            "user_question": user_message or session.user_goal,
                            "business_subject": self._subject_from_text(f"{session.user_goal} {user_message}"),
                        },
                        "proposal_summary": {"status": "need_source"},
                        "advanced_refs": {
                            "proposal_id": session.current_proposal_id,
                            "spec_available": False,
                            "need_source_table": True,
                            "trace_available": True,
                        },
                        "raw_spec": {},
                    },
                    "proposal_patch": {},
                    "required_confirmations": [],
                    "suggested_actions": ["provide_source_table"],
                    "tool_traces": [
                        {"tool": "search_ontology", "status": "completed", "summary": ontology.get("summary")},
                        {"tool": "search_cube", "status": "completed", "summary": cubes.get("summary")},
                        {"tool": "rank_candidate_assets", "status": "completed", "summary": assets.get("summary")},
                        {
                            "tool": "generate_semantic_draft",
                            "status": "skipped",
                            "summary": "缺少源表线索，跳过 spec 生成",
                        },
                    ],
                }
        draft_args = {"source_mode": "agent_led", "source_kind": session.entry_type}
        candidate_source = self._candidate_source_from_assets(assets)
        candidate_table = str(candidate_source.get("candidate_table") or candidate_source.get("table") or "")
        if candidate_source:
            draft_args.update({key: value for key, value in candidate_source.items() if key != "candidate_table"})
        if candidate_table:
            draft_args["candidate_table"] = candidate_table
            draft_args.setdefault("table", candidate_table)
        draft = self.execute("generate_semantic_draft", draft_args, tool_context)
        evidence = self.execute("build_evidence_pack", {"query": user_message}, tool_context)

        spec = draft.get("spec") or {}
        semantic_canvas = self._semantic_canvas(spec, user_message)
        proposal_patch = self._proposal_patch(session, user_message, assets, spec)
        candidate_cards = self._candidate_cards(user_message, assets)
        confirmations = self._required_confirmations(candidate_cards)

        readiness = {
            "canonical_ready": False,
            "exploratory_ready": bool(spec),
            "reasons": ["business_owner_confirmation_required", "binding_not_approved"],
        }

        return {
            "message": self._agent_message(ontology, cubes, assets, confirmations),
            "workbench_state_patch": {
                "agent_message": self._agent_message(ontology, cubes, assets, confirmations),
                "semantic_canvas": semantic_canvas,
                "candidate_cards": candidate_cards,
                "required_confirmations": confirmations,
                "evidence_summary": evidence.get("items") or [],
                "validation_summary": [],
                "readiness": readiness,
                "suggested_actions": ["confirm_candidates", "save_proposal"],
                "proposal_patch": proposal_patch,
                "proposal_summary": {
                    "status": "draft_candidate",
                    "source": "agent_session",
                },
                "advanced_refs": {
                    "proposal_id": session.current_proposal_id,
                    "spec_available": bool(spec),
                    "trace_available": True,
                },
                "raw_spec": spec,
            },
            "proposal_patch": proposal_patch,
            "required_confirmations": confirmations,
            "suggested_actions": ["confirm_candidates", "save_proposal"],
            "tool_traces": [
                {"tool": "search_ontology", "status": "completed", "summary": ontology.get("summary")},
                {"tool": "search_cube", "status": "completed", "summary": cubes.get("summary")},
                {"tool": "rank_candidate_assets", "status": "completed", "summary": assets.get("summary")},
                {"tool": "generate_semantic_draft", "status": "completed", "summary": draft.get("summary")},
                {"tool": "build_evidence_pack", "status": "completed", "summary": evidence.get("summary")},
            ],
        }

    def _tool_search_ontology(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = str(arguments.get("query") or self._session_goal(context))
        assets = self._collect_existing_semantic_assets()
        matched_objects = self._filter_assets(assets.get("objects", []), query)
        matched_metrics = self._filter_assets(assets.get("metrics", []), query)
        return {
            "summary": "已检索 active Ontology 资产",
            "objects": matched_objects,
            "metrics": matched_metrics,
            "coverage_hint": "covered" if matched_objects and matched_metrics else "gap",
        }

    def _tool_search_cube(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = str(arguments.get("query") or self._session_goal(context))
        recall = self._recall_source_candidates(query, context)
        source_candidates = recall.get("candidates") or []
        candidates = source_candidates or self._candidate_assets(query)
        return {
            "summary": "已检索候选 Cube / 物理表",
            "candidates": candidates,
            "source_candidates": source_candidates,
            "source_recall_state": recall.get("state"),
        }

    def _tool_search_binding(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = str(arguments.get("query") or self._session_goal(context))
        return {
            "summary": "已生成候选 Binding",
            "bindings": self._candidate_bindings(query),
            "binding_status": "proposed",
        }

    def _tool_search_policy(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "summary": "已应用默认治理策略",
            "policies": [
                {
                    "name": "school_scope",
                    "visibility": "restricted",
                    "reason": "学校维度与运营只读角色需要范围控制",
                }
            ],
        }

    def _tool_inspect_schema(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        table = str(arguments.get("table") or self._table_from_context(context) or "")
        if not table:
            return {"summary": "未指定物理表，跳过 schema inspect", "schema": []}
        draft = self._draft_for_context(context, {"table": table})
        cube = (draft.get("spec") or {}).get("cube") or {}
        return {
            "summary": f"已基于 {table} 生成 schema 摘要",
            "table": table,
            "dimensions": list((cube.get("dimensions") or {}).keys()),
            "measures": list((cube.get("measures") or {}).keys()),
        }

    def _tool_rank_candidate_assets(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = str(arguments.get("query") or self._session_goal(context))
        recall = self._recall_source_candidates(query, context)
        source_candidates = recall.get("candidates") or []
        candidates = source_candidates or self._candidate_assets(query)
        return {
            "summary": recall.get("summary") or "已完成候选资产排序",
            "candidates": candidates,
            "source_candidates": source_candidates,
            "source_recall_state": recall.get("state"),
            "suggested_action": recall.get("suggested_action"),
        }

    def _tool_build_evidence_pack(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = str(arguments.get("query") or self._session_goal(context))
        items = [
            {
                "id": "question-intent",
                "type": "user_goal",
                "trust_level": "P1",
                "source_uri": "agent-session://user-goal",
                "extracted_claim": query,
            },
            {
                "id": "candidate-table-student-comment",
                "type": "schema_pattern",
                "trust_level": "P2",
                "source_uri": "semantic-copilot://candidate-assets",
                "extracted_claim": "学生评论数可优先检索评论事实表与 student_comment_cube",
            },
        ]
        return {"summary": "已构建第一版证据包", "items": items}

    def _tool_generate_semantic_draft(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        payload = self._payload_from_context(context, arguments)
        result = self._builder.create_spec_draft(payload)
        return {
            "summary": "已生成构建期 SemanticModelDraft spec 草稿",
            "spec": result.get("spec") or {},
            "next_actions": result.get("next_actions") or {},
        }

    def _tool_run_validation(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        spec = self._spec_from_context(context)
        if not spec:
            return {"summary": "暂无 spec，无法运行校验", "validation": None}
        return {"summary": "已运行建模校验", "validation": self._builder.validate(spec)}

    def _tool_check_readiness(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        spec = self._spec_from_context(context)
        if not spec:
            return {"summary": "暂无 spec，canonical_ready=false", "canonical_ready": False}
        return {
            "summary": "已运行发布准备度检查",
            "readiness": self._builder.agent_ready_check(spec),
            "runtime_consumption_result": self._readiness_checker.evaluate(spec, self._builder.validate(spec)),
        }

    def _tool_sandbox_preview(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        spec = self._spec_from_context(context)
        if not spec:
            return {"summary": "暂无 spec，不能沙盒预演", "status": "blocked"}
        validation = self._builder.validate(spec)
        return {
            "summary": "已完成草稿态沙盒预演",
            "status": validation.get("status"),
            "pollutes_official_route": False,
            "sample_questions": spec.get("sample_questions") or [],
        }

    def _tool_patch_proposal(self, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "summary": "已生成 proposal patch，等待 CopilotService 保存",
            "proposal_patch": deepcopy(arguments),
        }

    def _payload_from_context(self, context: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        session = context.get("session") or {}
        goal = str(session.get("user_goal") or "")
        request_payload = (
            (session.get("workbench_state") or {}).get("proposal_patch")
            or (session.get("workbench_state") or {}).get("proposal")
            or {}
        )
        payload = {
            **request_payload,
            **arguments,
            "source_mode": request_payload.get("source_mode") or arguments.get("source_mode") or "agent_led",
            "source_kind": request_payload.get("source_kind") or arguments.get("source_kind") or session.get("entry_type") or "business_question",
            "user_question": request_payload.get("user_question") or goal,
            "business_subject": request_payload.get("business_subject") or self._subject_from_text(goal),
            "sensitivity_level": request_payload.get("sensitivity_level") or "restricted",
        }
        context_request_payload = context.get("request_payload") if isinstance(context.get("request_payload"), dict) else {}
        for key in ("evidence_bundle", "asset_ref"):
            if key not in payload and key in context_request_payload:
                payload[key] = deepcopy(context_request_payload[key])
        if not payload.get("candidate_table") and not payload.get("table"):
            candidate_source = self._candidate_source_from_assets({"candidates": self._candidate_assets(goal)})
            candidate_table = str(candidate_source.get("candidate_table") or candidate_source.get("table") or "")
            if candidate_source:
                payload.update({key: value for key, value in candidate_source.items() if key != "candidate_table"})
            if candidate_table:
                payload["candidate_table"] = candidate_table
        candidates = self._candidate_bindings(goal)
        if candidates and not payload.get("candidate_bindings"):
            payload["candidate_bindings"] = candidates
        return payload

    @staticmethod
    def _candidate_table_from_assets(assets: Dict[str, Any]) -> str:
        for candidate in (assets.get("source_candidates") or []) + (assets.get("candidates") or []):
            table = str(candidate.get("table") or "").strip()
            name = str(candidate.get("name") or "").strip()
            asset_type = str(candidate.get("asset_type") or "").strip()
            if table:
                return table
            if asset_type == "table" and "." in name:
                return name
        return ""

    @staticmethod
    def _candidate_source_from_assets(assets: Dict[str, Any]) -> Dict[str, Any]:
        for candidate in (assets.get("source_candidates") or []) + (assets.get("candidates") or []):
            source_kind = str(candidate.get("source_kind") or "").strip()
            source_id = candidate.get("source_id")
            dataset_id = candidate.get("dataset_id")
            database = str(candidate.get("database") or "").strip()
            schema = candidate.get("schema")
            table = str(candidate.get("table") or "").strip()
            name = str(candidate.get("name") or "").strip()
            extra_evidence = {}
            if isinstance(candidate.get("asset_ref"), dict):
                extra_evidence["asset_ref"] = deepcopy(candidate["asset_ref"])
            if isinstance(candidate.get("evidence_bundle"), dict):
                extra_evidence["evidence_bundle"] = deepcopy(candidate["evidence_bundle"])
            if source_kind == "dataset" and dataset_id:
                return {
                    "source_kind": "dataset",
                    "dataset_id": dataset_id,
                    "source_id": source_id,
                    "database": database or None,
                    "schema": schema,
                    "table": table or None,
                    "candidate_table": name or table,
                    **extra_evidence,
                }
            if source_kind == "physical_table" and table:
                return {
                    "source_kind": "physical_table",
                    "source_id": source_id,
                    "database": database or None,
                    "schema": schema,
                    "table": table,
                    "candidate_table": f"{database}.{table}" if database and "." not in table else table,
                    **extra_evidence,
                }
            asset_type = str(candidate.get("asset_type") or "").strip()
            if asset_type == "table" and name:
                return {"candidate_table": name}
        return {}

    def _recall_source_candidates(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        if self._source_candidate_recall_service is None:
            return {}
        try:
            return self._source_candidate_recall_service.recall(
                query,
                semantic_assets=self._collect_existing_semantic_assets(),
                accessible_datasource_ids=(context.get("request_payload") or {}).get("accessible_datasource_ids"),
            )
        except Exception as exc:
            return {
                "summary": f"候选数据来源召回失败: {exc}",
                "state": "failed",
                "candidates": [],
                "suggested_action": "ask_for_source",
            }

    def _draft_for_context(self, context: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self._builder.create_spec_draft(self._payload_from_context(context, arguments))

    def _spec_from_context(self, context: Dict[str, Any]) -> Dict[str, Any]:
        session = context.get("session") or {}
        state = session.get("workbench_state") or {}
        spec = state.get("raw_spec") or state.get("spec") or {}
        return spec if isinstance(spec, dict) else {}

    def _session_goal(self, context: Dict[str, Any]) -> str:
        return str((context.get("session") or {}).get("user_goal") or "")

    def _table_from_context(self, context: Dict[str, Any]) -> str:
        state = (context.get("session") or {}).get("workbench_state") or {}
        patch = state.get("proposal_patch") or {}
        return str(patch.get("table") or "")

    def _collect_existing_semantic_assets(self) -> Dict[str, List[Dict[str, Any]]]:
        method = getattr(self._builder, "_collect_existing_semantic_assets", None)
        if callable(method):
            return method()
        return {"objects": [], "metrics": [], "glossary": []}

    def _filter_assets(self, assets: List[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
        query_lower = query.lower()
        return [
            asset for asset in assets
            if str(asset.get("status") or "") == "active"
            and any(str(asset.get(key) or "").lower() in query_lower for key in ("name", "title"))
        ]

    def _candidate_assets(self, query: str) -> List[Dict[str, Any]]:
        if "评论" in query or "comment" in query.lower():
            return [
                {
                    "asset_type": "cube",
                    "name": "student_comment_cube",
                    "score": 0.82,
                    "reason": "名称和评论数目标匹配，适合作为优先候选执行语义",
                },
                {
                    "asset_type": "table",
                    "name": "df_cb_258187.dwd_interaction_comment_reports_df",
                    "score": 0.78,
                    "reason": "真实评论/举报明细表，可作为冷启动事实表线索",
                },
            ]
        return []

    def _candidate_bindings(self, query: str) -> List[Dict[str, Any]]:
        if "评论" not in query and "comment" not in query.lower():
            return []
        return [
            {
                "measure_ref": "student_comment_cube.comment_count",
                "score": 0.78,
                "evidence": "问题包含学生评论数，候选 Cube measure 命名匹配",
            }
        ]

    def _semantic_canvas(self, spec: Dict[str, Any], user_message: str) -> Dict[str, Any]:
        ontology = spec.get("ontology") or {}
        cube = spec.get("cube") or {}
        object_payload = ontology.get("object") or {}
        metrics = ontology.get("metrics") or []
        dimensions = []
        bindings = []
        if cube.get("dimensions"):
            dimensions = [
                {"name": name, "title": value.get("title") or name}
                for name, value in (cube.get("dimensions") or {}).items()
            ]
        if not dimensions and ("评论" in user_message or "comment" in user_message.lower()):
            dimensions = [
                {"name": "school_id", "title": "学校"},
                {"name": "published_at", "title": "发布时间"},
            ]
        for metric in metrics:
            for ref in metric.get("measure_refs") or []:
                bindings.append({"metric": metric.get("name"), "measure_ref": ref, "status": metric.get("binding_status") or "proposed"})
        if not bindings and ("评论" in user_message or "comment" in user_message.lower()):
            bindings = [
                {
                    "metric": "student_comment_count",
                    "measure_ref": "student_comment_cube.comment_count",
                    "status": "proposed",
                }
            ]
        return {
            "objects": [object_payload] if object_payload else ([{"name": "student_comment", "title": "学生评论"}] if "评论" in user_message else []),
            "metrics": metrics or ([{"name": "student_comment_count", "title": "学生评论数"}] if "评论" in user_message else []),
            "dimensions": dimensions,
            "bindings": bindings,
            "policies": ontology.get("policies") or [{"name": "school_scope", "visibility": "restricted"}],
        }

    def _candidate_cards(self, query: str, assets: Dict[str, Any]) -> List[Dict[str, Any]]:
        if "评论" not in query and "comment" not in query.lower():
            return []
        return [
            {
                "id": "confirm_comment_table",
                "type": "candidate_asset",
                "title": "候选事实表 / Cube",
                "recommended_value": "student_comment_cube",
                "options": [candidate.get("name") for candidate in assets.get("candidates") or []],
                "evidence": "候选资产与学生评论数目标匹配",
                "blocking": True,
            },
            {
                "id": "confirm_time_dimension",
                "type": "time_dimension",
                "title": "默认时间字段",
                "recommended_value": "published_at",
                "options": ["published_at", "created_at", "updated_at"],
                "evidence": "最近 7 天问题需要默认时间维度",
                "blocking": True,
            },
            {
                "id": "confirm_school_dimension",
                "type": "dimension",
                "title": "学校维度",
                "recommended_value": "school_id",
                "options": ["school_id", "school_name"],
                "evidence": "按学校汇总需要学校维度",
                "blocking": True,
            },
        ]

    def _required_confirmations(self, candidate_cards: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [
            {
                "id": card["id"],
                "title": card["title"],
                "recommended_value": card.get("recommended_value"),
                "blocking": bool(card.get("blocking")),
            }
            for card in candidate_cards
            if card.get("blocking")
        ]

    def _proposal_patch(
        self,
        session: AgentSession,
        user_message: str,
        assets: Dict[str, Any],
        spec: Dict[str, Any],
    ) -> Dict[str, Any]:
        candidate_table = None
        for candidate in assets.get("candidates") or []:
            if candidate.get("asset_type") == "table":
                candidate_table = candidate.get("name")
                break
        return {
            "source_mode": "agent_led",
            "source_kind": "business_question",
            "user_question": user_message or session.user_goal,
            "business_subject": self._subject_from_text(f"{session.user_goal} {user_message}"),
            "candidate_bindings": self._candidate_bindings(f"{session.user_goal} {user_message}"),
            "candidate_assets": assets.get("candidates") or [],
            "candidate_table": candidate_table,
            "spec": spec,
        }

    def _agent_message(
        self,
        ontology: Dict[str, Any],
        cubes: Dict[str, Any],
        assets: Dict[str, Any],
        confirmations: List[Dict[str, Any]],
    ) -> str:
        if confirmations:
            return (
                "我已识别建模目标并完成已有语义与候选资产检索。"
                f"当前需要确认 {len(confirmations)} 个关键口径后再保存 Proposal。"
            )
        if ontology.get("coverage_hint") == "covered":
            return "已有 active Ontology 与指标可以覆盖该问题，建议复用已有语义。"
        if assets.get("candidates"):
            return "我找到候选资产并生成了建模建议，可以先保存 Proposal 再进入治理校验。"
        return "我已生成初步建模建议，但候选资产证据不足，需要补充表或业务线索。"

    def _subject_from_text(self, text: str) -> str:
        if "学生" in text and "评论" in text:
            return "学生评论"
        if "评论" in text:
            return "评论"
        return "业务对象"
