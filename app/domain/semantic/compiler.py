"""QueryCompiler — DSL → SQL 编译器"""
from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.domain.semantic.dialects import MaxComputeDialect, SQLDialect
from app.domain.semantic.entities import (
    CubeDefinition,
    DimensionDef,
    MeasureDef,
    QueryDSL,
)
from app.domain.semantic.join_graph import JoinGraph


class CompilationError(Exception):
    """编译错误基类"""


class UnknownCubeError(CompilationError):
    def __init__(self, cube_name: str):
        super().__init__(f"Unknown Cube: '{cube_name}'")
        self.cube_name = cube_name


class UnknownFieldError(CompilationError):
    def __init__(self, reference: str, field_type: str = "field"):
        super().__init__(f"Unknown {field_type}: '{reference}'")
        self.reference = reference


class CompileResult:
    __slots__ = ("sql", "primary_cube", "joined_cubes")

    def __init__(self, sql: str, primary_cube: str, joined_cubes: List[str]):
        self.sql = sql
        self.primary_cube = primary_cube
        self.joined_cubes = joined_cubes


# ── filter 操作符 → SQL 模板 ──

_QUOTED_OPS = {
    "equals":      lambda f, v: f"{f} = {v[0]}" if len(v) == 1 else f"{f} IN ({', '.join(v)})",
    "notEquals":   lambda f, v: f"{f} != {v[0]}" if len(v) == 1 else f"{f} NOT IN ({', '.join(v)})",
    "gt":          lambda f, v: f"{f} > {v[0]}",
    "gte":         lambda f, v: f"{f} >= {v[0]}",
    "lt":          lambda f, v: f"{f} < {v[0]}",
    "lte":         lambda f, v: f"{f} <= {v[0]}",
    "set":         lambda f, v: f"{f} IS NOT NULL",
    "notSet":      lambda f, v: f"{f} IS NULL",
}

_RAW_OPS = {
    "contains":    lambda f, v: f"{f} LIKE '%{_esc(v[0])}%'",
    "notContains": lambda f, v: f"{f} NOT LIKE '%{_esc(v[0])}%'",
    "startsWith":  lambda f, v: f"{f} LIKE '{_esc(v[0])}%'",
    "endsWith":    lambda f, v: f"{f} LIKE '%{_esc(v[0])}'",
}


def _esc(val: str) -> str:
    """转义 SQL LIKE 通配符"""
    return str(val).replace("'", "''")


def _quote_val(val: Any) -> str:
    if isinstance(val, str):
        return f"'{_esc(val)}'"
    return str(val)


