"""Ontology YAML 仓储共享能力。"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Generic, List, Optional, TypeVar

import yaml
from pydantic import BaseModel


T = TypeVar("T", bound=BaseModel)


class YamlEntityStore(Generic[T]):
    def __init__(self, base_dir: str, model_cls: type[T], key_field: str):
        self._dir = Path(base_dir)
        self._model_cls = model_cls
        self._key_field = key_field
        self._cache: Dict[str, T] = {}
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._cache.clear()
        if not self._dir.exists():
            self._loaded = True
            return
        for fp in sorted(self._dir.glob("*.yml")):
            raw = yaml.safe_load(fp.read_text(encoding="utf-8"))
            if not raw:
                continue
            entity = self._model_cls(**raw)
            self._cache[str(getattr(entity, self._key_field))] = entity
        self._loaded = True

    def list_all(self) -> List[T]:
        self._ensure_loaded()
        return list(self._cache.values())

    def get(self, key: str) -> Optional[T]:
        self._ensure_loaded()
        return self._cache.get(key)

    def save(self, entity: T) -> None:
        self._ensure_loaded()
        self._dir.mkdir(parents=True, exist_ok=True)
        key = str(getattr(entity, self._key_field))
        fp = self._dir / f"{key}.yml"
        fp.write_text(yaml.dump(entity.model_dump(exclude_none=True), allow_unicode=True, sort_keys=False), encoding="utf-8")
        self._cache[key] = entity
        self._loaded = True
