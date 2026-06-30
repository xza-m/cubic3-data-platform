"""把非可加的均值/比率度量确定性拆成可加 分子/分母 SUM 对 + ratio 度量。

冷启动建模（cube_modeling_service）与 repair 管线（modeling_spec_repair）复用本模块，
让「各学校的平均答题时长」这类按维度分组的均值/比率问法可答且口径正确——
ratio 度量底层是可加 SUM(分子)/SUM(分母)，跨任意维度 GROUP BY 都按组重算（严格加权），
而不是 average-of-averages。

设计红线（与 compiler 的 non_additive 守卫互补，不放开守卫）：
- 纯函数、确定性，**永不乱猜分母**。推不出高置信权重列就保留原 non_additive 度量（安全拒答）。
- percentile / median / stddev / variance / wow / mom / yoy 等不可由 SUM/SUM 重算的族：跳过。
- **比率列（rate/ratio/pct/率/比例/百分比）一律不自动拆**：比率的分母总体≠比率名所含名词，
  stem 匹配会把 correct_rate 误绑到分子计数 correct_cnt 而非分母 question_cnt，产出静默错数。
  比率类保留 non_additive，交 router 的 UX 兜底诚实拒答（需要显式声明分母才能拆，留待后续）。
- **对计数列求均值**（per-row 平均计数）跳过：正确权重是行数/未知总体，无法确定。
- 仅均值/总量列拆：源列已是 per-row 均值（avg/mean/平均/均值）→ 分子加权 SUM(C*W)；
  源列是普通可加总量 → 分子 SUM(C)。两者除以 SUM(W) 都是跨维严格加权重算。

已知限制（确定性推断的固有边界，非本模块新引入）：源列为 per-row 均值且其「唯一同 stem 计数列」
并非该均值的真实平均基数时（如 avg_session_duration 实际按 user 平均、但同 stem 只有 session_cnt），
加权口径会偏。这类靠列名/注释无法判定，需 grain 元数据或显式权重声明才能根治；当前接受为已知限制。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Set, Tuple


# ── 信号词表 ──────────────────────────────────────────────

# 不可由 SUM/SUM 重算 → 命中即跳过（保留 non_additive 安全拒答）
_NON_RECOMPUTABLE_TOKENS = (
    "percentile", "分位", "median", "中位数", "stddev", "std", "标准差",
    "variance", "方差", "wow", "mom", "yoy", "环比", "同比",
)
# 均值类信号：源列是 per-row 均值，分子需加权 SUM(C*W)
_AVERAGE_TOKENS = ("avg", "mean", "平均", "均值")
# 比率类信号：源列是 per-row 比率，分子需加权 SUM(C*W)（rate*weight = 分子事件）
_RATE_TOKENS = ("rate", "ratio", "pct", "percent", "率", "比例", "百分比")
# 计数（权重）列名信号
_COUNT_NAME_TOKENS = ("cnt", "count", "num", "number")
_COUNT_COMMENT_TOKENS = ("次数", "数量", "计数", "人次", "笔数", "条数", "个数")

# 求 subject stem 时剥离的聚合前缀 / 度量尾缀
_AGG_PREFIX_TOKENS = {
    "avg", "mean", "median", "stddev", "std", "variance", "var",
    "sum", "total", "max", "min", "percentile",
}
_MEASURE_TAIL_TOKENS = {
    "cnt", "count", "num", "number", "duration", "amt", "amount",
    "rate", "ratio", "pct", "percent", "sum", "total", "value",
    "score", "qty", "quantity", "times", "avg", "mean",
}

_NUMERIC_TYPE_TOKENS = ("int", "double", "float", "decimal", "numeric", "bigint", "number", "long", "real")

_AVG_SQL_RE = re.compile(r"^\s*AVG\s*\(\s*`?([A-Za-z_][\w]*)`?\s*\)\s*$", re.IGNORECASE)
_AGG_COL_SQL_RE = re.compile(r"^\s*(?:SUM|COUNT)\s*\(\s*(?:DISTINCT\s+)?`?([A-Za-z_][\w]*)`?\s*\)\s*$", re.IGNORECASE)
_PERCENTILE_RE = re.compile(r"(?:^|[^a-z0-9])p\d{1,3}(?:$|[^a-z0-9])", re.IGNORECASE)
_PERCENTILE_CN_RE = re.compile(r"\d{1,3}\s*分位")


# ── 结果结构 ──────────────────────────────────────────────

@dataclass(frozen=True)
class RatioMetricInfo:
    """一个被拆分的均值/比率度量的元信息（供 repair 回写 ontology metric）。"""
    measure_name: str
    numerator_measure: str
    denominator_measure: str
    source_column: str
    weight_column: str
    semantic_formula: str
    weighted: bool


@dataclass
class RatioDecompositionResult:
    measures: Dict[str, Dict[str, Any]]
    ratios: List[RatioMetricInfo] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.ratios)

    def ratio_measure_names(self) -> Set[str]:
        return {r.measure_name for r in self.ratios}


@dataclass(frozen=True)
class _ColumnMeta:
    name: str
    comment: str
    type: str

    @property
    def numeric(self) -> bool:
        return _is_numeric_type(self.type)


# ── 公共入口 ──────────────────────────────────────────────

def decompose_ratio_measures(
    measures: Mapping[str, Mapping[str, Any]],
    *,
    columns: Optional[Iterable[Any]] = None,
) -> RatioDecompositionResult:
    """把 measures 中 type=avg 且 non_additive 的真·均值/比率度量拆成可加 SUM 对 + ratio。

    入参 measures 为度量载荷 dict（与 ``MeasureDef.model_dump()`` 同形）。返回新的 measures
    dict（原样拷贝 + 新增分子/分母 + 原度量同名改写成 ratio）与被拆分度量的元信息列表。
    不可拆分的度量原样保留（含 non_additive=True 的安全拒答态）。
    """
    out: Dict[str, Dict[str, Any]] = {name: dict(payload) for name, payload in measures.items()}
    ratios: List[RatioMetricInfo] = []

    column_metas = _normalize_columns(columns)
    count_columns = _collect_count_columns(column_metas, measures)
    column_lookup = {meta.name.lower(): meta for meta in column_metas}

    for name, payload in list(measures.items()):
        if str(payload.get("type") or "") != "avg":
            continue
        if not payload.get("non_additive"):
            continue

        source_col = _AVG_SQL_RE.match(str(payload.get("sql") or "") or "")
        if source_col is None:
            continue  # 非简单 AVG(col)：不安全，跳过
        c_name = source_col.group(1)

        col_meta = column_lookup.get(c_name.lower())
        c_comment = col_meta.comment if col_meta else ""
        # 度量名恒为 avg_*（含 "avg"），故「源列是否本身已是均值/率」只看源列名+列注释，
        # 不看度量名，避免误判普通可加列（如总量列 answer_duration）为加权。
        c_text = f"{c_name} {c_comment}".lower()
        full_text = f"{name} {c_text} {payload.get('title') or ''} {payload.get('description') or ''}".lower()

        if _is_non_recomputable(full_text):
            continue  # 分位/中位数/标准差/方差/环比/同比 等不可重算 → 保留 non_additive

        if _is_count_column(c_name, c_comment):
            # 对计数列求均值（per-row 平均计数），正确权重是行数/未知总体，无法确定 → 保留 non_additive
            continue

        if _has_token(c_text, _RATE_TOKENS):
            # 比率列：其分母总体≠比率名所含名词，stem 匹配会误绑到分子计数（correct_rate→correct_cnt
            # 而非 question_cnt），产出静默错数。分母无法确定性推断 → 保留 non_additive，交 UX 兜底。
            continue

        weight = _select_weight(c_name, count_columns)
        if weight is None:
            continue  # 推不出高置信权重列（唯一同 stem 计数列）→ 保留 non_additive（不乱猜分母）

        weighted = _has_token(c_text, _AVERAGE_TOKENS)
        num_name, num_payload = _build_numerator(c_name, weight, weighted, payload)
        den_name, den_payload = _build_denominator(weight)

        num_name = _ensure_measure(out, num_name, num_payload)
        den_name = _ensure_measure(out, den_name, den_payload)

        formula = _semantic_formula(c_name, weight, weighted)
        out[name] = _to_ratio_measure(payload, num_name, den_name, formula)
        ratios.append(
            RatioMetricInfo(
                measure_name=name,
                numerator_measure=num_name,
                denominator_measure=den_name,
                source_column=c_name,
                weight_column=weight,
                semantic_formula=formula,
                weighted=weighted,
            )
        )

    return RatioDecompositionResult(measures=out, ratios=ratios)


# ── 列元数据归一化与计数列收集 ──────────────────────────────

def _normalize_columns(columns: Optional[Iterable[Any]]) -> List[_ColumnMeta]:
    metas: List[_ColumnMeta] = []
    for col in columns or []:
        if isinstance(col, _ColumnMeta):
            metas.append(col)
            continue
        if isinstance(col, Mapping):
            name = str(col.get("name") or col.get("field") or "").strip()
            if not name:
                continue
            comment = str(col.get("comment") or col.get("description") or "")
            ctype = str(col.get("type") or col.get("source_data_type") or col.get("data_type") or "")
            metas.append(_ColumnMeta(name=name, comment=comment, type=ctype))
            continue
        # 兼容对象式列（带 name/comment/type 属性）
        name = str(getattr(col, "name", "") or getattr(col, "field", "") or "").strip()
        if not name:
            continue
        comment = str(getattr(col, "comment", "") or getattr(col, "description", "") or "")
        ctype = str(getattr(col, "type", "") or getattr(col, "source_data_type", "") or "")
        metas.append(_ColumnMeta(name=name, comment=comment, type=ctype))
    return metas


def _collect_count_columns(
    column_metas: List[_ColumnMeta],
    measures: Mapping[str, Mapping[str, Any]],
) -> List[Tuple[str, Set[str]]]:
    """收集候选计数（权重）列：列元数据中数值型计数列 + 现有 SUM/COUNT 度量暴露的计数列。"""
    found: Dict[str, Set[str]] = {}
    for meta in column_metas:
        if _is_count_column(meta.name, meta.comment) and (meta.numeric or not meta.type):
            found.setdefault(meta.name, _subject_tokens(meta.name))
    # repair 场景列元数据可能不全：从 SUM/COUNT 度量的源列里补计数列
    for payload in measures.values():
        m = _AGG_COL_SQL_RE.match(str(payload.get("sql") or "") or "")
        if not m:
            continue
        col = m.group(1)
        if _is_count_column(col, str(payload.get("description") or "")):
            found.setdefault(col, _subject_tokens(col))
    return list(found.items())


# ── 权重列选择（高置信，否则 None）──────────────────────────

def _select_weight(
    c_name: str,
    count_columns: List[Tuple[str, Set[str]]],
) -> Optional[str]:
    """仅接受「唯一同 subject-stem 的计数列」作为权重，否则 None（安全拒答）。

    仅用于均值/总量列（比率列已在调用前拒绝）。对均值，唯一同 stem 计数列即其平均基数
    （avg_answer_duration ↔ answer_cnt），不存在比率那种「分子计数冒充分母」的系统性误绑。
    多个 stem 命中 / 无命中 / 仅与自身同名 → 一律 None，绝不靠「全局唯一计数列」之类弱信号猜。
    """
    if not count_columns:
        return None
    c_lower = c_name.lower()
    c_subjects = _subject_tokens(c_name)
    if not c_subjects:
        return None
    stem_matches = [
        name for name, subj in count_columns
        if name.lower() != c_lower and (c_subjects & subj)
    ]
    return stem_matches[0] if len(stem_matches) == 1 else None


# ── 度量构造 ──────────────────────────────────────────────

def _build_numerator(
    c_name: str,
    weight: str,
    weighted: bool,
    origin: Mapping[str, Any],
) -> Tuple[str, Dict[str, Any]]:
    title = str(origin.get("title") or _humanize(c_name))
    if weighted:
        name = f"wsum_{_strip_agg_prefix(c_name)}"
        sql = f"SUM(`{c_name}` * `{weight}`)"
        m_title = f"{title}·加权合计"
        desc = f"为 ratio 度量自动补齐的可加加权分子：SUM(`{c_name}` * `{weight}`)。"
    else:
        name = f"sum_{c_name}"
        sql = f"SUM(`{c_name}`)"
        m_title = f"{title}合计"
        desc = f"为 ratio 度量自动补齐的可加分子：SUM(`{c_name}`)。"
    return name, {
        "title": m_title,
        "type": "sum",
        "sql": sql,
        "description": desc,
        "non_additive": False,
        "certified": False,
    }


def _build_denominator(weight: str) -> Tuple[str, Dict[str, Any]]:
    name = f"sum_{weight}"
    return name, {
        "title": f"{_humanize(weight)}合计",
        "type": "sum",
        "sql": f"SUM(`{weight}`)",
        "description": f"为 ratio 度量自动补齐的可加分母：SUM(`{weight}`)。",
        "non_additive": False,
        "certified": False,
    }


def _to_ratio_measure(
    origin: Mapping[str, Any],
    num_name: str,
    den_name: str,
    formula: str,
) -> Dict[str, Any]:
    """同名改写：保留业务语义（title/desc/format/unit/synonyms/tags/certified），换成可加 ratio。"""
    ratio = dict(origin)
    ratio["type"] = "ratio"
    ratio["sql"] = f"{{{num_name}}} / NULLIF({{{den_name}}}, 0)"
    ratio["non_additive"] = False
    note = f"按维度分组的加权重算口径：{formula}。"
    existing = str(origin.get("description") or "").strip()
    ratio["description"] = f"{existing} {note}".strip() if existing else note
    return ratio


def _ensure_measure(measures: Dict[str, Dict[str, Any]], name: str, payload: Dict[str, Any]) -> str:
    """已存在等价 SQL 的度量则复用其名；否则新增（名冲突时退避加权重列后缀）。"""
    target_sql = _norm_sql(payload["sql"])
    for existing_name, existing in measures.items():
        if _norm_sql(str(existing.get("sql") or "")) == target_sql:
            return existing_name
    final_name = name
    suffix = 2
    while final_name in measures and _norm_sql(str(measures[final_name].get("sql") or "")) != target_sql:
        final_name = f"{name}_{suffix}"
        suffix += 1
    measures[final_name] = payload
    return final_name


# ── 小工具 ────────────────────────────────────────────────

def _semantic_formula(c_name: str, weight: str, weighted: bool) -> str:
    numerator = f"SUM(`{c_name}` * `{weight}`)" if weighted else f"SUM(`{c_name}`)"
    return f"{numerator} / SUM(`{weight}`)"


def _has_token(text: str, tokens: Iterable[str]) -> bool:
    """ASCII 词以词边界匹配（避免 "duration" 命中 "ratio"），中文词按子串匹配。"""
    for tok in tokens:
        if not tok:
            continue
        if tok.isascii():
            if re.search(rf"(?<![a-z0-9]){re.escape(tok)}(?![a-z0-9])", text):
                return True
        elif tok in text:
            return True
    return False


def _is_non_recomputable(text: str) -> bool:
    if _PERCENTILE_RE.search(text) or _PERCENTILE_CN_RE.search(text):
        return True
    return _has_token(text, _NON_RECOMPUTABLE_TOKENS)


def _is_count_column(name: str, comment: str) -> bool:
    lname = name.lower()
    tokens = [t for t in lname.split("_") if t]
    if any(t in _COUNT_NAME_TOKENS for t in tokens):
        return True
    if lname.endswith(("cnt", "count")):
        return True
    if comment and _has_token(comment, _COUNT_COMMENT_TOKENS):
        return True
    return False


def _is_numeric_type(db_type: str) -> bool:
    lower = str(db_type or "").lower()
    return any(token in lower for token in _NUMERIC_TYPE_TOKENS)


def _subject_tokens(name: str) -> Set[str]:
    toks = [t for t in name.lower().split("_") if t]
    cleaned: List[str] = []
    for t in toks:
        if t in _AGG_PREFIX_TOKENS:
            continue
        if re.fullmatch(r"p\d{1,3}", t):
            continue
        if t in _MEASURE_TAIL_TOKENS:
            continue
        cleaned.append(t)
    return set(cleaned)


def _strip_agg_prefix(name: str) -> str:
    toks = [t for t in name.lower().split("_") if t]
    while toks and (toks[0] in _AGG_PREFIX_TOKENS or re.fullmatch(r"p\d{1,3}", toks[0])):
        toks.pop(0)
    return "_".join(toks) or name.lower()


def _norm_sql(sql: str) -> str:
    return re.sub(r"\s+", "", str(sql or "")).lower()


def _humanize(name: str) -> str:
    return re.sub(r"[_\-]+", " ", str(name)).strip() or name
