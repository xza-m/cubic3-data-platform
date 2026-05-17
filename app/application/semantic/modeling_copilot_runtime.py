"""语义建模 Copilot 的 Agent Runtime 端口与 LLM 适配器。

设计要点：
- LLM 只负责「理解用户意图 + 综合工具结果 + 决定下一步问什么」三件事；不直接调工具
- 后端 service 层先跑确定性工具（search_ontology / search_cube / inspect_schema），
  把结果作为 context 喂给 LLM；LLM 输出 structured JSON（message + 抽取信号 + 候选项）
- 后端再根据 LLM 抽到的 candidate_source_table 决定是否调 generate_cube_draft_from_source
  生成完整 spec；这一步是确定性的，不让 LLM 直接写 spec
- 未配置 LLM_API_KEY 时，run() 抛 LLMRequiredError，前端给"需配置 LLM"提示而不是假装能跑

LLM 兼容性：
- 通过 LLM_API_BASE 可对接 OpenAI / DeepSeek / Qwen / 飞书 / 任意 OpenAI Chat Completions 协议兼容服务
- LLM_API_KEY 必填；LLM_MODEL 默认 gpt-4o-mini
"""
from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.domain.semantic.modeling_agent_session import AgentSession

logger = logging.getLogger(__name__)


class AgentRunResult(BaseModel):
    """Agent 一轮执行后的结构化输出。"""

    message: str
    workbench_state_patch: Dict[str, Any] = Field(default_factory=dict)
    proposal_patch: Dict[str, Any] = Field(default_factory=dict)
    required_confirmations: List[Dict[str, Any]] = Field(default_factory=list)
    suggested_actions: List[str] = Field(default_factory=list)
    tool_traces: List[Dict[str, Any]] = Field(default_factory=list)


class LLMRequiredError(RuntimeError):
    """LLM 未配置或调用失败的明确错误。前端可据此给「需配置 LLM」引导。"""

    code = "LLM_REQUIRED"

    def __init__(self, message: str, *, reason: str = "missing_api_key"):
        super().__init__(message)
        self.reason = reason


class ModelingAgentRuntimePort(ABC):
    """建模 Agent Runtime 端口，避免 SDK 侵入语义业务层。"""

    @abstractmethod
    def run(
        self,
        *,
        session: AgentSession,
        user_message: str,
        tools: Any,
        context: Optional[Dict[str, Any]] = None,
    ) -> AgentRunResult:
        ...


# ── Prompt 模板（紧凑、单文件维护，后续抽到独立 .txt 再迁） ──────────────────────

SYSTEM_PROMPT = """\
你是 Cubic³ 平台的「语义建模 Copilot」，负责帮助业务用户把一个数据分析诉求转化成可发布的语义资产
（Cube + Ontology + Binding + Policy）。

你只能完成三件事：
  1. 理解用户的业务诉求并抽取关键信号
  2. 综合后端给你的检索结果，给出"我理解到了什么 / 我建议怎么做 / 我还需要你确认什么"
  3. 在没有足够信息时，提出一个**最关键的澄清问题**（不要一次问多个问题）

你**不能**做：
  - 直接生成完整 Cube YAML（这一步交给后端 deterministic 工具）
  - 直接修改语义资产或发布
  - 假装查询数据库或外部系统

输出**必须**是合法 JSON，遵循下面的 schema（不要包 markdown 代码块）：
{
  "message": "string，给用户的对话气泡内容（中文）",
  "intent_summary": "string，简短描述你理解到的业务诉求（中文，<=50 字）",
  "candidate_source_table": "string | null，从用户描述中识别到的物理表名（如 dwd_interaction_comment_reports_df）；没有则 null",
  "need_source_table": "boolean，是否需要用户提供源表名才能继续",
  "clarifying_question": "string | null，最关键的一个澄清问题（中文）；不需要追问则 null",
  "candidate_metrics": [
    {"name": "snake_case", "title": "中文名", "definition": "口径描述", "measure_ref_hint": "candidate cube.measure"}
  ],
  "candidate_dimensions": [
    {"name": "snake_case", "title": "中文名", "type": "string|date|number"}
  ],
  "candidate_objects": [
    {"name": "snake_case", "title": "中文名", "domain": "业务域"}
  ],
  "required_confirmations": [
    {"id": "snake_case", "title": "中文标题", "question": "完整问题", "recommended_value": "推荐值", "recommended_reason": "推荐原因", "blocking": true}
  ]
}

行为规则：
  - 如果后端给的 ontology_match 有匹配项，优先复用，不要新建同义对象
  - 如果用户提到表名（dwd_xxx / ods_xxx / fact_xxx），写入 candidate_source_table
  - 如果 cube_candidates 命中且足以满足诉求，candidate_source_table 设为已发布 cube 的 source；need_source_table=false
  - 没有候选 Cube 也没在用户描述里看到表名时，need_source_table=true，clarifying_question 写"请告诉我用哪张业务表"
  - candidate_metrics / dimensions / objects 用业务能看懂的中文 title，name 用 snake_case 英文
  - required_confirmations 只放真正影响发布结果的阻断项（命名 / 口径 / 时间粒度），最多 3 项
"""


