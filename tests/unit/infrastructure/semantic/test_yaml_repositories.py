"""YamlCubeRepository / YamlViewRepository / YamlRecipeRepository 单元测试"""
import os
import tempfile

import pytest
import yaml

from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
from app.infrastructure.semantic.yaml_view_repository import YamlViewRepository
from app.infrastructure.semantic.yaml_recipe_repository import YamlRecipeRepository
from app.domain.semantic.entities import CubeDefinition, ViewDefinition, RecipeDefinition


# ── Fixtures ─────────────────────────────────

CUBE_DATA = {
    "name": "test_cube",
    "title": "测试Cube",
    "table": "test_table",
    "dimensions": {"col1": {"title": "列1", "type": "string", "sql": "{CUBE}.col1"}},
    "measures": {"cnt": {"title": "总数", "type": "count", "sql": "{CUBE}.col1"}},
}

VIEW_DATA = {
    "name": "test_view",
    "title": "测试视图",
    "cubes": [{"join_path": "test_cube", "includes": ["col1", "cnt"]}],
}

RECIPE_A = {
    "name": "recipe_a",
    "title": "配方A",
    "tags": ["tag1"],
    "examples": [{
        "question": "问题A",
        "dsl": {
            "measures": ["cube_x.cnt", "cube_x.total"],
            "dimensions": ["cube_y.name"],
        },
    }],
}

RECIPE_B = {
    "name": "recipe_b",
    "title": "配方B",
    "tags": ["tag2"],
    "examples": [{
        "question": "问题B",
        "dsl": {
            "measures": ["cube_y.metric1"],
            "filters": [{"dimension": "cube_x.status", "operator": "equals", "values": ["active"]}],
        },
    }],
}


def _write_yml(directory: str, name: str, data: dict) -> None:
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, f"{name}.yml"), "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, sort_keys=False)


# ── YamlCubeRepository ──────────────────────

