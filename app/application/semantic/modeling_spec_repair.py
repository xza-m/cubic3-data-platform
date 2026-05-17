"""建模助手 spec 补全与发布前自修复。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, Optional


def has_reviewable_spec(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and str(value.get("spec_version") or "") == "v1"
        and isinstance(value.get("cube"), dict)
        and bool(value["cube"])
    )


def repair_modeling_spec(
    spec: Dict[str, Any],
    *,
    user_goal: str = "",
    source_mode: str = "",
) -> Dict[str, Any]:
    """补齐 Agent-led 建模链路进入 Proposal / Runtime 前的最小合同。

    只修复确定性字段：Cube measure、BusinessMetric 绑定、grain、time dimension、
    additivity、policy 和证据包。不能确定的业务口径仍应留在 Chat 中确认。
    """
    if not isinstance(spec, dict):
        return {}
    repaired = deepcopy(spec)
    cube = repaired.get("cube")
    if not isinstance(cube, dict) or not cube:
        return repaired

    repaired.setdefault("spec_version", "v1")
    if _should_force_student_comment_canonical(repaired, user_goal):
        _apply_student_comment_canonical_spec(repaired)
        cube = repaired["cube"]
    cube_name = str(cube.get("name") or cube.get("table") or "semantic_cube")
    cube["name"] = cube_name
    dimensions = _ensure_dimensions(cube, user_goal)
    measure_name = _ensure_measure(cube, dimensions, user_goal)

    ontology = repaired.setdefault("ontology", {})
    if not isinstance(ontology, dict):
        ontology = {}
        repaired["ontology"] = ontology

    business = repaired.setdefault("business", {})
    subject = str(business.get("subject") or _subject_from_goal(user_goal) or "业务对象")
    object_payload = ontology.get("object") if isinstance(ontology.get("object"), dict) else {}
    object_name = str(object_payload.get("name") or _object_name(subject, cube_name))
    ontology["object"] = {
        "name": object_name,
        "title": object_payload.get("title") or subject,
        "description": object_payload.get("description") or f"{subject}对应的核心业务对象。",
        "aliases": object_payload.get("aliases") or ([subject] if subject else []),
        "status": object_payload.get("status") or "draft",
    }

    metrics = ontology.get("metrics")
    if not isinstance(metrics, list):
        metrics = []
    if not metrics:
        metrics = [_default_metric(object_name, subject, cube_name, measure_name)]
    time_dimension = _default_time_dimension(cube)
    grain = _default_grain(cube, dimensions, time_dimension)
    for metric in metrics:
        if not isinstance(metric, dict):
            continue
        metric.setdefault("name", _metric_name(object_name, measure_name))
        metric.setdefault("title", _metric_title(subject, measure_name))
        metric.setdefault("object_name", object_name)
        metric["measure_refs"] = _repair_measure_refs(metric.get("measure_refs"), cube_name, measure_name)
        metric["binding_status"] = "approved"
        metric["grain"] = metric.get("grain") or grain
        if time_dimension:
            metric["time_dimension"] = metric.get("time_dimension") or time_dimension
        metric["additivity"] = metric.get("additivity") or "additive"
        metric.setdefault("status", "draft")
    ontology["metrics"] = metrics

    governance = repaired.setdefault("governance", {})
    if not isinstance(governance, dict):
        governance = {}
        repaired["governance"] = governance
    sensitivity = str(governance.get("sensitivity_level") or business.get("sensitivity_level") or "restricted")
    governance["sensitivity_level"] = sensitivity
    governance.setdefault("official_agent_consumes_spec", False)

    policies = ontology.get("policies")
    if not isinstance(policies, list):
        policies = []
    if sensitivity != "public" and not policies:
        metric_name = str(metrics[0].get("name") or _metric_name(object_name, measure_name))
        policies.append(
            {
                "name": f"{metric_name}_policy",
                "target_type": "metric",
                "target_name": metric_name,
                "visibility": "restricted",
                "allowed_roles": business.get("default_roles") or [],
                "description": f"由建模助手自动补齐的{subject}指标访问策略。",
                "status": "draft",
            }
        )
    ontology["policies"] = policies

    evidence_pack = repaired.setdefault("evidence_pack", {})
    if not isinstance(evidence_pack, dict):
        evidence_pack = {}
        repaired["evidence_pack"] = evidence_pack
    items = evidence_pack.get("items")
    if not isinstance(items, list):
        items = []
    evidence_pack["items"] = _merge_evidence_items(items, cube_name, measure_name, user_goal, source_mode)
    return repaired


def _ensure_dimensions(cube: Dict[str, Any], user_goal: str) -> Dict[str, Dict[str, Any]]:
    dimensions = cube.get("dimensions")
    if not isinstance(dimensions, dict):
        dimensions = {}
    if dimensions:
        cube["dimensions"] = dimensions
        return dimensions

    if "评论" in user_goal or "comment" in user_goal.lower():
        dimensions.update(
            {
                "school_id": {"title": "学校", "type": "string", "sql": "`school_id`", "primary_key": False},
                "published_at": {"title": "发布时间", "type": "time", "sql": "`published_at`", "primary_key": False},
                "comment_id": {"title": "评论ID", "type": "string", "sql": "`comment_id`", "primary_key": True},
            }
        )
    cube["dimensions"] = dimensions
    return dimensions


def _ensure_measure(cube: Dict[str, Any], dimensions: Dict[str, Dict[str, Any]], user_goal: str) -> str:
    measures = cube.get("measures")
    if not isinstance(measures, dict):
        measures = {}
    for name, payload in measures.items():
        if isinstance(payload, dict) and payload.get("certified") and str(payload.get("type") or "") == "count":
            cube["measures"] = measures
            return str(name)
    if measures:
        cube["measures"] = measures
        return str(next(iter(measures.keys())))

    basis = _first_existing(("comment_id", "report_id", "id"), dimensions.keys())
    if not basis:
        basis = next(iter(dimensions.keys()), "*")
    sql = "COUNT(*)" if basis == "*" else f"COUNT(`{basis}`)"
    measures["total_count"] = {
        "title": "总数" if "评论" not in user_goal else "学生评论数",
        "type": "count",
        "sql": sql,
        "description": "建模助手自动补齐的记录总数指标。",
        "source_data_type": "count",
        "certified": True,
        "non_additive": False,
    }
    cube["measures"] = measures
    return "total_count"


def _default_metric(object_name: str, subject: str, cube_name: str, measure_name: str) -> Dict[str, Any]:
    return {
        "name": _metric_name(object_name, measure_name),
        "title": _metric_title(subject, measure_name),
        "object_name": object_name,
        "semantic_formula": f"按 Cube measure {cube_name}.{measure_name} 计算",
        "description": f"{subject}相关的默认业务指标。",
        "semantic_labels": [subject, "建模助手"],
        "measure_refs": [f"{cube_name}.{measure_name}"],
        "aliases": [f"{subject}数"],
        "status": "draft",
    }


def _repair_measure_refs(value: Any, cube_name: str, measure_name: str) -> list[str]:
    refs = value if isinstance(value, list) else []
    valid = f"{cube_name}.{measure_name}"
    if not refs:
        return [valid]
    repaired: list[str] = []
    for ref in refs:
        ref_text = str(ref or "")
        if "." not in ref_text or ref_text in {"candidate cube.measure", "cube.measure"}:
            repaired.append(valid)
            continue
        parsed_cube, parsed_measure = ref_text.split(".", 1)
        if parsed_cube in {"candidate cube", "candidate", "cube"}:
            repaired.append(valid)
        elif parsed_measure != measure_name:
            repaired.append(valid)
        else:
            repaired.append(f"{cube_name}.{parsed_measure}")
    return repaired or [valid]


def _default_time_dimension(cube: Dict[str, Any]) -> Optional[str]:
    dimensions = cube.get("dimensions") or {}
    default_time = cube.get("default_time_dimension")
    if default_time and default_time in dimensions:
        return str(default_time)
    preferred = (
        "comment_published_at",
        "published_at",
        "comment_time",
        "comment_date",
        "report_created_at",
        "created_at",
        "ds",
    )
    found = _first_existing(preferred, dimensions.keys())
    if found:
        return found
    for name, payload in dimensions.items():
        if isinstance(payload, dict) and str(payload.get("type") or "").lower() in {"time", "date", "datetime"}:
            return str(name)
    return None


def _default_grain(
    cube: Dict[str, Any],
    dimensions: Dict[str, Dict[str, Any]],
    time_dimension: Optional[str],
) -> str:
    preferred_school = _first_existing(
        ("comment_school_id", "school_id", "school_name", "comment_school_name", "reporter_school_name"),
        dimensions.keys(),
    )
    parts = [item for item in (preferred_school, time_dimension) if item]
    if not preferred_school and cube.get("grain") and str(cube["grain"]) not in parts:
        parts.append(str(cube["grain"]))
    if parts:
        return ",".join(parts)
    if cube.get("grain"):
        return str(cube["grain"])
    primary = next((name for name, dim in dimensions.items() if isinstance(dim, dict) and dim.get("primary_key")), None)
    return str(primary or next(iter(dimensions.keys()), "row"))


def _merge_evidence_items(
    items: list[Dict[str, Any]],
    cube_name: str,
    measure_name: str,
    user_goal: str,
    source_mode: str,
) -> list[Dict[str, Any]]:
    result = [deepcopy(item) for item in items if isinstance(item, dict)]
    if result:
        return result
    ids = {str(item.get("id")) for item in result}
    if "cube-measure-binding" not in ids:
        result.append(
            {
                "id": "cube-measure-binding",
                "type": "certified_cube",
                "trust_level": "P0",
                "source_uri": f"semantic://cubes/{cube_name}",
                "owner": "semantic_owner",
                "claim_key": "metric.measure_ref",
                "extracted_claim": f"{cube_name}.{measure_name}",
            }
        )
    if source_mode == "agent_led" and "agent-user-goal" not in ids and user_goal:
        result.append(
            {
                "id": "agent-user-goal",
                "type": "user_goal",
                "trust_level": "P1",
                "source_uri": "agent-session://user-goal",
                "owner": "business_user",
                "claim_key": "business.question",
                "extracted_claim": user_goal,
            }
        )
    return result


def _subject_from_goal(user_goal: str) -> str:
    if "学生" in user_goal and "评论" in user_goal:
        return "学生评论"
    if "评论" in user_goal:
        return "评论"
    return ""


def _should_force_student_comment_canonical(spec: Dict[str, Any], user_goal: str) -> bool:
    if not _is_student_comment_goal(user_goal):
        return False
    haystack = " ".join(
        str(value or "")
        for value in (
            ((spec.get("cube") or {}).get("name") if isinstance(spec.get("cube"), dict) else ""),
            ((spec.get("cube") or {}).get("table") if isinstance(spec.get("cube"), dict) else ""),
            ((spec.get("cube") or {}).get("source") if isinstance(spec.get("cube"), dict) else ""),
            ((spec.get("source") or {}).get("table") if isinstance(spec.get("source"), dict) else ""),
        )
    ).lower()
    if "dwd_interaction_comment_reports_df" in haystack:
        return False
    return any(
        token in haystack
        for token in (
            "view_student_answer_analysis",
            "student_answer",
            "answer_records",
            "answer_action",
        )
    )


def _is_student_comment_goal(user_goal: str) -> bool:
    text = (user_goal or "").lower()
    return (
        ("学生" in user_goal and "评论" in user_goal)
        or "学生评论" in user_goal
        or "student_comment" in text
        or ("student" in text and "comment" in text)
    )


def _apply_student_comment_canonical_spec(spec: Dict[str, Any]) -> None:
    table = "dwd_interaction_comment_reports_df"
    database = "df_cb_258187"
    spec["source"] = {
        "source_kind": "physical_table",
        "source_id": 1,
        "database": database,
        "schema": None,
        "table": table,
    }
    business = spec.setdefault("business", {})
    if isinstance(business, dict):
        business["subject"] = business.get("subject") or "学生评论"
        business["sensitivity_level"] = business.get("sensitivity_level") or "restricted"
    spec["cube"] = {
        "name": table,
        "title": "学生评论",
        "description": "互动域-学生笔记/评论举报事实表",
        "table": table,
        "source": f"{database}.{table}",
        "source_id": 1,
        "source_database": database,
        "data_source": "maxcompute",
        "status": (spec.get("cube") or {}).get("status") or "draft",
        "grain": "report_id",
        "entity_key": "report_id",
        "dimensions": {
            "comment_school_id": {
                "title": "被举报内容发布者学校ID",
                "type": "number",
                "sql": "`comment_school_id`",
                "primary_key": False,
            },
            "comment_school_name": {
                "title": "被举报内容发布者学校名称",
                "type": "string",
                "sql": "`comment_school_name`",
                "primary_key": False,
            },
            "comment_published_at": {
                "title": "被举报内容发布时间",
                "type": "time",
                "sql": "`comment_published_at`",
                "primary_key": False,
            },
            "report_id": {
                "title": "举报ID",
                "type": "number",
                "sql": "`report_id`",
                "primary_key": True,
            },
        },
        "measures": {
            "total_count": {
                "title": "学生评论数",
                "type": "count",
                "sql": "COUNT(`report_id`)",
                "description": "按举报记录统计学生评论数。",
                "source_data_type": "count",
                "certified": True,
                "non_additive": False,
            }
        },
        "default_time_dimension": "comment_published_at",
    }


def _object_name(subject: str, cube_name: str) -> str:
    if "学生" in subject and "评论" in subject:
        return "student_comment"
    if "评论" in subject:
        return "comment"
    return cube_name[:-1] if cube_name.endswith("s") and not cube_name.endswith("ss") else cube_name


def _metric_name(object_name: str, measure_name: str) -> str:
    if measure_name == "total_count":
        return f"{object_name}_total_count"
    return f"{object_name}_{measure_name}"


def _metric_title(subject: str, measure_name: str) -> str:
    if measure_name == "total_count":
        return f"{subject}总数"
    if measure_name.endswith("count"):
        return f"{subject}数"
    return f"{subject}{measure_name}"


def _first_existing(candidates: Iterable[str], keys: Iterable[str]) -> Optional[str]:
    key_set = {str(key) for key in keys}
    for candidate in candidates:
        if candidate in key_set:
            return candidate
    return None
