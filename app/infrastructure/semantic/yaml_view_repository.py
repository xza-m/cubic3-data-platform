"""YAML 文件驱动的 View 仓储实现"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml

from app.domain.semantic.entities import ViewDefinition
from app.domain.semantic.ports.view_repository import IViewRepository


class YamlViewRepository(IViewRepository):

    def __init__(self, views_dir: str):
        self._dir = Path(views_dir)
        self._cache: Dict[str, ViewDefinition] = {}
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
                    view = ViewDefinition(**raw)
                    self._cache[view.name] = view
            except Exception as exc:
                raise ValueError(f"Failed to load View YAML '{fp.name}': {exc}") from exc
        self._loaded = True

    def reload(self) -> None:
        self._loaded = False
        self._ensure_loaded()

    def list_all(self) -> List[ViewDefinition]:
        self._ensure_loaded()
        return list(self._cache.values())

    def get(self, name: str) -> Optional[ViewDefinition]:
        self._ensure_loaded()
        return self._cache.get(name)

    def save(self, view: ViewDefinition) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        fp = self._dir / f"{view.name}.yml"
        data = view.model_dump(exclude_none=True)
        fp.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        self._cache[view.name] = view

    def delete(self, name: str) -> bool:
        fp = self._dir / f"{name}.yml"
        if fp.exists():
            fp.unlink()
            self._cache.pop(name, None)
            return True
        return False