class TestYamlCubeRepository:

    def test_list_all_empty_dir(self, tmp_path):
        repo = YamlCubeRepository(str(tmp_path / "cubes"))
        assert repo.list_all() == []

    def test_load_and_list(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        _write_yml(cubes_dir, "test_cube", CUBE_DATA)
        repo = YamlCubeRepository(cubes_dir)
        cubes = repo.list_all()
        assert len(cubes) == 1
        assert cubes[0].name == "test_cube"
        assert cubes[0].table == "test_table"

    def test_get_existing(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        _write_yml(cubes_dir, "test_cube", CUBE_DATA)
        repo = YamlCubeRepository(cubes_dir)
        cube = repo.get("test_cube")
        assert cube is not None
        assert cube.title == "测试Cube"

    def test_get_nonexistent(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        _write_yml(cubes_dir, "test_cube", CUBE_DATA)
        repo = YamlCubeRepository(cubes_dir)
        assert repo.get("no_such_cube") is None

    def test_save_creates_file(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        repo = YamlCubeRepository(cubes_dir)
        cube = CubeDefinition(**CUBE_DATA)
        repo.save(cube)
        assert (tmp_path / "cubes" / "test_cube.yml").exists()
        assert repo.get("test_cube") is not None

    def test_delete(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        _write_yml(cubes_dir, "test_cube", CUBE_DATA)
        repo = YamlCubeRepository(cubes_dir)
        assert repo.delete("test_cube") is True
        assert repo.get("test_cube") is None
        assert not (tmp_path / "cubes" / "test_cube.yml").exists()

    def test_delete_nonexistent(self, tmp_path):
        repo = YamlCubeRepository(str(tmp_path / "cubes"))
        assert repo.delete("nope") is False

    def test_reload(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        _write_yml(cubes_dir, "test_cube", CUBE_DATA)
        repo = YamlCubeRepository(cubes_dir)
        assert len(repo.list_all()) == 1

        cube2 = {**CUBE_DATA, "name": "cube2", "table": "t2"}
        _write_yml(cubes_dir, "cube2", cube2)
        assert len(repo.list_all()) == 1  # 还是缓存

        repo.reload()
        assert len(repo.list_all()) == 2

    def test_invalid_yaml_raises(self, tmp_path):
        cubes_dir = str(tmp_path / "cubes")
        os.makedirs(cubes_dir)
        with open(os.path.join(cubes_dir, "bad.yml"), "w") as f:
            yaml.dump({"name": "bad", "title": "bad"}, f)
        repo = YamlCubeRepository(cubes_dir)
        with pytest.raises(ValueError, match="Failed to load Cube YAML"):
            repo.list_all()


# ── YamlViewRepository ──────────────────────

class TestYamlViewRepository:

    def test_load_and_list(self, tmp_path):
        views_dir = str(tmp_path / "views")
        _write_yml(views_dir, "test_view", VIEW_DATA)
        repo = YamlViewRepository(views_dir)
        views = repo.list_all()
        assert len(views) == 1
        assert views[0].name == "test_view"

    def test_save_and_get(self, tmp_path):
        views_dir = str(tmp_path / "views")
        repo = YamlViewRepository(views_dir)
        view = ViewDefinition(**VIEW_DATA)
        repo.save(view)
        assert repo.get("test_view") is not None

    def test_delete(self, tmp_path):
        views_dir = str(tmp_path / "views")
        _write_yml(views_dir, "test_view", VIEW_DATA)
        repo = YamlViewRepository(views_dir)
        assert repo.delete("test_view") is True
        assert repo.get("test_view") is None


# ── YamlRecipeRepository ────────────────────

class TestYamlRecipeRepository:

    def test_load_and_list(self, tmp_path):
        recipes_dir = str(tmp_path / "recipes")
        _write_yml(recipes_dir, "recipe_a", RECIPE_A)
        _write_yml(recipes_dir, "recipe_b", RECIPE_B)
        repo = YamlRecipeRepository(recipes_dir)
        assert len(repo.list_all()) == 2

    def test_get_by_cube_measures_priority(self, tmp_path):
        """cube_x 在 recipe_a 的 measures 中（高优先级），在 recipe_b 的 filters 中（低优先级）"""
        recipes_dir = str(tmp_path / "recipes")
        _write_yml(recipes_dir, "recipe_a", RECIPE_A)
        _write_yml(recipes_dir, "recipe_b", RECIPE_B)
        repo = YamlRecipeRepository(recipes_dir)

        results = repo.get_by_cube("cube_x")
        assert len(results) == 2
        assert results[0].name == "recipe_a"  # measures 引用 → 优先
        assert results[1].name == "recipe_b"  # filters 引用 → 靠后

    def test_get_by_cube_no_match(self, tmp_path):
        recipes_dir = str(tmp_path / "recipes")
        _write_yml(recipes_dir, "recipe_a", RECIPE_A)
        repo = YamlRecipeRepository(recipes_dir)
        assert repo.get_by_cube("nonexistent") == []

    def test_get_by_cube_limit(self, tmp_path):
        """单次最多返回 5 个"""
        recipes_dir = str(tmp_path / "recipes")
        for i in range(8):
            data = {
                "name": f"r{i}",
                "title": f"R{i}",
                "tags": [],
                "examples": [{"question": "q", "dsl": {"measures": [f"target.m{i}"]}}],
            }
            _write_yml(recipes_dir, f"r{i}", data)
        repo = YamlRecipeRepository(recipes_dir)
        assert len(repo.get_by_cube("target")) == 5

    def test_save_updates_index(self, tmp_path):
        recipes_dir = str(tmp_path / "recipes")
        repo = YamlRecipeRepository(recipes_dir)
        assert repo.get_by_cube("new_cube") == []

        recipe = RecipeDefinition(
            name="new_recipe", title="新配方",
            examples=[{"question": "q", "dsl": {"measures": ["new_cube.m1"]}}],
        )
        repo.save(recipe)
        assert len(repo.get_by_cube("new_cube")) == 1

    def test_delete_updates_index(self, tmp_path):
        recipes_dir = str(tmp_path / "recipes")
        _write_yml(recipes_dir, "recipe_a", RECIPE_A)
        repo = YamlRecipeRepository(recipes_dir)
        assert len(repo.get_by_cube("cube_x")) == 1

        repo.delete("recipe_a")
        assert repo.get_by_cube("cube_x") == []

    def test_reload(self, tmp_path):
        recipes_dir = str(tmp_path / "recipes")
        _write_yml(recipes_dir, "recipe_a", RECIPE_A)
        repo = YamlRecipeRepository(recipes_dir)
        assert len(repo.list_all()) == 1

        _write_yml(recipes_dir, "recipe_b", RECIPE_B)
        repo.reload()
        assert len(repo.list_all()) == 2
        assert len(repo.get_by_cube("cube_y")) == 2
