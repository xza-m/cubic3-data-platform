"""QueryCompiler — DSL → SQL 编译器"""
from __future__ import annotations

from datetime import datetime, date, timedelta
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
    __slots__ = ("sql", "primary_cube", "joined_cubes", "scoped_table_refs")

    def __init__(
        self,
        sql: str,
        primary_cube: str,
        joined_cubes: List[str],
        scoped_table_refs: List[dict] | None = None,
    ):
        self.sql = sql
        self.primary_cube = primary_cube
        self.joined_cubes = joined_cubes
        # row_scope 注入锚点：[{table, alias, scan_anchor}]，供 gateway apply_scope
        # 做 AST 级注入定位；不改 SQL 文本，canonical_sql_hash 口径不变。
        self.scoped_table_refs = scoped_table_refs or []


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

_RESTRICTED_FIELD_TAGS = {"restricted", "private", "sensitive", "pii", "personal", "privacy"}


def _esc(val: str) -> str:
    """转义 SQL LIKE 通配符"""
    return str(val).replace("'", "''")


def _quote_val(val: Any) -> str:
    if isinstance(val, str):
        return f"'{_esc(val)}'"
    return str(val)


# ── 默认分区窗口（D2：无显式时间口径时注入最近 N 天，绕开 MaxCompute 全表扫描保护）──
DEFAULT_PARTITION_WINDOW_DAYS = 7
_FMT_STRFTIME = {"yyyyMMdd": "%Y%m%d", "yyyy-MM-dd": "%Y-%m-%d"}


