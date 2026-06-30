"""建模助手 spec 补全与发布前自修复。"""
from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Dict, Iterable, Optional

from app.application.semantic.measure_ratio_decomposition import (
    RatioMetricInfo,
    decompose_ratio_measures,
)
from app.application.semantic.source_candidate_scoring import (
    SourceCandidateScoringConfig,
    SourceCandidateScoringRule,
)
from app.domain.ontology.entities import measure_ref_strings, normalize_cube_bindings
from app.domain.semantic.copilot_state import is_reviewable_spec


def has_reviewable_spec(value: Any) -> bool:
    """委托 domain 的权威判定，保留原导入路径兼容现有调用方。"""
    return is_reviewable_spec(value)


def repair_modeling_spec(
    spec: Dict[str, Any],
    *,
    user_goal: str = "",
    source_mode: str = "",
    source_scoring_config: Optional[SourceCandidateScoringConfig] = None,
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
    canonical_rule = _canonical_rule_for_spec(
        repaired,
        user_goal,
        source_scoring_config or SourceCandidateScoringConfig.default(),
    )
    if canonical_rule is not None:
        _apply_canonical_rule_spec(repaired, canonical_rule)
        cube = repaired["cube"]
    _ensure_cube_source_table(repaired, cube)
    cube_name = str(cube.get("name") or cube.get("table") or "semantic_cube")
    cube["name"] = cube_name
    dimensions = _ensure_dimensions(cube, user_goal)
    _ensure_cube_partition_from_evidence(repaired, cube)
    _ensure_partition_time_dimension(cube, dimensions)
    measure_name = _ensure_measure(cube, dimensions, user_goal)
    ratio_by_measure = _decompose_cube_ratio_measures(repaired, cube)

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
        "cube_bindings": normalize_cube_bindings(object_payload.get("cube_bindings"))
        or [{"cube": cube_name, "role": "primary", "entity_key": _default_entity_key(cube)}],
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
        metric["measure_refs"] = _repair_measure_refs(
            metric.get("measure_refs"), cube_name, measure_name, cube.get("measures") or {}
        )
        metric["binding_status"] = "approved"
        metric["grain"] = metric.get("grain") or grain
        if time_dimension:
            metric["time_dimension"] = metric.get("time_dimension") or time_dimension
        ratio_info = _primary_ratio_info(metric, cube_name, ratio_by_measure)
        if ratio_info is not None:
            # 指向 ratio 度量：比率不可相加 → additivity=non_additive；底层度量 non_additive=False
            # 故不触发 metric_additivity_mismatch（该规则只拦 non_additive 度量+additive 指标）。
            metric["additivity"] = "non_additive"
            metric["semantic_formula"] = metric.get("semantic_formula") or ratio_info.semantic_formula
        else:
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


def _decompose_cube_ratio_measures(
    spec: Dict[str, Any],
    cube: Dict[str, Any],
) -> Dict[str, RatioMetricInfo]:
    """把 cube.measures 里非可加均值/比率度量拆成可加 分子/分母 SUM + ratio。

    确定性、推不出权重列则原样保留（安全拒答）。返回 ratio 度量名 → 元信息映射，供
    ontology metric 回写 additivity / semantic_formula。
    """
    measures = cube.get("measures")
    if not isinstance(measures, dict) or not measures:
        return {}
    columns = _columns_for_decomposition(spec, cube)
    result = decompose_ratio_measures(measures, columns=columns)
    if not result.changed:
        return {}
    cube["measures"] = result.measures
    return {info.measure_name: info for info in result.ratios}


def _columns_for_decomposition(spec: Dict[str, Any], cube: Dict[str, Any]) -> list[Dict[str, Any]]:
    snapshot = _schema_snapshot_from_spec(spec, cube)
    columns = snapshot.get("columns") if isinstance(snapshot, dict) else None
    if not isinstance(columns, list):
        return []
    return [col for col in columns if isinstance(col, dict) and col.get("name")]


def _primary_ratio_info(
    metric: Dict[str, Any],
    cube_name: str,
    ratio_by_measure: Dict[str, RatioMetricInfo],
) -> Optional[RatioMetricInfo]:
    if not ratio_by_measure:
        return None
    for ref in measure_ref_strings(metric.get("measure_refs")):
        if "." not in ref:
            continue
        ref_cube, ref_measure = ref.split(".", 1)
        if ref_cube == cube_name and ref_measure in ratio_by_measure:
            return ratio_by_measure[ref_measure]
    return None


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


def _ensure_partition_time_dimension(cube: Dict[str, Any], dimensions: Dict[str, Dict[str, Any]]) -> None:
    """将物理分区字段补成 Cube 时间维度，避免维表冷启动缺默认时间口径。"""
    partition = cube.get("partition")
    if not isinstance(partition, dict):
        return
    field = str(partition.get("field") or "").strip()
    if not field or field in dimensions:
        return
    dimensions[field] = {
        "title": partition.get("title") or field.upper(),
        "type": "time" if str(partition.get("type") or "").lower() in {"date", "time", "datetime"} else "date",
        "sql": f"`{field}`",
        "description": "由源表分区字段自动补齐的默认时间维度。",
        "primary_key": False,
        "source_data_type": partition.get("source_data_type") or partition.get("type") or "date",
    }
    cube["dimensions"] = dimensions


def _ensure_cube_partition_from_evidence(spec: Dict[str, Any], cube: Dict[str, Any]) -> None:
    if isinstance(cube.get("partition"), dict) and cube["partition"].get("field"):
        return
    schema_snapshot = _schema_snapshot_from_spec(spec, cube)
    if not schema_snapshot:
        return
    field = _partition_field_from_schema(schema_snapshot)
    if not field:
        return
    cube["partition"] = {
        "type": "date",
        "field": field,
        "format": "yyyyMMdd",
    }


def _schema_snapshot_from_spec(spec: Dict[str, Any], cube: Dict[str, Any]) -> Dict[str, Any]:
    source = spec.get("source") if isinstance(spec.get("source"), dict) else {}
    for holder in (
        source.get("evidence_bundle") if isinstance(source.get("evidence_bundle"), dict) else {},
        cube.get("asset_evidence") if isinstance(cube.get("asset_evidence"), dict) else {},
    ):
        snapshot = holder.get("schema_snapshot") if isinstance(holder, dict) else None
        if isinstance(snapshot, dict):
            return snapshot
    return {}


def _partition_field_from_schema(schema_snapshot: Dict[str, Any]) -> str:
    partitions = schema_snapshot.get("partitions")
    if isinstance(partitions, list):
        for item in partitions:
            field = str(item or "").strip()
            if field:
                return field
    columns = schema_snapshot.get("columns")
    if isinstance(columns, list):
        for column in columns:
            if not isinstance(column, dict) or not column.get("is_partition"):
                continue
            field = str(column.get("name") or "").strip()
            if field:
                return field
    return ""


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


def _ensure_cube_source_table(spec: Dict[str, Any], cube: Dict[str, Any]) -> None:
    if cube.get("table"):
        return
    source = spec.get("source") if isinstance(spec.get("source"), dict) else {}
    table = str(source.get("table") or "").strip()
    if not table:
        source_ref = str(cube.get("source") or "").strip()
        table = source_ref.split(".")[-1] if source_ref else ""
    if table:
        cube["table"] = table


def _default_metric(object_name: str, subject: str, cube_name: str, measure_name: str) -> Dict[str, Any]:
    return {
        "name": _metric_name(object_name, measure_name),
        "title": _metric_title(subject, measure_name),
        "object_name": object_name,
        "semantic_formula": f"按 Cube measure {cube_name}.{measure_name} 计算",
        "description": f"{subject}相关的默认业务指标。",
        "semantic_labels": [subject, "建模助手"],
        "measure_refs": [{"ref": f"{cube_name}.{measure_name}", "role": "primary"}],
        "aliases": [f"{subject}数"],
        "status": "draft",
    }


def _default_entity_key(cube: Dict[str, Any]) -> Optional[str]:
    dimensions = cube.get("dimensions") or {}
    for field in dimensions:
        lowered = str(field).lower()
        if lowered == "id" or lowered.endswith("_id"):
            return field
    return next(iter(dimensions), None)


def _repair_measure_refs(
    value: Any,
    cube_name: str,
    measure_name: str,
    known_measures: Optional[dict] = None,
) -> list[dict[str, Any]]:
    refs = measure_ref_strings(value if isinstance(value, list) else [])
    valid = f"{cube_name}.{measure_name}"
    known = {str(m) for m in (known_measures or {})}
    if not refs:
        return [{"ref": valid, "role": "primary"}]
    repaired: list[str] = []
    for ref_text in refs:
        if "." not in ref_text or ref_text in {"candidate cube.measure", "cube.measure"}:
            repaired.append(valid)
            continue
        parsed_cube, parsed_measure = ref_text.split(".", 1)
        if parsed_cube in {"candidate cube", "candidate", "cube"}:
            repaired.append(valid)
        elif parsed_measure in known:
            repaired.append(f"{cube_name}.{parsed_measure}")
        else:
            # 非占位符、度量不在 cube.measures（typo / 绑错度量）：保留 ref（规整 cube 名）交给
            # ValidationMatrix 拦截，不再静默改回默认度量蒙混过关（L2 数据正确性）。
            repaired.append(f"{cube_name}.{parsed_measure}")
    deduped = list(dict.fromkeys(repaired)) or [valid]
    return [{"ref": ref, "role": "primary" if index == 0 else "equivalent"} for index, ref in enumerate(deduped)]


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


def _canonical_rule_for_spec(
    spec: Dict[str, Any],
    user_goal: str,
    scoring_config: SourceCandidateScoringConfig,
) -> Optional[SourceCandidateScoringRule]:
    terms = _query_terms(user_goal)
    haystack = " ".join(
        str(value or "")
        for value in (
            ((spec.get("cube") or {}).get("name") if isinstance(spec.get("cube"), dict) else ""),
            ((spec.get("cube") or {}).get("table") if isinstance(spec.get("cube"), dict) else ""),
            ((spec.get("cube") or {}).get("source") if isinstance(spec.get("cube"), dict) else ""),
            ((spec.get("source") or {}).get("table") if isinstance(spec.get("source"), dict) else ""),
        )
    ).lower()
    for rule in scoring_config.matching_rules(user_goal, terms):
        if not rule.canonical_spec:
            continue
        if rule.matches_canonical_source(haystack):
            continue
        if rule.matches_negative_source(haystack):
            return rule
    return None


def _apply_canonical_rule_spec(spec: Dict[str, Any], rule: SourceCandidateScoringRule) -> None:
    canonical = deepcopy(dict(rule.canonical_spec or {}))
    if not canonical:
        return
    old_cube = spec.get("cube") if isinstance(spec.get("cube"), dict) else {}
    if isinstance(canonical.get("source"), dict):
        spec["source"] = canonical["source"]
    canonical_business = canonical.get("business") if isinstance(canonical.get("business"), dict) else {}
    business = spec.setdefault("business", {})
    if isinstance(business, dict):
        for key, value in canonical_business.items():
            business[key] = business.get(key) or value
    canonical_cube = canonical.get("cube") if isinstance(canonical.get("cube"), dict) else None
    if canonical_cube:
        cube = deepcopy(canonical_cube)
        cube["status"] = old_cube.get("status") or cube.get("status") or "draft"
        spec["cube"] = cube


def _query_terms(query: str) -> list[str]:
    text = (query or "").strip()
    if not text:
        return []
    lowered = text.lower()
    terms = re.findall(r"[a-zA-Z][a-zA-Z0-9_]*|\d+|[\u4e00-\u9fff]{2,}", lowered)
    return sorted({term.strip().lower() for term in terms if term.strip()})


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
