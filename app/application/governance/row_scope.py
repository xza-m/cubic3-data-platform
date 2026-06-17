"""row_scope 行级谓词模板：schema 校验与求值。

模板结构（DataPolicy.row_scope，JSON 数组）：

    [
      {
        "dimension_ref": "comment_reports.school_id",  # cube.dimension 语义引用
        "operator": "in",                               # in | eq
        "attribute": "school_ids",                      # PrincipalDataScope 属性名
        "on_missing": "deny"                            # deny | unrestricted
      }
    ]

设计依据：docs/architecture/semantic-binding-and-rls.md §3。
求值发生在 post_compile（行级裁决，见 §5.7 控制点边界表）；
``attribute`` 取值来自 subject 主体的 ``PrincipalContext.data_scopes``。
"""
from __future__ import annotations

import re
from typing import Any

ROW_SCOPE_OPERATORS = {"in", "eq"}
ROW_SCOPE_ON_MISSING = {"deny", "unrestricted"}

_IDENTIFIER_PATTERN = r"^[A-Za-z_][A-Za-z0-9_]*$"


def build_cube_repository_dimension_resolver(cube_repository):
    """基于 cube 仓储构造 dimension_ref → 物理表+列解析器。

    cube 维度 sql 约定为 ``{CUBE}.column`` 或纯列名；表达式型维度
    （非简单标识符）不可作为行级注入锚点，返回 None（上游 fail closed）。

    与编译使用同一 cube 仓储（official manifest 的 catalog.cube_repository
    或非 official 路径的 registry cube_repository），保证「求值与编译同源」。
    """

    if cube_repository is None:
        return None

    def _resolve(dimension_ref: str):
        cube_name, _, dimension_name = str(dimension_ref or "").partition(".")
        if not cube_name or not dimension_name:
            return None
        cube = cube_repository.get(cube_name)
        if cube is None:
            return None
        dimension = (cube.dimensions or {}).get(dimension_name)
        if dimension is None:
            return None
        column = str(getattr(dimension, "sql", "") or "").strip()
        if column.startswith("{CUBE}."):
            column = column[len("{CUBE}.") :].strip()
        if not re.match(_IDENTIFIER_PATTERN, column):
            return None
        table = str(getattr(cube, "table", "") or "").strip()
        if not table:
            return None
        return {"table": table, "column": column}

    return _resolve


def build_catalog_dimension_resolver(catalog):
    """基于 RuntimeSemanticCatalog 构造 dimension_ref → 物理表+列解析器。"""

    if catalog is None:
        return None
    return build_cube_repository_dimension_resolver(catalog.cube_repository)


def validate_row_scope_templates(value: Any) -> tuple[list[dict[str, Any]], str | None]:
    """校验并归一化 row_scope 模板列表。

    返回 ``(normalized_templates, error)``；error 非空时校验失败。
    """

    if value is None:
        return [], None
    if not isinstance(value, list):
        return [], "row_scope 必须是数组"
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            return [], f"row_scope[{index}] 必须是对象"
        dimension_ref = str(item.get("dimension_ref") or "").strip()
        if not dimension_ref or "." not in dimension_ref:
            return [], f"row_scope[{index}].dimension_ref 必须是 cube.dimension 格式"
        operator = str(item.get("operator") or "in").strip().lower()
        if operator not in ROW_SCOPE_OPERATORS:
            return [], f"row_scope[{index}].operator 仅支持 in / eq"
        attribute = str(item.get("attribute") or "").strip()
        if not attribute:
            return [], f"row_scope[{index}].attribute 必填"
        on_missing = str(item.get("on_missing") or "deny").strip().lower()
        if on_missing not in ROW_SCOPE_ON_MISSING:
            return [], f"row_scope[{index}].on_missing 仅支持 deny / unrestricted"
        normalized.append(
            {
                "dimension_ref": dimension_ref,
                "operator": operator,
                "attribute": attribute,
                "on_missing": on_missing,
            }
        )
    return normalized, None


def evaluate_row_scope_templates(
    *,
    templates: list[dict[str, Any]],
    data_scopes: dict[str, Any],
    policy_code: str,
    dimension_resolver,
) -> tuple[list[dict[str, Any]], str | None]:
    """对命中的 allow 策略求值 row_scope 模板。

    - ``data_scopes``：subject 主体的属性 → 值列表映射（请求体声明一律不采信）。
    - ``dimension_resolver(dimension_ref) -> {"table": ..., "column": ...} | None``：
      经与编译同 release 的 manifest catalog 解析 ``dimension.sql`` 为物理表+列。

    返回 ``(entries, deny_reason_code)``：

    - 全部模板可解析且属性有值 → ``(entries, None)``；
    - 任一模板属性缺失且 ``on_missing=deny``，或 dimension_ref 不可解析
      → ``([], "row_scope_unresolved")``（fail closed）；
    - ``on_missing=unrestricted`` 且属性缺失 → 跳过该模板（不限制）。
    """

    entries: list[dict[str, Any]] = []
    for template in templates or []:
        attribute = str(template.get("attribute") or "").strip()
        on_missing = str(template.get("on_missing") or "deny").strip().lower()
        raw_values = (data_scopes or {}).get(attribute)
        values = [str(item).strip() for item in (raw_values or []) if str(item or "").strip()]
        if not values:
            if on_missing == "unrestricted":
                continue
            return [], "row_scope_unresolved"
        dimension_ref = str(template.get("dimension_ref") or "").strip()
        resolved = dimension_resolver(dimension_ref) if dimension_resolver else None
        if not isinstance(resolved, dict) or not resolved.get("table") or not resolved.get("column"):
            return [], "row_scope_unresolved"
        operator = str(template.get("operator") or "in").strip().lower()
        if operator == "eq" and len(values) != 1:
            operator = "in"
        entries.append(
            {
                "table": str(resolved["table"]),
                "column": str(resolved["column"]),
                "operator": operator,
                "values": values,
                "policy_code": policy_code,
                "dimension_ref": dimension_ref,
                "attribute": attribute,
            }
        )
    return entries, None
