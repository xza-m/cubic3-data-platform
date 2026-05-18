"""语义建模 Copilot 的候选数据来源召回。"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from app.domain.entities.dataset import Dataset
from app.domain.entities.table_cache import DataSourceTableCache
from app.application.semantic.source_candidate_scoring import SourceCandidateScoringConfig


class SourceCandidateRecallService:
    """从已有语义资产、Dataset 与 datasource 表缓存召回建模源候选。

    该服务只读本地元数据缓存，不在用户对话过程中实时探测外部数据库；
    这样可以保证 Chat 主链路低延迟、可审计，并且不会把源库可用性问题带进建模体验。
    """

    _SYNONYMS: Dict[str, Sequence[str]] = {
        "学生": ("student", "stu", "pupil"),
        "评论": ("comment", "comments", "report", "reports", "interaction"),
        "举报": ("report", "reports", "complaint"),
        "学校": ("school", "campus"),
        "班级": ("class", "classroom"),
        "活跃": ("activity", "active", "engagement"),
        "活跃度": ("activity", "active", "engagement"),
        "互动": ("interaction", "engagement"),
        "订单": ("order", "orders"),
        "退款": ("refund", "refunded"),
        "时间": ("time", "date", "dt", "ds", "created", "updated", "published"),
        "最近": ("recent", "latest", "ds", "date", "time"),
    }

    def __init__(
        self,
        *,
        datasource_repository: Any = None,
        table_cache_service: Any = None,
        dataset_repository: Any = None,
        scoring_config: Optional[SourceCandidateScoringConfig] = None,
    ):
        self._datasource_repository = datasource_repository
        self._table_cache_service = table_cache_service
        self._dataset_repository = dataset_repository
        self._scoring_config = scoring_config or SourceCandidateScoringConfig.default()

    def recall(
        self,
        query: str,
        *,
        semantic_assets: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        accessible_datasource_ids: Optional[Iterable[int]] = None,
        limit: int = 5,
    ) -> Dict[str, Any]:
        terms = self._query_terms(query)
        if not terms:
            return self._empty()

        active_ids = self._active_datasource_ids(accessible_datasource_ids)
        candidates: List[Dict[str, Any]] = []
        candidates.extend(self._semantic_candidates(semantic_assets or {}, terms))
        candidates.extend(self._dataset_candidates(terms, active_ids))
        candidates.extend(self._table_candidates(terms, active_ids))
        candidates = [self._apply_intent_adjustment(candidate, query, terms) for candidate in candidates]

        deduped = self._dedupe(candidates)
        ranked = sorted(
            deduped,
            key=lambda item: (
                float(item.get("score") or 0),
                self._asset_priority(str(item.get("asset_type") or "")),
                str(item.get("name") or ""),
            ),
            reverse=True,
        )[: max(1, limit)]

        if not ranked:
            return self._empty()
        state = "single_high" if len(ranked) == 1 and ranked[0].get("confidence") == "high" else "multiple"
        return {
            "summary": f"已召回 {len(ranked)} 个候选数据来源",
            "state": state,
            "candidates": ranked,
            "suggested_action": "confirm_source_candidate",
        }

    @classmethod
    def _query_terms(cls, query: str) -> List[str]:
        text = (query or "").strip()
        if not text:
            return []
        terms: List[str] = []
        lowered = text.lower()
        for token in re.findall(r"[a-zA-Z][a-zA-Z0-9_]*|\d+|[\u4e00-\u9fff]{2,}", lowered):
            terms.append(token)
        for zh, synonyms in cls._SYNONYMS.items():
            if zh in text:
                terms.append(zh)
                terms.extend(synonyms)
        return sorted({term.strip().lower() for term in terms if term and term.strip()})

    def _active_datasource_ids(self, accessible_datasource_ids: Optional[Iterable[int]]) -> Optional[set[int]]:
        explicit = {int(item) for item in accessible_datasource_ids or [] if str(item).strip()}
        active: set[int] = set()
        finder = getattr(self._datasource_repository, "find_all", None)
        if callable(finder):
            for datasource in finder() or []:
                if getattr(datasource, "is_active", True) is False:
                    continue
                ds_id = getattr(datasource, "id", None)
                if ds_id is not None:
                    active.add(int(ds_id))
        if explicit and active:
            return explicit & active
        if explicit:
            return explicit
        return active or None

    def _semantic_candidates(
        self,
        semantic_assets: Dict[str, List[Dict[str, Any]]],
        terms: Sequence[str],
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for bucket, asset_type in (
            ("cubes", "cube"),
            ("cube", "cube"),
            ("objects", "semantic_object"),
            ("metrics", "metric"),
        ):
            for item in semantic_assets.get(bucket) or []:
                if str(item.get("status") or "active") not in {"active", "published", ""}:
                    continue
                score, matched = self._score_candidate(terms, self._candidate_text(item))
                if score <= 0:
                    continue
                source = self._source_payload_from_asset(item)
                candidates.append({
                    **source,
                    "id": str(item.get("id") or f"{asset_type}:{item.get('name') or item.get('title')}"),
                    "asset_type": asset_type,
                    "name": item.get("name") or item.get("title"),
                    "title": item.get("title") or item.get("name"),
                    "score": min(0.95, 0.45 + score),
                    "score_breakdown": self._score_breakdown(0.45, score),
                    "confidence": self._confidence(0.45 + score),
                    "matched_terms": matched,
                    "evidence": ["已有语义资产名称或标题与业务问题匹配"],
                })
        return candidates

    def _dataset_candidates(self, terms: Sequence[str], active_ids: Optional[set[int]]) -> List[Dict[str, Any]]:
        datasets = self._iter_datasets()
        candidates: List[Dict[str, Any]] = []
        for dataset in datasets:
            if getattr(dataset, "is_deleted", False):
                continue
            source_id = getattr(dataset, "source_id", None)
            if active_ids is not None and source_id is not None and int(source_id) not in active_ids:
                continue
            text = " ".join(
                str(getattr(dataset, attr, "") or "")
                for attr in ("dataset_code", "dataset_name", "physical_table", "description")
            )
            score, matched = self._score_candidate(terms, text)
            if score <= 0:
                continue
            database, schema, table = self._parse_table_ref(str(getattr(dataset, "physical_table", "") or ""))
            candidates.append({
                "id": f"dataset:{getattr(dataset, 'id', '')}",
                "asset_type": "dataset",
                "source_kind": "dataset",
                "source_id": int(source_id) if source_id is not None else None,
                "dataset_id": getattr(dataset, "id", None),
                "database": database or None,
                "schema": schema,
                "table": table or str(getattr(dataset, "physical_table", "") or ""),
                "name": getattr(dataset, "dataset_code", None) or getattr(dataset, "dataset_name", None),
                "title": getattr(dataset, "dataset_name", None) or getattr(dataset, "dataset_code", None),
                "score": min(0.98, 0.5 + score),
                "score_breakdown": self._score_breakdown(0.5, score),
                "confidence": self._confidence(0.5 + score),
                "matched_terms": matched,
                "evidence": ["Dataset 名称、描述或物理表与业务问题匹配"],
            })
        return candidates

    def _table_candidates(self, terms: Sequence[str], active_ids: Optional[set[int]]) -> List[Dict[str, Any]]:
        entries = self._iter_table_cache_entries()
        candidates: List[Dict[str, Any]] = []
        for entry in entries:
            datasource_id = getattr(entry, "datasource_id", None)
            if datasource_id is None:
                continue
            if active_ids is not None and int(datasource_id) not in active_ids:
                continue
            database = str(getattr(entry, "database_name", "") or "")
            for table_item in getattr(entry, "table_list", None) or []:
                table, title, comment = self._table_item_fields(table_item)
                if not table:
                    continue
                text = f"{database} {table} {title} {comment}"
                score, matched = self._score_candidate(terms, text)
                if score <= 0:
                    continue
                candidates.append({
                    "id": f"table:{int(datasource_id)}:{database}:{table}",
                    "asset_type": "table",
                    "source_kind": "physical_table",
                    "source_id": int(datasource_id),
                    "database": database,
                    "schema": None,
                    "table": table,
                    "name": f"{database}.{table}" if database else table,
                    "title": title or comment or table,
                    "score": min(0.92, 0.42 + score),
                    "score_breakdown": self._score_breakdown(0.42, score),
                    "confidence": self._confidence(0.42 + score),
                    "matched_terms": matched,
                    "evidence": ["数据源表缓存命中，未实时连接外部库"],
                })
        return candidates

    def _iter_table_cache_entries(self) -> List[Any]:
        fake_entries = getattr(self._table_cache_service, "cached_table_entries", None)
        if fake_entries is not None:
            return list(fake_entries)
        session = getattr(self._table_cache_service, "session", None)
        if session is None:
            return []
        return list(session.query(DataSourceTableCache).all())

    def _iter_datasets(self) -> List[Any]:
        fake_datasets = getattr(self._table_cache_service, "datasets", None)
        if fake_datasets is not None:
            return list(fake_datasets)
        finder = getattr(self._dataset_repository, "find_all", None)
        if callable(finder):
            return list(finder() or [])
        session = getattr(self._table_cache_service, "session", None)
        if session is None:
            return []
        return list(session.query(Dataset).filter(Dataset.is_deleted.is_(False)).all())

    @staticmethod
    def _table_item_fields(item: Any) -> Tuple[str, str, str]:
        if isinstance(item, str):
            return item, "", ""
        if isinstance(item, dict):
            return (
                str(item.get("table_name") or item.get("name") or item.get("table") or "").strip(),
                str(item.get("title") or item.get("display_name") or "").strip(),
                str(item.get("comment") or item.get("description") or "").strip(),
            )
        return (
            str(getattr(item, "table_name", None) or getattr(item, "name", None) or getattr(item, "table", "") or "").strip(),
            str(getattr(item, "title", "") or "").strip(),
            str(getattr(item, "comment", "") or getattr(item, "description", "") or "").strip(),
        )

    @staticmethod
    def _candidate_text(item: Dict[str, Any]) -> str:
        return " ".join(str(item.get(key) or "") for key in ("name", "title", "description", "table", "source"))

    @staticmethod
    def _source_payload_from_asset(item: Dict[str, Any]) -> Dict[str, Any]:
        source = item.get("source") if isinstance(item.get("source"), dict) else {}
        payload = {
            "source_kind": item.get("source_kind") or source.get("source_kind"),
            "source_id": item.get("source_id") or source.get("source_id"),
            "dataset_id": item.get("dataset_id") or source.get("dataset_id"),
            "database": item.get("database") or source.get("database"),
            "schema": item.get("schema") or source.get("schema"),
            "table": item.get("table") or source.get("table"),
        }
        return {key: value for key, value in payload.items() if value not in (None, "")}

    @staticmethod
    def _score_candidate(terms: Sequence[str], text: str) -> Tuple[float, List[str]]:
        lowered = f" {text.lower()} "
        matched: List[str] = []
        score = 0.0
        for term in terms:
            if not term:
                continue
            if re.search(rf"(^|[^a-z0-9]){re.escape(term)}([^a-z0-9]|$)", lowered):
                matched.append(term)
                score += 0.2
            elif term in lowered:
                matched.append(term)
                score += 0.12
        return min(score, 0.5), sorted(set(matched))

    def _apply_intent_adjustment(
        self,
        candidate: Dict[str, Any],
        query: str,
        terms: Sequence[str],
    ) -> Dict[str, Any]:
        rules = self._scoring_config.matching_rules(query, terms)
        if not rules:
            return candidate
        adjusted = dict(candidate)
        text = self._candidate_text(adjusted)
        score = float(adjusted.get("score") or 0)
        breakdown = dict(adjusted.get("score_breakdown") or {})
        evidence = list(adjusted.get("evidence") or [])
        matched_terms = list(adjusted.get("matched_terms") or [])

        for rule in rules:
            if rule.matches_positive_source(text):
                score += rule.domain_boost
                breakdown[rule.positive_breakdown_key] = round(
                    float(breakdown.get(rule.positive_breakdown_key) or 0) + rule.domain_boost,
                    4,
                )
                if rule.matched_term:
                    matched_terms.append(rule.matched_term)
                evidence.append(rule.positive_evidence)
            else:
                score += rule.mismatch_penalty
                breakdown[rule.mismatch_breakdown_key] = round(
                    float(breakdown.get(rule.mismatch_breakdown_key) or 0) + rule.mismatch_penalty,
                    4,
                )

            if rule.matches_negative_source(text):
                score += rule.negative_penalty
                breakdown[rule.negative_breakdown_key] = round(
                    float(breakdown.get(rule.negative_breakdown_key) or 0) + rule.negative_penalty,
                    4,
                )
                evidence.append(rule.negative_evidence)

            if rule.matches_canonical_source(text):
                score += rule.canonical_boost
                breakdown[rule.canonical_breakdown_key] = round(
                    float(breakdown.get(rule.canonical_breakdown_key) or 0) + rule.canonical_boost,
                    4,
                )

        adjusted["score"] = round(max(0.0, min(0.99, score)), 4)
        adjusted["score_breakdown"] = {
            key: round(float(value), 4)
            for key, value in breakdown.items()
            if float(value) != 0
        }
        adjusted["confidence"] = self._confidence(adjusted["score"])
        adjusted["matched_terms"] = sorted({str(item) for item in matched_terms if str(item)})
        adjusted["evidence"] = list(dict.fromkeys(str(item) for item in evidence if str(item)))
        return adjusted

    @staticmethod
    def _score_breakdown(source_base: float, lexical_score: float) -> Dict[str, float]:
        return {
            "source_base": round(source_base, 4),
            "lexical_match": round(lexical_score, 4),
        }

    @staticmethod
    def _confidence(score: float) -> str:
        if score >= 0.8:
            return "high"
        if score >= 0.62:
            return "medium"
        return "low"

    @staticmethod
    def _dedupe(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        best: Dict[str, Dict[str, Any]] = {}
        for item in candidates:
            key = str(item.get("id") or item.get("name") or "")
            if not key:
                continue
            if key not in best or float(item.get("score") or 0) > float(best[key].get("score") or 0):
                best[key] = item
        return list(best.values())

    @staticmethod
    def _asset_priority(asset_type: str) -> int:
        return {"cube": 4, "dataset": 3, "table": 2, "metric": 1, "semantic_object": 1}.get(asset_type, 0)

    @staticmethod
    def _parse_table_ref(ref: str) -> Tuple[str, Optional[str], str]:
        parts = [segment for segment in str(ref or "").split(".") if segment]
        if len(parts) >= 3:
            return ".".join(parts[:-2]), parts[-2], parts[-1]
        if len(parts) == 2:
            return parts[0], None, parts[1]
        if len(parts) == 1:
            return "", None, parts[0]
        return "", None, ""

    @staticmethod
    def _empty() -> Dict[str, Any]:
        return {
            "summary": "没有召回到候选数据来源",
            "state": "no_candidate",
            "candidates": [],
            "suggested_action": "ask_for_source",
        }