class QueryCompiler:

    def __init__(
        self,
        join_graph: JoinGraph,
        dialect: Optional[SQLDialect] = None,
        *,
        today: date | None = None,
    ):
        self._graph = join_graph
        self._dialect = dialect or MaxComputeDialect()
        self._today = today

    # ── 公共入口 ──

    def compile(self, dsl: QueryDSL) -> CompileResult:
        """将 QueryDSL 编译为 SQL"""
        cube_names = self._collect_cube_names(dsl)
        cubes = self._load_cubes(cube_names)
        primary = self._determine_primary(dsl, cubes)
        self._validate_cube_contracts(cubes)
        self._validate_requested_field_visibility(dsl, cubes)

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

        _qi = self._dialect.quote_identifier

        # 1. SELECT — dimensions
        for ref in dsl.dimensions:
            alias = self._ref_alias(ref)
            expr = self._resolve_dimension_expr(ref, cubes)
            select_parts.append(f"  {expr} AS {_qi(alias)}")
            group_by_parts.append(_qi(alias))

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
                select_parts.append(f"  {expr} AS {_qi(alias)}")
                group_by_parts.append(_qi(alias))
            else:
                expr = raw_col

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
            select_parts.append(f"  {expr} AS {_qi(alias)}")

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

        # 7. WHERE — partition latest_expr 优先 > 默认日期窗口 > 不注入（D1/D2）
        for cube in cubes.values():
            part = cube.partition
            if not part:
                continue
            if self._has_explicit_partition_filter(dsl, cube):
                continue  # 守护 D3：用户已显式过滤分区字段 → 不动
            if part.latest_expr:
                # 既有契约：静态 latest_expr cube 走 MAX_PT（8 个 dim cube 不变）
                condition = f"{cube.name}.{part.field} = {part.latest_expr}"
            elif part.type == "date" and not str(cube.source_sql or "").strip():
                # 默认窗口：date 型分区 + 物理表（非 source_sql 派生）→ 注入最近 N 天
                today = self._today or date.today()
                win = min(DEFAULT_PARTITION_WINDOW_DAYS, max(part.max_range_days - 1, 1))
                start = today - timedelta(days=win - 1)
                fmt = self._fmt_strftime(part.format)  # 未知 format → CompilationError（D5）
                start_ds = start.strftime(fmt)
                end_ds = today.strftime(fmt)
                condition = self._dialect.partition_condition(
                    f"{cube.name}.{part.field}", start_ds, end_ds, part.format
                )
            else:
                continue  # 非 date 型 / source_sql 派生 → 不注入
            if cube.name == primary.name:
                where_parts.append(condition)
            elif cube.name in join_on_parts:
                join_on_parts[cube.name].append(condition)

        # 8. ORDER BY
        for pair in dsl.order:
            ref = pair[0]
            direction = pair[1] if len(pair) > 1 else "asc"
            alias = self._ref_alias(ref)
            order_by_parts.append(f"{_qi(alias)} {direction.upper()}")

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
        scoped_table_refs = [
            {"table": primary.table, "alias": primary.name, "scan_anchor": "from"}
        ]
        for edge in join_edges:
            scoped_table_refs.append(
                {
                    "table": cubes[edge.target].table,
                    "alias": edge.target,
                    "scan_anchor": "join",
                }
            )
        return CompileResult(
            sql=sql,
            primary_cube=primary.name,
            joined_cubes=joined,
            scoped_table_refs=scoped_table_refs,
        )

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
    def _fmt_strftime(fmt: str) -> str:
        """分区 format → strftime；未知 format → CompilationError（D5：禁止静默产错字面量）。"""
        mapped = _FMT_STRFTIME.get(fmt)
        if mapped is None:
            raise CompilationError(
                f"Unsupported partition format for default window: '{fmt}'"
            )
        return mapped

    def _has_explicit_partition_filter(self, dsl: QueryDSL, cube: CubeDefinition) -> bool:
        """守护 D3：按 DSL 结构判定 filters / time_dimensions 是否已显式命中分区字段。

        命中即返 True → 块7 跳过默认注入（不 override 用户显式过滤，亦防与
        :150-158 既有 date_range 注入重复）。比对 (cube.name, part.field)。
        """
        part = cube.partition
        if part is None:
            return False
        for td in dsl.time_dimensions:
            if td.date_range and self._parse_ref(td.dimension) == (cube.name, part.field):
                return True
        for f in dsl.filters:
            if self._parse_ref(f.target) == (cube.name, part.field):
                return True
        return False

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

    def _validate_requested_field_visibility(
        self,
        dsl: QueryDSL,
        cubes: Dict[str, CubeDefinition],
    ) -> None:
        """Agent-first Runtime 默认不允许 DSL 直接投影或过滤 restricted 字段。"""
        for ref in dsl.measures:
            self._raise_if_restricted_measure(ref, cubes)
        for ref in dsl.dimensions:
            self._raise_if_restricted_dimension(ref, cubes)
        for filt in dsl.filters:
            self._raise_if_restricted_dimension(filt.target, cubes)
        for td in dsl.time_dimensions:
            self._raise_if_restricted_dimension(td.dimension, cubes)
        for pair in dsl.order:
            if not pair:
                continue
            ref = pair[0]
            if not self._raise_if_restricted_measure(ref, cubes, missing_ok=True):
                self._raise_if_restricted_dimension(ref, cubes, missing_ok=True)

    def _raise_if_restricted_dimension(
        self,
        ref: str,
        cubes: Dict[str, CubeDefinition],
        *,
        missing_ok: bool = False,
    ) -> bool:
        cube_name, dim_name = self._parse_ref(ref)
        cube = cubes.get(cube_name)
        if cube is None or dim_name not in cube.dimensions:
            if missing_ok:
                return False
            return False
        dim = cube.dimensions[dim_name]
        tag = self._first_restricted_tag(dim.tags)
        if tag:
            raise CompilationError(f"Field '{ref}' is tagged restricted ({tag}) and cannot be used in QueryDSL")
        return True

    def _raise_if_restricted_measure(
        self,
        ref: str,
        cubes: Dict[str, CubeDefinition],
        *,
        missing_ok: bool = False,
    ) -> bool:
        cube_name, measure_name = self._parse_ref(ref)
        cube = cubes.get(cube_name)
        if cube is None or measure_name not in cube.measures:
            if missing_ok:
                return False
            return False
        measure = cube.measures[measure_name]
        tag = self._first_restricted_tag(measure.tags)
        if tag:
            raise CompilationError(f"Field '{ref}' is tagged restricted ({tag}) and cannot be used in QueryDSL")
        return True

    @staticmethod
    def _first_restricted_tag(tags: List[str]) -> str | None:
        for tag in tags or []:
            normalized = str(tag or "").strip().lower()
            if normalized in _RESTRICTED_FIELD_TAGS:
                return normalized
        return None

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

        # Agent 生成的 cube spec 可能把完整聚合表达式写进 measure.sql
        # （如 sql="COUNT(`comment_id`)", type="count"），此时不再叠加聚合，
        # 避免编译出 COUNT(COUNT(...)) 这类非法嵌套聚合。
        if self._is_aggregate_expr(raw):
            return raw

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
        elif measure.type == "ratio":
            # ratio 度量的 sql 已是完整比率表达式（如 "{num}/NULLIF({den},0)"），经
            # _resolve_measure_refs 展开成 SUM(分子)/NULLIF(SUM(分母),0)。底层是可加 SUM 对，
            # 跨任意维度 GROUP BY 都按组重算（严格加权），故 non_additive=False、不再叠加聚合。
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

    _AGGREGATE_EXPR_RE = re.compile(r"^\s*(COUNT|SUM|AVG|MIN|MAX)\s*\(", re.IGNORECASE)

    @classmethod
    def _is_aggregate_expr(cls, expr: str) -> bool:
        return bool(cls._AGGREGATE_EXPR_RE.match(expr or ""))

    @classmethod
    def _wrap_agg(cls, mtype: str, expr: str) -> str:
        if cls._is_aggregate_expr(expr):
            return expr
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
        # ratio / number：表达式自带完整聚合口径，作为子引用展开时按原样回填，不再外包聚合。
        return expr