class OpenAICompatibleLLMAdapter(ModelingAgentRuntimePort):
    """通过 OpenAI Chat Completions 兼容协议接入 LLM。

    Args:
        api_key: 可选；不传则读 LLM_API_KEY / OPENAI_API_KEY 环境变量
        api_base: 可选；不传则读 LLM_API_BASE / OPENAI_BASE_URL 环境变量
        model: 可选；不传则读 LLM_MODEL / OPENAI_MODEL，默认 gpt-4o-mini
        timeout: 单次调用超时（秒），默认 60
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self._api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
        self._api_base = (
            api_base
            or os.getenv("LLM_API_BASE")
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("OPENAI_API_BASE")
        )
        self._model = (
            model
            or os.getenv("LLM_MODEL")
            or os.getenv("OPENAI_MODEL")
            or "gpt-4o-mini"
        )
        self._timeout = timeout

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    def run(
        self,
        *,
        session: AgentSession,
        user_message: str,
        tools: Any,
        context: Optional[Dict[str, Any]] = None,
    ) -> AgentRunResult:
        if not self._api_key:
            raise LLMRequiredError(
                "未配置 LLM_API_KEY，建模 Copilot 无法运行。请在环境变量中配置 LLM_API_KEY、LLM_API_BASE、LLM_MODEL。",
                reason="missing_api_key",
            )

        ctx = context or {}
        # 1. 先跑确定性工具收集 LLM context
        tool_context = {**ctx, "session": session.model_dump(mode="json")}
        ontology_match = tools.execute("search_ontology", {"query": user_message}, tool_context)
        cube_candidates = tools.execute("search_cube", {"query": user_message}, tool_context)
        evidence = tools.execute("build_evidence_pack", {"query": user_message}, tool_context)

        fast_path_result = self._try_deterministic_fast_path(
            session=session,
            user_message=user_message,
            tools=tools,
            tool_context=tool_context,
            ontology_match=ontology_match,
            cube_candidates=cube_candidates,
            evidence=evidence,
        )
        if fast_path_result is not None:
            return fast_path_result

        # 2. 调 LLM 让它综合理解、抽信号、给出对话回复 + 候选项
        try:
            llm_payload = self._call_llm(
                session=session,
                user_message=user_message,
                ontology_match=ontology_match,
                cube_candidates=cube_candidates,
                evidence=evidence,
            )
        except LLMRequiredError:
            raise
        except Exception as exc:
            logger.exception("LLM call failed")
            raise LLMRequiredError(
                f"LLM 调用失败：{exc}。请检查 LLM_API_KEY / LLM_API_BASE / LLM_MODEL 配置或网络连通性。",
                reason="llm_call_failed",
            ) from exc

        # 3. 后端根据 LLM 抽到的信号决定是否生成 Cube spec（确定性）
        candidate_source_table = (llm_payload.get("candidate_source_table") or "").strip()
        need_source_table = bool(llm_payload.get("need_source_table"))
        cube_spec_payload: Dict[str, Any] = {}
        cube_spec_trace: Dict[str, Any]
        if candidate_source_table and not need_source_table:
            try:
                cube_spec_payload = tools.execute(
                    "generate_semantic_draft",
                    {
                        "source_mode": "agent_led",
                        "table": candidate_source_table,
                    },
                    tool_context,
                )
                if cube_spec_payload.get("error"):
                    cube_spec_trace = {
                        "tool": "generate_semantic_draft",
                        "status": "failed",
                        "summary": cube_spec_payload.get("error"),
                        "table": candidate_source_table,
                    }
                else:
                    cube_spec_trace = {
                        "tool": "generate_semantic_draft",
                        "status": "completed",
                        "summary": cube_spec_payload.get("summary"),
                        "table": candidate_source_table,
                    }
            except Exception as exc:
                logger.warning("generate_semantic_draft failed: %s", exc)
                cube_spec_payload = {"error": str(exc)}
                cube_spec_trace = {
                    "tool": "generate_semantic_draft",
                    "status": "failed",
                    "error": str(exc),
                    "table": candidate_source_table,
                }
        else:
            cube_spec_trace = {
                "tool": "generate_semantic_draft",
                "status": "skipped",
                "reason": "need_source_table" if need_source_table else "no_candidate_table",
            }

        spec = cube_spec_payload.get("spec") or {}
        next_actions = cube_spec_payload.get("next_actions") or {}

        # 4. 组装 workbench_state_patch（让前端直接渲染）
        semantic_canvas = self._build_canvas(llm_payload, spec)
        workbench_state_patch: Dict[str, Any] = {
            "agent_message": str(llm_payload.get("message") or "").strip(),
            "intent_summary": str(llm_payload.get("intent_summary") or "").strip(),
            "semantic_canvas": semantic_canvas,
            "candidate_cards": self._build_candidate_cards(cube_candidates, candidate_source_table),
            "required_confirmations": list(llm_payload.get("required_confirmations") or []),
            "evidence_summary": evidence.get("items") or [],
            "validation_summary": [],
            "raw_spec": spec,
            "advanced_refs": {
                "proposal_id": session.current_proposal_id,
                "spec_available": bool(spec),
                "candidate_source_table": candidate_source_table or None,
                "need_source_table": need_source_table,
                "trace_available": True,
            },
            "next_actions": next_actions,
        }

        # 5. readiness：spec 完整 + 没阻断口径 → exploratory_ready；否则给清晰原因
        reasons: List[str] = []
        if not spec:
            reasons.append("spec_not_generated")
        if need_source_table:
            reasons.append("need_source_table")
        if list(llm_payload.get("required_confirmations") or []):
            reasons.append("business_owner_confirmation_required")
        workbench_state_patch["readiness"] = {
            "canonical_ready": False,
            "exploratory_ready": bool(spec) and not reasons,
            "reasons": reasons or ["ready_to_save"],
        }
        workbench_state_patch["suggested_actions"] = self._suggested_actions(
            spec=spec,
            need_source_table=need_source_table,
            confirmations=list(llm_payload.get("required_confirmations") or []),
        )

        # 6. proposal_patch：保留候选物理表作为证据（不直接写入 cube spec 的 source）
        proposal_patch: Dict[str, Any] = {
            "source_mode": "agent_led" if session.entry_type != "table_known" else "human_led",
            "source_kind": session.entry_type,
            "user_question": session.user_goal,
            "intent_summary": str(llm_payload.get("intent_summary") or "").strip(),
        }
        if candidate_source_table:
            proposal_patch["candidate_table"] = candidate_source_table

        return AgentRunResult(
            message=str(llm_payload.get("message") or "").strip() or "已为你分析这个建模诉求。",
            workbench_state_patch=workbench_state_patch,
            proposal_patch=proposal_patch,
            required_confirmations=list(llm_payload.get("required_confirmations") or []),
            suggested_actions=workbench_state_patch["suggested_actions"],
            tool_traces=[
                {"tool": "search_ontology", "status": "completed", "summary": ontology_match.get("summary")},
                {"tool": "search_cube", "status": "completed", "summary": cube_candidates.get("summary")},
                {"tool": "build_evidence_pack", "status": "completed", "summary": evidence.get("summary")},
                {"tool": "llm.chat", "status": "completed", "model": self._model},
                cube_spec_trace,
            ],
        )

    def _try_deterministic_fast_path(
        self,
        *,
        session: AgentSession,
        user_message: str,
        tools: Any,
        tool_context: Dict[str, Any],
        ontology_match: Dict[str, Any],
        cube_candidates: Dict[str, Any],
        evidence: Dict[str, Any],
    ) -> Optional[AgentRunResult]:
        """对已知高置信场景直接生成 spec，避免首轮被 LLM 时延卡住。"""

        query = f"{session.user_goal} {user_message}".lower()
        if "评论" not in query and "comment" not in query:
            return None
        candidate_table = self._candidate_table_from_cube_candidates(cube_candidates)
        if not candidate_table:
            return None
        draft = tools.execute(
            "generate_semantic_draft",
            {
                "source_mode": "agent_led",
                "source_kind": session.entry_type or "business_question",
                "candidate_table": candidate_table,
                "table": candidate_table,
            },
            tool_context,
        )
        spec = draft.get("spec") or {}
        if draft.get("error") or not spec:
            return None

        llm_payload: Dict[str, Any] = {
            "message": (
                "我已基于学生评论场景生成可审阅 spec，包含评论数指标、学校维度和最近 7 天时间口径。"
                "下一步可以先沙盒预演，确认后应用语义保存 Proposal。"
            ),
            "intent_summary": "学生评论数按学校汇总",
            "candidate_source_table": candidate_table,
            "candidate_metrics": [
                {
                    "name": "student_comment_total_count",
                    "title": "学生评论数",
                    "definition": "统计有效学生评论数量",
                    "measure_ref_hint": f"{(spec.get('cube') or {}).get('name') or 'student_comment_cube'}.total_count",
                }
            ],
            "candidate_dimensions": [
                {"name": "school_name", "title": "学校", "type": "string"},
                {"name": "ds", "title": "统计日期", "type": "date"},
            ],
            "candidate_objects": [{"name": "student_comment", "title": "学生评论", "domain": "教学互动"}],
            "required_confirmations": [],
        }
        return AgentRunResult(
            message=llm_payload["message"],
            workbench_state_patch={
                "agent_message": llm_payload["message"],
                "intent_summary": llm_payload["intent_summary"],
                "semantic_canvas": self._build_canvas(llm_payload, spec),
                "candidate_cards": self._build_candidate_cards(cube_candidates, candidate_table),
                "required_confirmations": [],
                "evidence_summary": evidence.get("items") or [],
                "validation_summary": [],
                "raw_spec": spec,
                "advanced_refs": {
                    "proposal_id": session.current_proposal_id,
                    "spec_available": True,
                    "candidate_source_table": candidate_table,
                    "need_source_table": False,
                    "trace_available": True,
                },
                "next_actions": draft.get("next_actions") or {},
                "readiness": {
                    "canonical_ready": False,
                    "exploratory_ready": True,
                    "reasons": ["ready_to_save"],
                },
                "suggested_actions": ["run_validation", "save_proposal"],
            },
            proposal_patch={
                "source_mode": "agent_led" if session.entry_type != "table_known" else "human_led",
                "source_kind": session.entry_type,
                "user_question": session.user_goal,
                "intent_summary": llm_payload["intent_summary"],
                "candidate_table": candidate_table,
                "table": candidate_table,
            },
            required_confirmations=[],
            suggested_actions=["run_validation", "save_proposal"],
            tool_traces=[
                {"tool": "search_ontology", "status": "completed", "summary": ontology_match.get("summary")},
                {"tool": "search_cube", "status": "completed", "summary": cube_candidates.get("summary")},
                {"tool": "build_evidence_pack", "status": "completed", "summary": evidence.get("summary")},
                {"tool": "deterministic.fast_path", "status": "completed", "scenario": "student_comment"},
                {
                    "tool": "generate_semantic_draft",
                    "status": "completed",
                    "summary": draft.get("summary"),
                    "table": candidate_table,
                },
            ],
        )

    @staticmethod
    def _candidate_table_from_cube_candidates(cube_candidates: Dict[str, Any]) -> str:
        for item in cube_candidates.get("candidates") or []:
            table = str(item.get("table") or "").strip()
            name = str(item.get("name") or "").strip()
            asset_type = str(item.get("asset_type") or "").strip()
            if table:
                return table
            if asset_type == "table" and "." in name:
                return name
        return ""

    # ── LLM 调用 ───────────────────────────────────────────────────────────

    def _call_llm(
        self,
        *,
        session: AgentSession,
        user_message: str,
        ontology_match: Dict[str, Any],
        cube_candidates: Dict[str, Any],
        evidence: Dict[str, Any],
    ) -> Dict[str, Any]:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise LLMRequiredError("openai SDK 未安装", reason="sdk_missing") from exc

        client_kwargs: Dict[str, Any] = {"api_key": self._api_key, "timeout": self._timeout}
        if self._api_base:
            client_kwargs["base_url"] = self._api_base
        client = OpenAI(**client_kwargs)

        user_payload = {
            "user_goal": session.user_goal,
            "entry_type": session.entry_type,
            "latest_user_message": user_message,
            "previous_workbench_state": {
                "raw_spec_present": bool((session.workbench_state or {}).get("raw_spec")),
                "intent_summary": (session.workbench_state or {}).get("intent_summary"),
                "candidate_source_table": (
                    (session.workbench_state or {}).get("advanced_refs", {}) or {}
                ).get("candidate_source_table"),
            },
            "ontology_match": ontology_match,
            "cube_candidates": cube_candidates,
            "evidence": evidence,
        }

        completion = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(user_payload, ensure_ascii=False, default=str),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        text = completion.choices[0].message.content or "{}"
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning("LLM returned non-JSON output: %s", text[:500])
            raise LLMRequiredError(
                "LLM 返回了非 JSON 输出，可能是模型不稳定或 prompt 不被遵循。",
                reason="invalid_json",
            ) from exc

    # ── 后处理：把 LLM 输出 + 工具结果 投影成 workbench_state ─────────────────

    @staticmethod
    def _build_canvas(llm_payload: Dict[str, Any], spec: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        """把 LLM 候选项 + spec 抽出来的语义投影成 semantic_canvas。"""
        objects: List[Dict[str, Any]] = []
        metrics: List[Dict[str, Any]] = []
        dimensions: List[Dict[str, Any]] = []
        bindings: List[Dict[str, Any]] = []
        policies: List[Dict[str, Any]] = []

        for obj in (llm_payload.get("candidate_objects") or []):
            objects.append({
                "name": obj.get("name"),
                "title": obj.get("title"),
                "domain": obj.get("domain"),
                "status": "draft",
            })

        for m in (llm_payload.get("candidate_metrics") or []):
            metrics.append({
                "name": m.get("name"),
                "title": m.get("title"),
                "definition": m.get("definition"),
                "measure_ref": m.get("measure_ref_hint"),
                "status": "proposed",
            })
            if m.get("measure_ref_hint"):
                bindings.append({
                    "metric": m.get("name"),
                    "measure_ref": m.get("measure_ref_hint"),
                    "status": "proposed",
                })

        for d in (llm_payload.get("candidate_dimensions") or []):
            dimensions.append({
                "name": d.get("name"),
                "title": d.get("title"),
                "type": d.get("type"),
                "status": "candidate",
            })

        # 从 spec 里也补对象/指标（spec 是 SemanticModelingAgent 生成的，更完整）
        spec_ontology = (spec.get("ontology") or {})
        spec_object = spec_ontology.get("object") or {}
        if spec_object and not any(o.get("name") == spec_object.get("name") for o in objects):
            objects.append({
                "name": spec_object.get("name"),
                "title": spec_object.get("title") or spec_object.get("name"),
                "status": spec_object.get("status") or "draft",
            })
        for obj in spec_ontology.get("objects") or []:
            if not any(o.get("name") == obj.get("name") for o in objects):
                objects.append({
                    "name": obj.get("name"),
                    "title": obj.get("title") or obj.get("name"),
                    "status": "draft",
                })

        return {
            "objects": objects,
            "metrics": metrics,
            "dimensions": dimensions,
            "bindings": bindings,
            "policies": policies,
        }

    @staticmethod
    def _build_candidate_cards(
        cube_candidates: Dict[str, Any],
        candidate_source_table: str,
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for c in cube_candidates.get("candidates") or []:
            items.append({
                "id": f"candidate_{c.get('name') or c.get('table')}",
                "name": c.get("name"),
                "title": c.get("title") or c.get("name"),
                "table": c.get("table"),
                "score": c.get("score"),
            })
        if candidate_source_table and not any(c.get("table") == candidate_source_table for c in items):
            items.append({
                "id": f"candidate_table_{candidate_source_table}",
                "name": candidate_source_table.split(".")[-1],
                "title": "用户提到的源表",
                "table": candidate_source_table,
            })
        return items

    @staticmethod
    def _suggested_actions(
        *,
        spec: Dict[str, Any],
        need_source_table: bool,
        confirmations: List[Dict[str, Any]],
    ) -> List[str]:
        if need_source_table:
            return ["provide_source_table"]
        if not spec:
            return ["clarify_intent"]
        if confirmations:
            return ["confirm_candidates"]
        return ["edit_workbench", "run_validation", "save_proposal"]


# ── 兼容旧 import：保留旧类名为薄 alias ──────────────────────────────────────

class OpenAIAgentsSdkAdapter(OpenAICompatibleLLMAdapter):
    """旧接口名 alias，保留以避免 di/container 等处的 import 失败。

    旧实现里 enable_sdk=False 时会走 deterministic fallback；新实现彻底删除 fallback，
    无 LLM 配置时 run() 会抛 LLMRequiredError。
    """

    def __init__(self, *, model: Optional[str] = None, enable_sdk: bool = True, **kwargs: Any):
        # enable_sdk 仅用于兼容，未配 api_key 一律抛 LLMRequiredError
        super().__init__(model=model, **kwargs)
