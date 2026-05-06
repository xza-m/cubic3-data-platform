"""领域建模服务。"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import hashlib
import json
from typing import Any, Callable, Dict, List, Optional

from app.domain.semantic.entities import (
    CatalogDefinition,
    DomainDefinition,
    generate_catalog_code,
    generate_domain_code,
)
from app.domain.semantic.ports.catalog_repository import ICatalogRepository
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.semantic.ports.domain_repository import IDomainRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


class DomainModelingService:
    DEFAULT_CATALOG_CODE = "default"
    DEFAULT_CATALOG_NAME = "默认目录"

    def __init__(
        self,
        domain_repo: IDomainRepository,
        catalog_repo: Optional[ICatalogRepository],
        cube_repo: ICubeRepository,
        registry_repo: Optional[ISemanticRegistryRepository] = None,
        cache_invalidator: Optional[Callable[[], None]] = None,
    ):
        self._domain_repo = domain_repo
        self._catalog_repo = catalog_repo
        self._cube_repo = cube_repo
        self._registry_repo = registry_repo
        self._cache_invalidator = cache_invalidator
        self._ensure_default_catalog()

    def list_domains(self) -> List[Dict[str, Any]]:
        now = datetime.utcnow()
        result: List[Dict[str, Any]] = []
        for domain in self._domain_repo.list_all():
            summary = self._build_state_summary(domain, now=now)
            catalog = self._resolve_catalog_definition(domain.catalog_code)
            result.append(
                {
                    "id": domain.id,
                    "code": domain.code,
                    "name": domain.name,
                    "catalog_code": catalog.code,
                    "catalog_name": catalog.name,
                    "description": domain.description or "",
                    "status": domain.status,
                    "owner": domain.owner,
                    "cube_count": len(domain.cubes),
                    "join_count": 0,
                    "state_summary": summary,
                }
            )
        return result

    def list_catalogs(self) -> List[Dict[str, Any]]:
        domains_by_catalog: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for domain_summary in self.list_domains():
            domains_by_catalog[domain_summary["catalog_code"]].append(domain_summary)

        result: List[Dict[str, Any]] = []
        for catalog in self._list_catalog_definitions():
            domains = sorted(domains_by_catalog.get(catalog.code, []), key=lambda item: item["name"])
            result.append(
                {
                    "code": catalog.code,
                    "name": catalog.name,
                    "description": catalog.description or "",
                    "status": catalog.status,
                    "sort_order": catalog.sort_order,
                    "domain_count": len(domains),
                    "active_count": sum(1 for item in domains if item["status"] == "active"),
                    "draft_count": sum(1 for item in domains if item["status"] == "draft"),
                    "domains": domains,
                }
            )
        result.sort(
            key=lambda item: (
                item["code"] != self.DEFAULT_CATALOG_CODE,
                item["sort_order"],
                item["name"],
            )
        )
        return result

    def create_catalog(self, payload: Dict[str, Any]) -> CatalogDefinition:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ApplicationException("创建目录失败: 必须提供目录名称")
        code = str(payload.get("code", "")).strip() or self._generate_unique_catalog_code(name)
        if self._catalog_repo and self._catalog_repo.get(code):
            raise ApplicationException(f"目录已存在: {code}")
        catalog = CatalogDefinition(
            code=code,
            name=name,
            description=(payload.get("description") or "").strip() or None,
            status=payload.get("status") or "active",
            sort_order=int(payload.get("sort_order") or 100),
        )
        if self._catalog_repo is None:
            raise ApplicationException("当前环境未启用目录仓储，无法创建目录")
        self._catalog_repo.save(catalog)
        self._catalog_repo.reload()
        return catalog

    def update_catalog(self, catalog_code: str, payload: Dict[str, Any]) -> CatalogDefinition:
        catalog = self._find_catalog(catalog_code)
        merged = catalog.model_dump(mode="json")
        merged.update(
            {
                "name": str(payload.get("name") or catalog.name).strip() or catalog.name,
                "description": (payload.get("description") if "description" in payload else catalog.description) or None,
                "status": payload.get("status") or catalog.status,
                "sort_order": int(payload.get("sort_order") if payload.get("sort_order") is not None else catalog.sort_order),
            }
        )
        if catalog.code == self.DEFAULT_CATALOG_CODE and merged["status"] != "active":
            raise ApplicationException("默认目录不能归档")
        updated = CatalogDefinition(**merged)
        if self._catalog_repo is None:
            raise ApplicationException("当前环境未启用目录仓储，无法更新目录")
        self._catalog_repo.save(updated)
        self._catalog_repo.reload()
        return updated

    def delete_catalog(self, catalog_code: str) -> None:
        catalog = self._find_catalog(catalog_code)
        if catalog.code == self.DEFAULT_CATALOG_CODE:
            raise ApplicationException("默认目录不能删除")
        if any((domain.catalog_code or self.DEFAULT_CATALOG_CODE) == catalog.code for domain in self._domain_repo.list_all()):
            raise ApplicationException("目录下仍存在领域，删除前请先迁移或归档领域")
        if self._catalog_repo is None or not self._catalog_repo.delete(catalog.code):
            raise ApplicationException(f"删除目录失败: {catalog.code}")
        self._catalog_repo.reload()

    def get_domain(self, domain_id: str) -> DomainDefinition:
        domain = self._find_domain(domain_id)
        self._sync_registry(domain)
        return domain

    def get_domain_detail(self, domain_id: str) -> Dict[str, Any]:
        domain = self.get_domain(domain_id)
        payload = domain.model_dump(mode="json")
        payload["joins"] = []
        return {
            **payload,
            **{
                "catalog_code": self._resolve_catalog_definition(domain.catalog_code).code,
                "catalog_name": self._resolve_catalog_definition(domain.catalog_code).name,
            },
            "state_summary": self._build_state_summary(domain),
            "governance_summary": self._build_governance_summary(domain),
        }

    def get_domain_context_preview(self, domain_id: str) -> Dict[str, Any]:
        """返回 Domain 作为业务上下文和 Agent 候选范围的只读预览。"""
        domain = self.get_domain(domain_id)
        cube_refs = self._normalize_domain_cubes(domain.cubes)
        cube_candidates = []
        missing_cubes = []
        for cube_name in cube_refs:
            cube = self._cube_repo.get(cube_name)
            if cube is None:
                missing_cubes.append(cube_name)
                continue
            cube_candidates.append(
                {
                    "name": cube.name,
                    "title": cube.title,
                    "status": cube.status,
                    "dimension_count": len(cube.dimensions),
                    "measure_count": len(cube.measures),
                }
            )
        catalog = self._resolve_catalog_definition(domain.catalog_code)
        return {
            "domain": {
                "id": domain.id,
                "code": domain.code,
                "name": domain.name,
                "description": domain.description,
                "status": domain.status,
                "owner": domain.owner,
                "catalog_code": catalog.code,
                "catalog_name": catalog.name,
            },
            "role": "business_context",
            "candidate_scope": {
                "cube_refs": cube_refs,
                "cube_candidates": cube_candidates,
                "ontology_refs": domain.ontology_refs,
            },
            "default_context": domain.default_context,
            "agent_hints": domain.agent_hints,
            "execution_truth_source": "cube",
            "business_truth_source": "ontology",
            "issues": [
                {
                    "severity": "warning",
                    "code": "missing_cube",
                    "message": f"Domain 引用的 Cube 不存在: {cube_name}",
                }
                for cube_name in missing_cubes
            ],
        }

    def create_domain(self, payload: Dict[str, Any]) -> DomainDefinition:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ApplicationException("创建领域失败: 必须提供领域名称")
        code = self._generate_unique_code(name)
        domain = DomainDefinition(
            id=code,
            code=code,
            name=name,
            description=(payload.get("description") or "").strip() or None,
            catalog_code=self._resolve_catalog_code_from_payload(payload),
            owner=payload.get("owner"),
            status="draft",
            cubes=[],
            joins=[],
        )
        if self._domain_repo.get(domain.id or domain.code) or self._domain_repo.get_by_code(domain.code):
            raise ApplicationException(f"领域已存在: {domain.code}")
        self._domain_repo.save(domain)
        self._after_save(domain)
        return domain

    def update_domain(self, domain_id: str, payload: Dict[str, Any]) -> DomainDefinition:
        existing = self._find_domain(domain_id)
        merged = existing.model_dump(mode="json")
        merged.update(payload)
        merged["code"] = existing.code
        merged["id"] = existing.id or existing.code
        merged["catalog_code"] = self._resolve_catalog_code_from_payload(payload, existing=existing)
        merged["cubes"] = self._normalize_domain_cubes(merged.get("cubes") or [])
        merged["joins"] = []
        if not payload.get("status"):
            merged["status"] = existing.status
        domain = DomainDefinition(**merged)
        self._domain_repo.save(domain)
        self._after_save(domain)
        return domain

    def _resolve_catalog_code_from_payload(
        self,
        payload: Dict[str, Any],
        *,
        existing: Optional[DomainDefinition] = None,
    ) -> str:
        fallback_code = (existing.catalog_code if existing else "") or self.DEFAULT_CATALOG_CODE
        code = str(payload.get("catalog_code") or fallback_code).strip() or self.DEFAULT_CATALOG_CODE
        self._find_catalog(code)
        return code

    def publish_domain(
        self,
        domain_id: str,
        *,
        cubes: Optional[List[str]] = None,
        joins: Optional[List[Dict[str, Any]]] = None,
    ) -> DomainDefinition:
        existing = self._find_domain(domain_id)
        merged = existing.model_dump(mode="json")
        if cubes is not None:
            merged["cubes"] = cubes
        merged["joins"] = []
        duplicate_cubes = self._find_duplicate_domain_cubes(merged.get("cubes") or [])
        if duplicate_cubes:
            raise ApplicationException(
                "领域发布失败: 同一领域内不能重复引用同一个 Cube: "
                + "、".join(duplicate_cubes)
            )
        merged["cubes"] = self._normalize_domain_cubes(merged.get("cubes") or [])
        try:
            domain = DomainDefinition(**merged)
        except Exception as exc:
            raise ApplicationException(str(exc)) from exc
        diagnostics = self.validate_domain(domain)
        errors = [item for item in diagnostics if item["level"] == "error"]
        if errors:
            raise ApplicationException("领域发布失败: " + "；".join(item["message"] for item in errors))
        duplicate = self._find_duplicate_domain(domain)
        if duplicate is not None:
            raise ApplicationException(
                f"领域发布失败: 当前资产范围与领域 '{duplicate.code}' 完全重复，请复用已有领域或调整候选资产"
            )
        domain = DomainDefinition(**{**domain.model_dump(mode="json"), "status": "active"})
        self._domain_repo.save(domain)
        self._after_save(domain)
        return domain

    def add_cube(self, domain_id: str, cube_name: str) -> DomainDefinition:
        domain = self._find_domain(domain_id)
        if self._cube_repo.get(cube_name) is None:
            raise ApplicationException(f"未找到 Cube: {cube_name}")
        cubes = self._normalize_domain_cubes([*domain.cubes, cube_name])
        return self.publish_domain(domain_id, cubes=cubes)

    def add_join(self, domain_id: str, payload: Dict[str, Any]) -> DomainDefinition:
        raise ApplicationException(
            "Domain 已收窄为业务上下文和资产组织对象，不再维护 Join；请在 Cube 技术语义或 Ontology 业务关系中建模"
        )

    def validate_domain(self, domain: DomainDefinition) -> List[Dict[str, Any]]:
        diagnostics: List[Dict[str, Any]] = []
        for cube_name in domain.cubes:
            cube = self._cube_repo.get(cube_name)
            if cube is None:
                diagnostics.append(
                    {
                        "level": "error",
                        "kind": "missing_cube",
                        "message": f"领域引用的 Cube 不存在: {cube_name}",
                    }
                )
                continue
            if cube.status != "active":
                diagnostics.append(
                    {
                        "level": "error",
                        "kind": "inactive_cube",
                        "message": f"领域发布只允许 active Cube，当前 {cube_name} 为 {cube.status}",
                    }
                )
        return diagnostics

    def _ensure_default_catalog(self) -> None:
        if self._catalog_repo is None:
            return
        if self._catalog_repo.get(self.DEFAULT_CATALOG_CODE) is not None:
            return
        self._catalog_repo.save(
            CatalogDefinition(
                code=self.DEFAULT_CATALOG_CODE,
                name=self.DEFAULT_CATALOG_NAME,
                description="未显式指定目录的领域默认归入这里。",
                status="active",
                sort_order=0,
            )
        )
        self._catalog_repo.reload()

    def _list_catalog_definitions(self) -> List[CatalogDefinition]:
        if self._catalog_repo is None:
            return [
                CatalogDefinition(
                    code=self.DEFAULT_CATALOG_CODE,
                    name=self.DEFAULT_CATALOG_NAME,
                    description="未显式指定目录的领域默认归入这里。",
                    status="active",
                    sort_order=0,
                )
            ]
        self._ensure_default_catalog()
        return self._catalog_repo.list_all()

    def _find_catalog(self, catalog_code: Optional[str]) -> CatalogDefinition:
        code = (catalog_code or "").strip() or self.DEFAULT_CATALOG_CODE
        if self._catalog_repo is None:
            if code != self.DEFAULT_CATALOG_CODE:
                raise ApplicationException(f"未找到目录: {code}")
            return CatalogDefinition(
                code=self.DEFAULT_CATALOG_CODE,
                name=self.DEFAULT_CATALOG_NAME,
                description="未显式指定目录的领域默认归入这里。",
                status="active",
                sort_order=0,
            )
        self._ensure_default_catalog()
        catalog = self._catalog_repo.get(code)
        if catalog is None:
            raise ApplicationException(f"未找到目录: {code}")
        return catalog

    def _resolve_catalog_definition(self, catalog_code: Optional[str]) -> CatalogDefinition:
        if not catalog_code:
            return self._find_catalog(self.DEFAULT_CATALOG_CODE)
        try:
            return self._find_catalog(catalog_code)
        except ApplicationException:
            # 兼容第一阶段遗留数据：未知目录自动回退到默认目录，避免目录页断裂。
            return self._find_catalog(self.DEFAULT_CATALOG_CODE)

    def _find_domain(self, domain_id: str) -> DomainDefinition:
        domain = self._domain_repo.get(domain_id) or self._domain_repo.get_by_code(domain_id)
        if domain is None:
            raise ApplicationException(f"未找到领域: {domain_id}")
        return domain

    def _after_save(self, domain: DomainDefinition) -> None:
        self._sync_registry(domain)
        if self._cache_invalidator is not None:
            self._cache_invalidator()
        self._domain_repo.reload()

    def _sync_registry(self, domain: DomainDefinition) -> None:
        if self._registry_repo is None:
            return
        try:
            payload = domain.model_dump(mode="json", exclude_none=True)
            payload["joins"] = []
            digest = hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
            fingerprint = self._build_domain_fingerprint(domain)
            self._registry_repo.upsert(
                "domain",
                domain.id or domain.code,
                status=domain.status,
                definition_hash=digest,
                last_loaded_at=datetime.utcnow(),
                publish_status="published" if domain.status == "active" else domain.status,
                last_published_at=datetime.utcnow() if domain.status == "active" else None,
                lineage_summary={
                    "cube_count": len(domain.cubes),
                    "cubes": list(domain.cubes),
                },
                source_binding_summary={"domain_code": domain.code, "domain_name": domain.name},
                domain_fingerprint=fingerprint,
            )
            self._registry_repo.commit()
        except Exception as exc:
            logger.warning("domain_registry_sync_failed", domain=domain.code, error=str(exc))

    def _build_state_summary(self, domain: DomainDefinition, now: Optional[datetime] = None) -> Dict[str, Any]:
        summary = {
            "object_type": "domain",
            "object_name": domain.id or domain.code,
            "status": domain.status,
            "sync_status": "ok",
        }
        if self._registry_repo is None:
            return summary
        try:
            entry = self._registry_repo.get("domain", domain.id or domain.code)
            if entry is None:
                self._sync_registry(domain)
                entry = self._registry_repo.get("domain", domain.id or domain.code)
        except Exception as exc:
            logger.warning("domain_registry_summary_failed", domain=domain.code, error=str(exc))
            return summary
        if entry is None:
            return summary
        summary.update(entry.to_summary())
        return summary

    def _build_governance_summary(self, domain: DomainDefinition) -> Dict[str, int]:
        summary = {
            "cube_count": len(domain.cubes),
            "active_cube_count": 0,
            "draft_cube_count": 0,
            "deprecated_cube_count": 0,
            "join_count": 0,
            "dangling_cube_count": 0,
        }
        for cube_name in domain.cubes:
            cube = self._cube_repo.get(cube_name)
            if cube is None:
                summary["dangling_cube_count"] += 1
                continue
            if cube.status == "active":
                summary["active_cube_count"] += 1
            elif cube.status == "draft":
                summary["draft_cube_count"] += 1
            elif cube.status in {"deprecated", "archived"}:
                summary["deprecated_cube_count"] += 1
        return summary

    def _normalize_domain_cubes(self, cubes: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for cube_name in cubes:
            name = str(cube_name).strip()
            if not name or name in seen:
                continue
            normalized.append(name)
            seen.add(name)
        return normalized

    @staticmethod
    def _find_duplicate_domain_cubes(cubes: list[str]) -> list[str]:
        duplicates: list[str] = []
        seen: set[str] = set()
        duplicate_seen: set[str] = set()
        for cube_name in cubes:
            name = str(cube_name).strip()
            if not name:
                continue
            if name in seen and name not in duplicate_seen:
                duplicates.append(name)
                duplicate_seen.add(name)
                continue
            seen.add(name)
        return duplicates

    def _generate_unique_code(self, name: str) -> str:
        base = generate_domain_code(name)
        code = base
        suffix = 2
        while self._domain_repo.get(code) or self._domain_repo.get_by_code(code):
            code = f"{base}_{suffix}"
            suffix += 1
        return code

    def _generate_unique_catalog_code(self, name: str) -> str:
        base = generate_catalog_code(name)
        code = base
        suffix = 2
        while self._catalog_repo is not None and self._catalog_repo.get(code):
            code = f"{base}_{suffix}"
            suffix += 1
        return code

    @staticmethod
    def _build_domain_fingerprint(domain: DomainDefinition) -> str:
        normalized = {
            "cubes": sorted(domain.cubes),
            "ontology_refs": domain.ontology_refs,
            "default_context": domain.default_context,
            "agent_hints": domain.agent_hints,
        }
        payload = json.dumps(normalized, ensure_ascii=False, sort_keys=True)
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()

    def _find_duplicate_domain(self, domain: DomainDefinition) -> Optional[DomainDefinition]:
        fingerprint = self._build_domain_fingerprint(domain)
        for existing in self._domain_repo.list_all():
            if (existing.id or existing.code) == (domain.id or domain.code):
                continue
            if self._build_domain_fingerprint(existing) == fingerprint:
                return existing
        return None
