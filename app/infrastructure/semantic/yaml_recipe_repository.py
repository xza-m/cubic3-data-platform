"""YAML 文件驱动的 Recipe 仓储实现 — 方案 C：DSL 自动提取 Cube 引用"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Dict, List

import yaml

from app.domain.semantic.entities import RecipeDefinition
from app.domain.semantic.ports.recipe_repository import IRecipeRepository

MAX_RECIPES_PER_CUBE = 5


class YamlRecipeRepository(IRecipeRepository):

    def __init__(self, recipes_dir: str):
        self._dir = Path(recipes_dir)
        self._recipes: Dict[str, RecipeDefinition] = {}
        self._cube_index: Dict[str, List[RecipeDefinition]] = defaultdict(list)
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._recipes.clear()
        self._cube_index.clear()
        if not self._dir.exists():
            self._loaded = True
            return
        for fp in sorted(self._dir.glob("*.yml")):
            try:
                raw = yaml.safe_load(fp.read_text(encoding="utf-8"))
                if raw:
                    recipe = RecipeDefinition(**raw)
                    self._recipes[recipe.name] = recipe
            except Exception as exc:
                raise ValueError(f"Failed to load Recipe YAML '{fp.name}': {exc}") from exc
        self._build_cube_index()
        self._loaded = True

    def _build_cube_index(self) -> None:
        """从每个 Recipe 的 DSL 中提取引用的 Cube 名称，构建反向索引"""
        self._cube_index = defaultdict(list)
        for recipe in self._recipes.values():
            for cube_name in recipe.extract_cube_names():
                self._cube_index[cube_name].append(recipe)

    def reload(self) -> None:
        self._loaded = False
        self._ensure_loaded()

    def list_all(self) -> List[RecipeDefinition]:
        self._ensure_loaded()
        return list(self._recipes.values())

    def get_by_cube(self, cube_name: str) -> List[RecipeDefinition]:
        """返回 DSL 中引用了指定 Cube 的 Recipe，measures 引用优先"""
        self._ensure_loaded()
        candidates = self._cube_index.get(cube_name, [])
        if not candidates:
            return []

        def _priority(recipe: RecipeDefinition) -> int:
            for ex in recipe.examples:
                measures_cubes = {
                    m.split(".", 1)[0]
                    for m in ex.dsl.get("measures", [])
                    if isinstance(m, str) and "." in m
                }
                if cube_name in measures_cubes:
                    return 0
            return 1

        return sorted(candidates, key=_priority)[:MAX_RECIPES_PER_CUBE]

    def save(self, recipe: RecipeDefinition) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        fp = self._dir / f"{recipe.name}.yml"
        data = recipe.model_dump(exclude_none=True)
        fp.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        self._recipes[recipe.name] = recipe
        self._build_cube_index()

    def delete(self, name: str) -> bool:
        fp = self._dir / f"{name}.yml"
        if fp.exists():
            fp.unlink()
            self._recipes.pop(name, None)
            self._build_cube_index()
            return True
        return False
