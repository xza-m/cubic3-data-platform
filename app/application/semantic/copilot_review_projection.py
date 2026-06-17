"""建模 Copilot Proposal Review 只读投影。

从 AgentSession / Proposal gap-view 投影出 Chat-first 页面右侧 Artifact Panel
使用的 review read model。纯函数实现，不持有任何服务依赖。
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

from app.domain.semantic.copilot_state import is_reviewable_spec
from app.domain.semantic.modeling_agent_session import AgentSession


def review_from_session(session: AgentSession) -> Dict[str, Any]:
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

    changes = _review_changes_from_state(cube, ontology, canvas)
    blockers = review_blockers_from_state(confirmations, reasons, validation, state.get("publish_result"))
    has_spec = is_reviewable_spec(raw_spec)
    status, status_label = _review_status(
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
        "reason_explanations": _review_explanations(changes),
        "data_agent_consumption": _review_consumption_state(published, has_spec, blockers),
        "source_evidence": _source_evidence_state(session, raw_spec, state),
        "trace_state": _trace_state(session, proposal_id, published),
        "publish_gate": _publish_gate_state(status, status_label, has_spec, bool(proposal_id), blockers, published, state),
        "post_publish_validation": post_publish_validation(state, published=published),
        "primary_action": _review_primary_action(status, has_spec, blockers),
        "codex_review_run": _codex_review_run_state(state),
    }


def review_from_gap_view(session: AgentSession, gap_view: Dict[str, Any]) -> Dict[str, Any]:
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
        "status_label": str(gap_view.get("display_status") or _review_status_label(mapped_status)),
        "changes": changes,
        "blockers": blockers,
        "reason_explanations": _review_explanations(changes),
        "data_agent_consumption": _review_consumption_state(published, True, blockers),
        "source_evidence": _source_evidence_state(session, session.workbench_state.get("raw_spec") or {}, session.workbench_state),
        "trace_state": _trace_state(session, gap_view.get("id") or session.current_proposal_id, published),
        "publish_gate": _publish_gate_state(mapped_status, str(gap_view.get("display_status") or _review_status_label(mapped_status)), True, bool(gap_view.get("id") or session.current_proposal_id), blockers, published, session.workbench_state),
        "post_publish_validation": post_publish_validation(session.workbench_state, published=published),
        "primary_action": {
            "action": primary.get("action") or ("none" if published else "publish"),
            "label": primary.get("label") or _review_primary_action(mapped_status, True, blockers)["label"],
            "disabled": bool(primary.get("disabled", False)),
            "disabled_reason": primary.get("disabled_reason"),
        },
        "codex_review_run": _codex_review_run_state(session.workbench_state),
    }


def review_blockers_from_state(
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
            "title": _review_reason_title(reason),
            "description": "发布前需要处理该 readiness 阻塞。",
            "technical_hint": reason,
            "source": "readiness",
        })
    if isinstance(publish_result, dict) and publish_result.get("status") == "failed":
        reason = str(publish_result.get("reason") or "publish_failed")
        blockers.append({
            "id": reason,
            "severity": "required",
            "title": str(publish_result.get("title") or _review_reason_title(reason)),
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
    return _dedupe_review_items(blockers)


def post_publish_validation(state: Dict[str, Any], *, published: bool) -> Dict[str, Any]:
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
            "result_summary": "语义中心发布快照已生成，消费者可继续验证。",
        }
    return {
        "status": "not_run",
        "label": "发布后验收待运行",
        "sample_question": sample_question,
        "runtime_route": None,
        "result_summary": "语义资产发布后，消费者可基于语义中心发布快照验证。",
    }


def _codex_review_run_state(state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    run = state.get("codex_review_run")
    return deepcopy(run) if isinstance(run, dict) else None


def _review_changes_from_state(
    cube: Dict[str, Any],
    ontology: Dict[str, Any],
    canvas: Dict[str, Any],
) -> list[Dict[str, Any]]:
    changes: list[Dict[str, Any]] = []

    cube_name = str(cube.get("name") or ((canvas.get("candidate_cards") or [{}])[0]).get("name") or "student_comment_cube")
    cube_source = str(cube.get("source") or cube.get("table") or "")
    if cube_name:
        changes.append(_review_change("cube", "cube", "新增 Cube", cube_name, cube_source))

    obj = ontology.get("object") or {}
    object_name = str(obj.get("name") or ((canvas.get("objects") or [{}])[0]).get("name") or "")
    if object_name:
        changes.append(_review_change("object", "object", "语义对象", object_name, "承接业务主体和指标解释"))

    metrics = canvas.get("metrics") or (ontology.get("metrics") or [])
    for idx, metric in enumerate(metrics):
        if not isinstance(metric, dict):
            continue
        metric_name = str(metric.get("name") or "")
        if metric_name:
            changes.append(_review_change(f"metric_{idx}", "metric", "新增指标", metric_name, str(metric.get("title") or "")))

    bindings = canvas.get("bindings") or []
    for idx, binding in enumerate(bindings):
        if not isinstance(binding, dict):
            continue
        measure_ref = str(binding.get("measure_ref") or "")
        if measure_ref:
            changes.append(_review_change(f"binding_{idx}", "binding", "语义绑定", measure_ref, "业务指标到执行口径"))

    dimensions = canvas.get("dimensions") or cube.get("dimensions") or []
    if isinstance(dimensions, list):
        for idx, dimension in enumerate(dimensions[:2]):
            if isinstance(dimension, dict) and dimension.get("name"):
                changes.append(_review_change(f"dimension_{idx}", "dimension", "补齐维度", str(dimension["name"]), str(dimension.get("title") or "")))
    elif isinstance(dimensions, dict):
        for idx, name in enumerate(list(dimensions.keys())[:2]):
            changes.append(_review_change(f"dimension_{idx}", "dimension", "补齐维度", name, ""))

    policies = canvas.get("policies") or (ontology.get("policies") or [])
    for idx, policy in enumerate(policies[:1]):
        if isinstance(policy, dict) and policy.get("name"):
            changes.append(_review_change(f"policy_{idx}", "policy", "访问策略", str(policy["name"]), str(policy.get("visibility") or "")))

    return changes


def _review_change(change_id: str, change_type: str, title: str, technical_name: str, detail: str) -> Dict[str, Any]:
    return {
        "id": change_id,
        "type": change_type,
        "title": title,
        "technical_name": technical_name,
        "operation": "create",
        "reason": detail or "AI 建模助手根据业务问题和候选语义生成。",
        "impact": "进入 Proposal 后会参与语义校验、治理审核和发布。",
        "risk": "发布前需要确认口径、绑定和权限策略。",
    }


def _review_reason_title(reason: str) -> str:
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


def _review_explanations(changes: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
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
            "summary": "语义中心发布快照已生成",
        })
    return {"events": events}


def _publish_gate_state(
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
        "ready_to_publish": "发布材料已就绪",
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
                "id": "consumer_validation",
                "label": "消费者验证",
                "status": "passed" if published else "pending",
                "description": (
                    "消费者可基于语义中心发布快照继续验证。"
                    if published
                    else "发布成功后进入语义中心发布快照。"
                ),
            },
        ],
    }


def _review_consumption_state(
    published: bool,
    has_spec: bool,
    blockers: list[Dict[str, Any]],
) -> Dict[str, Any]:
    if published:
        return {"state": "available", "label": "语义中心已发布", "reasons": []}
    if not has_spec:
        return {"state": "unavailable", "label": "消费者暂不可验证", "reasons": ["SPEC_REQUIRED"]}
    if blockers:
        return {"state": "draft_only", "label": "消费者暂不可验证", "reasons": [b["id"] for b in blockers]}
    return {"state": "ready_after_publish", "label": "发布后消费者可验证", "reasons": []}


def _review_primary_action(
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
    *,
    published: bool,
    has_spec: bool,
    has_proposal: bool,
    has_blockers: bool,
) -> tuple[str, str]:
    if published:
        return "published", "已发布到语义中心"
    if not has_spec:
        return "drafting", "等待生成 spec"
    if not has_proposal:
        return ("blocked", "当前只能保存草稿") if has_blockers else ("ready_to_save", "草稿可保存")
    return ("blocked", "发布前还有阻塞") if has_blockers else ("ready_to_publish", "待发布资产已保存，等待发布预演与确认")


def _review_status_label(status: str) -> str:
    return {
        "drafting": "等待生成 spec",
        "blocked": "当前只能保存草稿",
        "ready_to_save": "草稿可保存",
        "ready_to_publish": "待发布资产已保存，等待发布预演与确认",
        "published": "已发布到语义中心",
    }.get(status, status)


def _dedupe_review_items(items: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    seen = set()
    result = []
    for item in items:
        key = str(item.get("id") or item.get("title"))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
