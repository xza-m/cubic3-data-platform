"""YAML 文件驱动的 Domain 仓储实现。"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml

from app.domain.semantic.entities import DomainDefinition
from app.domain.semantic.ports.domain_repository import IDomainRepository


class YamlDomainRepository(IDomainRepository):
    def __init__(self, domains_dir: str):
        self._dir = Path(domains_dir)
        self._cache: Dict[str, DomainDefinition] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._cache.clear()
        if not self._dir.exists():
            self._loaded = True
            return
        for fp in sorted(self._dir.glob("domain_*.yml")):
            try:
                raw = yaml.safe_load(fp.read_text(encoding="utf-8"))
                if raw:
                    domain = DomainDefinition(**raw)
                    self._cache[domain.id or domain.code] = domain
            except Exception as exc:
                raise ValueError(f"Failed to load Domain YAML '{fp.name}': {exc}") from exc
        self._loaded = True

    def reload(self) -> None:
        self._loaded = False
        self._ensure_loaded()

    def list_all(self) -> List[DomainDefinition]:
        self._ensure_loaded()
        return list(self._cache.values())

    def get(self, domain_id: str) -> Optional[DomainDefinition]:
        self._ensure_loaded()
        return self._cache.get(domain_id)

    def get_by_code(self, code: str) -> Optional[DomainDefinition]:
        self._ensure_loaded()
        for domain in self._cache.values():
            if domain.code == code:
                return domain
        return None

    def save(self, domain: DomainDefinition) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        fp = self._dir / f"domain_{domain.code}.yml"
        data = domain.model_dump(exclude_none=True)
        fp.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        self._cache[domain.id or domain.code] = domain

    def delete(self, domain_id: str) -> bool:
        domain = self.get(domain_id)
        if domain is None:
            return False
        fp = self._dir / f"domain_{domain.code}.yml"
        if fp.exists():
            fp.unlink()
        self._cache.pop(domain.id or domain.code, None)
        return True
