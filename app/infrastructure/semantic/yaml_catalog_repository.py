"""YAML 文件驱动的 Catalog 仓储实现。"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml

from app.domain.semantic.entities import CatalogDefinition
from app.domain.semantic.ports.catalog_repository import ICatalogRepository


class YamlCatalogRepository(ICatalogRepository):
    def __init__(self, catalogs_dir: str):
        self._dir = Path(catalogs_dir)
        self._cache: Dict[str, CatalogDefinition] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._cache.clear()
        if not self._dir.exists():
            self._loaded = True
            return
        for fp in sorted(self._dir.glob("*.yml")):
            try:
                raw = yaml.safe_load(fp.read_text(encoding="utf-8"))
                if raw:
                    catalog = CatalogDefinition(**raw)
                    self._cache[catalog.code] = catalog
            except Exception as exc:
                raise ValueError(f"Failed to load Catalog YAML '{fp.name}': {exc}") from exc
        self._loaded = True

    def reload(self) -> None:
        self._loaded = False
        self._ensure_loaded()

    def list_all(self) -> List[CatalogDefinition]:
        self._ensure_loaded()
        return list(self._cache.values())

    def get(self, code: str) -> Optional[CatalogDefinition]:
        self._ensure_loaded()
        return self._cache.get(code)

    def save(self, catalog: CatalogDefinition) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        fp = self._dir / f"{catalog.code}.yml"
        data = catalog.model_dump(exclude_none=True)
        fp.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        self._cache[catalog.code] = catalog

    def delete(self, code: str) -> bool:
        self._ensure_loaded()
        catalog = self._cache.get(code)
        if catalog is None:
            return False
        fp = self._dir / f"{catalog.code}.yml"
        if fp.exists():
            fp.unlink()
        self._cache.pop(code, None)
        return True
