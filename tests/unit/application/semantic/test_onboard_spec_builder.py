"""OnboardSpecBuilder 纯函数单测：喂构造 columns → 断言 spec 结构/additivity/ratio/sensitive/lift。

纯编排，绕 MaxCompute（不触达 runtime/repo/adapter）：用真实 CubeModelingService（cube_repo /
runtime 传 Mock，build_cube_draft_payload 不触达它们）+ 真实 SemanticModelDraftBuilder（ontology_service
等传 Mock，_build_ontology_from_cube / _detect_sensitive_fields 不依赖它们）。
"""
from unittest.mock import Mock

import pytest

from app.application.semantic.onboard_spec_builder import OnboardSpecBuilder
from app.application.semantic.cube_modeling_service import CubeModelingService
from app.application.semantic.modeling_draft_builder import SemanticModelDraftBuilder


# 一份覆盖全部 case 的构造 columns（与参考脚本 cols 同形：list[{name,type,comment}]）：
#  - answer_cnt（bigint）        → sum 度量（additive）
#  - answer_duration（double）   + 唯一同 stem 计数列 answer_cnt → decompose 出 ratio（additive）
#  - avg_score（double）         → 无唯一同 stem 计数列 → 保留 avg / non_additive
#  - accuracy_rate（double）     → 比率列红线，永不自动拆 → 保留 avg / non_additive
#  - student_id（string dim）    → PII 敏感列
_COLUMNS = [
    {"name": "id", "type": "bigint", "comment": "主键"},
    {"name": "student_id", "type": "string", "comment": "学生ID"},
    {"name": "school_name", "type": "string", "comment": "学校名称"},
    {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
    {"name": "answer_duration", "type": "double", "comment": "答题总时长"},
    {"name": "avg_score", "type": "double", "comment": "平均得分"},
    {"name": "accuracy_rate", "type": "double", "comment": "正确率"},
    {"name": "ds", "type": "string", "comment": "分区日期"},
]


def _make_builder() -> OnboardSpecBuilder:
    cube_modeling_service = CubeModelingService(
        cube_repo=Mock(),
        runtime_binding_service=Mock(),
    )
    draft_builder = SemanticModelDraftBuilder(
        cube_modeling_source_service=Mock(),
        cube_modeling_service=cube_modeling_service,
        ontology_service=Mock(),
    )
    return OnboardSpecBuilder(
        cube_modeling_service=cube_modeling_service,
        draft_builder=draft_builder,
    )


def _build(**overrides):
    params = {
        "source_id": 1,
        "database": "df_cb_258187",
        "table": "dws_probe",
        "columns": _COLUMNS,
        "partitions": ["ds"],
    }
    params.update(overrides)
    return _make_builder().build_onboard_spec(**params)


def _metric_by_ref(ontology, ref: str):
    """按 measure_refs 里的 ref 找到对应 BusinessMetric。"""
    for metric in ontology.get("metrics", []):
        for mr in metric.get("measure_refs", []) or []:
            if (mr or {}).get("ref") == ref:
                return metric
    return None


def test_a_returns_v1_spec_with_three_sections():
    """Test A: 返回 dict，spec_version=='v1'，cube/ontology/governance 三键齐全。"""
    spec = _build()
    assert isinstance(spec, dict)
    assert spec["spec_version"] == "v1"
    assert "cube" in spec
    assert "ontology" in spec
    assert "governance" in spec


def test_b_every_measure_has_a_business_metric():
    """Test B: cube.measures 里每个度量（除骨架已含 total_count）在 ontology.metrics 中都有对应项。"""
    spec = _build()
    cube = spec["cube"]
    ontology = spec["ontology"]
    cube_name = cube["name"]
    for mk in cube.get("measures", {}):
        if mk == "total_count":
            continue
        metric = _metric_by_ref(ontology, f"{cube_name}.{mk}")
        assert metric is not None, f"度量 {mk} 没有对应 BusinessMetric"


def test_c_additivity_is_correct():
    """Test C: sum→additive / 无唯一分母 avg→non_additive / 可拆 ratio→additive，且 ratio 度量存在。"""
    spec = _build()
    cube = spec["cube"]
    ontology = spec["ontology"]
    cube_name = cube["name"]
    measures = cube["measures"]

    # 可拆 ratio：cube 里存在 type=="ratio" 的度量，且其 metric additivity=="additive"
    ratio_keys = [k for k, v in measures.items() if (v or {}).get("type") == "ratio"]
    assert ratio_keys, "应至少有一个被拆出的 ratio 度量"
    for mk in ratio_keys:
        metric = _metric_by_ref(ontology, f"{cube_name}.{mk}")
        assert metric is not None
        assert metric["additivity"] == "additive"

    # sum 列 → additive
    sum_keys = [k for k, v in measures.items() if (v or {}).get("type") == "sum"]
    assert sum_keys, "应至少有一个 sum 度量"
    for mk in sum_keys:
        metric = _metric_by_ref(ontology, f"{cube_name}.{mk}")
        assert metric is not None
        assert metric["additivity"] == "additive"

    # 无唯一分母 avg → non_additive
    avg_keys = [
        k for k, v in measures.items()
        if (v or {}).get("type") == "avg" and (v or {}).get("non_additive")
    ]
    assert avg_keys, "应至少有一个 non_additive avg 度量"
    for mk in avg_keys:
        metric = _metric_by_ref(ontology, f"{cube_name}.{mk}")
        assert metric is not None
        assert metric["additivity"] == "non_additive"


def test_d_governance_sensitive_fields_contains_student_id():
    """Test D: governance.sensitive_fields 含 student_id。"""
    spec = _build()
    assert "student_id" in spec["governance"]["sensitive_fields"]


def test_e_lift_subset_only_lifts_those_measures():
    """Test E: lift 传子集时，额外升的 BusinessMetric 只对应那几个度量（骨架 metric 仍在）。"""
    spec_all = _build()
    cube = spec_all["cube"]
    cube_name = cube["name"]
    measures = cube["measures"]
    obj = spec_all["ontology"]["object"]["name"]

    # 选两个非 total_count 度量做子集
    subset = [mk for mk in measures if mk != "total_count"][:2]
    assert len(subset) == 2

    spec_subset = _build(lift=",".join(subset))
    ontology = spec_subset["ontology"]

    # 骨架 metric 仍在
    skeleton = _metric_by_ref(ontology, f"{cube_name}.total_count")
    assert skeleton is not None

    # 额外升的（name==f"{obj}_{mk}"）只有子集那几个
    lifted_names = {
        m["name"] for m in ontology["metrics"]
        if m["name"] != skeleton["name"]
    }
    expected = {f"{obj}_{mk}" for mk in subset}
    assert lifted_names == expected


def test_signature_is_keyword_only_with_defaults():
    """build_onboard_spec 默认 lift='all'/sensitivity='internal'，且最小入参可调用。"""
    spec = _make_builder().build_onboard_spec(
        source_id=1, database="df", table="dws_probe", columns=_COLUMNS,
    )
    assert spec["spec_version"] == "v1"
    assert spec["governance"]["sensitivity_level"] == "internal"