class QueryCompiler:

    def __init__(
        self,
        join_graph: JoinGraph,
        dialect: Optional[SQLDialect] = None,
    ):
        self._graph = join_graph
        self._dialect = dialect or MaxComputeDialect()

    # ── 公共入口 ──

    def compile(self, dsl: QueryDSL) -> CompileResult:
        """将 QueryDSL 编译为 SQL"""
        cube_names = self._collect_cube_names(dsl)
        cubes = self._load_cubes(cube_names)
        primary = self._determine_primary(dsl, cubes)
        self._validate_cube_contracts(cubes)

        if dsl.join_path and len(dsl.join_path) >= 2:
            join_edges = self._graph.find_path_through(dsl.join_path)
            primary = cubes.get(dsl.join_path[0], primary)
        elif len(cube_names) > 1:
            join_edges = self._graph.resolve_join_paths(cube_names, root=primary.name)
        else:
            join_edges = []

        self._ensure_edge_cubes_loaded(join_edges, cubes)
        self._validate_join_relationships(dsl, join_edges)
        self._validate_measure_semantics(dsl, cubes)

        select_parts: List[str] = []
        group_by_parts: List[str] = []
        where_parts: List[str] = []
        order_by_parts: List[str] = []
        join_on_parts: Dict[str, List[str]] = {edge.target: [] for edge in join_edges}

        # 1. SELECT — dimensions
        for ref in dsl.dimensions:
            alias = self._ref_alias(ref)
            expr = self._resolve_dimension_expr(ref, cubes)
            select_parts.append(f"  {expr} AS `{alias}`")
            group_by_parts.append(f"`{alias}`")

        # 2. SELECT — time_dimensions
        for td in dsl.time_dimensions:
            dim_ref = td.dimension
            cube_name, dim_name = self._parse_ref(dim_ref)
            cube = cubes[cube_name]
            dim = self._get_dimension(cube, dim_name)
            raw_col = self._resolve_col(dim.sql, cube_name)

            if td.granularity:
                col_type = "string" if dim.type == "string" else "datetime"
                expr = self._dialect.apply_granularity(raw_col, td.granularity, col_type)
                alias = f"{dim_ref}__{td.granularity}"
                select_parts.append(f"  {expr} AS `{alias}`")
                group_by_parts.append(f"`{alias}`")

            if td.date_range and len(td.date_range) >= 2:
                part = cube.partition
                self._validate_time_range(cube, td.date_range)
                if part and part.field == dim_name:
                    start_ds = td.date_range[0].replace("-", "")
                    end_ds = td.date_range[1].replace("-", "")
                    where_parts.append(self._dialect.partition_condition(
                        f"{cube_name}.{part.field}", start_ds, end_ds, part.format
                    ))
                else:
                    where_parts.append(
                        f"{raw_col} >= '{td.date_range[0]}' AND {raw_col} <= '{td.date_range[1]}'"
                    )

        # 3. SELECT — measures
        for ref in dsl.measures:
            alias = self._ref_alias(ref)
            expr = self._resolve_measure_expr(ref, cubes)
            select_parts.append(f"  {expr} AS `{alias}`")

        # 4. WHERE — default_filters
        for cube in cubes.values():
            for df in cube.default_filters:
                resolved = self._resolve_col(df.sql, cube.name)
                if cube.name == primary.name:
                    where_parts.append(resolved)
                elif cube.name in join_on_parts:
                    join_on_parts[cube.name].append(resolved)

        # 5. WHERE — segments
        for seg_ref in dsl.segments:
            cube_name, seg_name = self._parse_ref(seg_ref)
            cube = cubes[cube_name]
            seg = cube.segments.get(seg_name)
            if seg is None:
                raise UnknownFieldError(seg_ref, "segment")
            where_parts.append(self._resolve_col(seg.sql, cube_name))

        # 6. WHERE — filters
        for filt in dsl.filters:
            dim_ref = filt.target
            cube_name, dim_name = self._parse_ref(dim_ref)
            cube = cubes[cube_name]
            dim = self._get_dimension(cube, dim_name)
            raw_col = self._resolve_col(dim.sql, cube_name)
            if filt.operator in _RAW_OPS:
                raw_vals = [str(v) for v in filt.values]
                where_parts.append(_RAW_OPS[filt.operator](raw_col, raw_vals))
            elif filt.operator in _QUOTED_OPS:
                quoted_vals = [_quote_val(v) for v in filt.values]
                where_parts.append(_QUOTED_OPS[filt.operator](raw_col, quoted_vals))
            else:
                raise CompilationError(f"Unknown filter operator: '{filt.operator}'")

        # 7. WHERE — partition latest_expr
        for cube in cubes.values():
            if cube.partition and cube.partition.latest_expr:
                has_time_range = any(
                    td.date_range and self._parse_ref(td.dimension)[0] == cube.name
                    for td in dsl.time_dimensions
                )
                if not has_time_range:
                    latest_condition = (
                        f"{cube.name}.{cube.partition.field} = {cube.partition.latest_expr}"
                    )
                    if cube.name == primary.name:
                        where_parts.append(latest_condition)
                    elif cube.name in join_on_parts:
                        join_on_parts[cube.name].append(latest_condition)

        # 8. ORDER BY
        for pair in dsl.order:
            ref = pair[0]
            direction = pair[1] if len(pair) > 1 else "asc"
            alias = self._ref_alias(ref)
            order_by_parts.append(f"`{alias}` {direction.upper()}")

        # ── 组装 SQL ──
        from_clause = self._aliased_source_relation(primary)
        join_clauses: List[str] = []
        for edge in join_edges:
            target_cube = cubes[edge.target]
            jt = {
                "left": "LEFT JOIN",
                "inner": "INNER JOIN",
                "right": "RIGHT JOIN",
                "full": "FULL JOIN",
                "left_each": "LEFT JOIN",
            }.get(edge.join_def.type, "INNER JOIN")
            on_parts = [self._resolve_join_sql(edge.join_def.sql, edge.source, cubes)]
            on_parts.extend(join_on_parts.get(edge.target, []))
            on_expr = " AND ".join(on_parts)
            join_clauses.append(f"  {jt} {self._aliased_source_relation(target_cube)} ON {on_expr}")

        limit_val = dsl.limit or self._dialect.default_limit()

        lines = ["SELECT"]
        lines.append(",\n".join(select_parts))
        lines.append(f"FROM {from_clause}")
        if join_clauses:
            lines.append("\n".join(join_clauses))
        if where_parts:
            lines.append("WHERE " + "\n  AND ".join(where_parts))
        if group_by_parts:
            lines.append("GROUP BY " + ", ".join(group_by_parts))
        if order_by_parts:
            lines.append("ORDER BY " + ", ".join(order_by_parts))
        lines.append(f"LIMIT {limit_val}")

        sql = "\n".join(lines)
        joined = [e.target for e in join_edges]
        return CompileResult(sql=sql, primary_cube=primary.name, joined_cubes=joined)

    # ── 私有辅助 ──

    def _collect_cube_names(self, dsl: QueryDSL) -> Set[str]:
        names: Set[str] = set()
        all_refs: List[str] = []
        all_refs.extend(dsl.measures)
        all_refs.extend(dsl.dimensions)
        all_refs.extend(dsl.segments)
        for f in dsl.filters:
            all_refs.append(f.target)
        for td in dsl.time_dimensions:
            all_refs.append(td.dimension)
        for pair in dsl.order:
            all_refs.append(pair[0])
        for ref in all_refs:
            parts = ref.split(".", 1)
            if len(parts) == 2:
                names.add(parts[0])
        return names

    def _load_cubes(self, names: Set[str]) -> Dict[str, CubeDefinition]:
        cubes: Dict[str, CubeDefinition] = {}
        for name in names:
            cube = self._graph.get_cube(name)
            if cube is None:
                raise UnknownCubeError(name)
            cubes[name] = cube
        return cubes

    def _ensure_edge_cubes_loaded(
        self, edges: List, cubes: Dict[str, CubeDefinition]
    ) -> None:
        """确保 JOIN 路径中所有中间节点的 Cube 都已加载到 cubes 字典。"""
        for edge in edges:
            for name in (edge.source, edge.target):
                if name not in cubes:
                    cube = self._graph.get_cube(name)
                    if cube is None:
                        raise UnknownCubeError(name)
                    cubes[name] = cube

    def _determine_primary(self, dsl: QueryDSL, cubes: Dict[str, CubeDefinition]) -> CubeDefinition:
        """主 Cube = measures 中第一个引用的 Cube"""
        if dsl.measures:
            cube_name = dsl.measures[0].split(".")[0]
            return cubes[cube_name]
        if dsl.dimensions:
            cube_name = dsl.dimensions[0].split(".")[0]
            return cubes[cube_name]
        raise CompilationError("DSL must have at least one measure or dimension")

    @staticmethod
    def _source_relation(cube: CubeDefinition) -> str:
        source_sql = str(cube.source_sql or "").strip()
        if source_sql:
            if source_sql.endswith(";"):
                source_sql = source_sql[:-1].rstrip()
            return f"(\n{source_sql}\n)"
        return cube.table

    @classmethod
    def _aliased_source_relation(cls, cube: CubeDefinition) -> str:
        relation = cls._source_relation(cube)
        separator = " AS " if relation.startswith("(") else " "
        return f"{relation}{separator}{cube.name}"

    @staticmethod
    def _parse_ref(ref: str) -> Tuple[str, str]:
        parts = ref.split(".", 1)
        if len(parts) != 2:
            raise CompilationError(f"Invalid reference format: '{ref}', expected 'cube.field'")
        return parts[0], parts[1]

    @staticmethod
    def _ref_alias(ref: str) -> str:
        return ref.replace(".", "__")

    def _get_dimension(self, cube: CubeDefinition, dim_name: str) -> DimensionDef:
        dim = cube.dimensions.get(dim_name)
        if dim is None:
            raise UnknownFieldError(f"{cube.name}.{dim_name}", "dimension")
        return dim

    def _get_measure(self, cube: CubeDefinition, m_name: str) -> MeasureDef:
        m = cube.measures.get(m_name)
        if m is None:
            raise UnknownFieldError(f"{cube.name}.{m_name}", "measure")
        return m

    def _resolve_col(self, sql_expr: str, cube_name: str) -> str:
        """把 {CUBE} 占位符替换为实际 cube_name"""
        resolved = sql_expr.replace("{CUBE}", cube_name)
        if "{CUBE}" not in sql_expr and "{" not in sql_expr:
            resolved = re.sub(
                r"(?<!\.)\b([A-Za-z_][\w]*)\b(?=\s*(=|!=|<>|>|<|>=|<=|IN\b|NOT\s+IN\b|LIKE\b|IS\b))",
                lambda match: (
                    match.group(1)
                    if "." in match.group(1)
                    else f"{cube_name}.{match.group(1)}"
                ),
                resolved,
            )
        return resolved

    def _resolve_join_sql(
        self,
        sql: str,
        source_cube_name: str,
        cubes: Dict[str, CubeDefinition],
    ) -> str:
        """替换 join SQL 中的 {cube_name} 占位符"""
        result = sql
        for name in cubes:
            result = result.replace(f"{{{name}}}", name)
        result = result.replace("{CUBE}", source_cube_name)
        return result

    def _validate_join_relationships(self, dsl: QueryDSL, join_edges: List) -> None:
        if not dsl.measures:
            return

        for edge in join_edges:
            relationship = (edge.join_def.relationship or "N:1").upper()
            if relationship in {"1:N", "N:N"}:
                raise CompilationError(
                    f"JOIN relationship '{relationship}' is not supported for measure queries: "
                    f"{edge.source} -> {edge.target}"
                )

    @staticmethod
    def _validate_cube_contracts(cubes: Dict[str, CubeDefinition]) -> None:
        for cube in cubes.values():
            if cube.grain and cube.grain not in cube.dimensions:
                raise CompilationError(
                    f"Cube '{cube.name}' declares grain='{cube.grain}' but the dimension does not exist"
                )
            if cube.entity_key and cube.entity_key not in cube.dimensions:
                raise CompilationError(
                    f"Cube '{cube.name}' declares entity_key='{cube.entity_key}' but the dimension does not exist"
                )

    def _validate_measure_semantics(
        self,
        dsl: QueryDSL,
        cubes: Dict[str, CubeDefinition],
    ) -> None:
        if not dsl.measures:
            return

        has_grouping = bool(dsl.dimensions or dsl.time_dimensions)
        if not has_grouping:
            return

        for ref in dsl.measures:
            cube_name, measure_name = self._parse_ref(ref)
            measure = self._get_measure(cubes[cube_name], measure_name)
            if measure.non_additive:
                raise CompilationError(
                    f"Measure '{ref}' is marked non_additive and cannot be queried with grouped dimensions or time buckets"
                )

    def _validate_time_range(self, cube: CubeDefinition, date_range: List[str]) -> None:
        if cube.partition is None or cube.partition.max_range_days <= 0 or len(date_range) < 2:
            return

        try:
            start = datetime.strptime(date_range[0], "%Y-%m-%d")
            end = datetime.strptime(date_range[1], "%Y-%m-%d")
        except ValueError as exc:
            raise CompilationError(
                f"Invalid date_range for cube '{cube.name}': expected YYYY-MM-DD"
            ) from exc

        if end < start:
            raise CompilationError(
                f"Invalid date_range for cube '{cube.name}': end date is earlier than start date"
            )

        range_days = (end - start).days + 1
        if range_days > cube.partition.max_range_days:
            raise CompilationError(
                f"Date range for cube '{cube.name}' exceeds max_range_days="
                f"{cube.partition.max_range_days}: {range_days} days"
            )

    def _resolve_dimension_expr(self, ref: str, cubes: Dict[str, CubeDefinition]) -> str:
        cube_name, dim_name = self._parse_ref(ref)
        cube = cubes[cube_name]
        dim = self._get_dimension(cube, dim_name)
        return self._resolve_col(dim.sql, cube_name)

    def _resolve_measure_expr(self, ref: str, cubes: Dict[str, CubeDefinition]) -> str:
        cube_name, m_name = self._parse_ref(ref)
        cube = cubes[cube_name]
        measure = self._get_measure(cube, m_name)
        raw = self._resolve_col(measure.sql, cube_name)

        raw = self._resolve_measure_refs(raw, cube_name, cubes)

        if measure.type == "count":
            return f"COUNT({raw})"
        elif measure.type == "count_distinct":
            return f"COUNT(DISTINCT {raw})"
        elif measure.type == "sum":
            return f"SUM({raw})"
        elif measure.type == "avg":
            return f"AVG({raw})"
        elif measure.type == "min":
            return f"MIN({raw})"
        elif measure.type == "max":
            return f"MAX({raw})"
        elif measure.type == "number":
            return raw
        else:
            raise CompilationError(f"Unsupported measure type: '{measure.type}'")

    def _resolve_measure_refs(
        self, expr: str, cube_name: str, cubes: Dict[str, CubeDefinition]
    ) -> str:
        """把 {other_measure} 引用递归展开（最多 5 层防止无限递归）"""
        for _ in range(5):
            refs = re.findall(r"\{(\w+)\}", expr)
            if not refs:
                break
            for ref_name in refs:
                cube = cubes[cube_name]
                sub_m = cube.measures.get(ref_name)
                if sub_m:
                    sub_expr = self._resolve_col(sub_m.sql, cube_name)
                    sub_expr = self._wrap_agg(sub_m.type, sub_expr)
                    expr = expr.replace(f"{{{ref_name}}}", sub_expr)
        return expr

    @staticmethod
    def _wrap_agg(mtype: str, expr: str) -> str:
        if mtype == "count":
            return f"COUNT({expr})"
        elif mtype == "count_distinct":
            return f"COUNT(DISTINCT {expr})"
        elif mtype == "sum":
            return f"SUM({expr})"
        elif mtype == "avg":
            return f"AVG({expr})"
        elif mtype == "min":
            return f"MIN({expr})"
        elif mtype == "max":
            return f"MAX({expr})"
        return expr
