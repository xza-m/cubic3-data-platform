# tests/unit/application/semantic/test_cube_listing_service.py
"""CubeListingService 单元测试 — 补充 cubes_dir / mtime 逻辑和异常分支。"""
import os
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.application.semantic.cube_listing_service import CubeListingService


def _make_semantic_service(n=3):
    svc = MagicMock()
    svc.list_cubes.return_value = [
        {"name": f"cube_{i}", "dimension_count": i, "measure_count": i + 1}
        for i in range(n)
    ]
    return svc


class TestCubesDirFromParam:
    """cubes_dir 参数显式传入时，_cubes_dir 被设置。"""

    def test_cubes_dir_stored_as_path(self, tmp_path):
        """传入 cubes_dir 字符串后，_cubes_dir 为 Path 实例。"""
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cubes_dir=str(tmp_path),
        )
        assert svc._cubes_dir == tmp_path

    def test_cubes_dir_from_cube_repo(self):
        """未传 cubes_dir 但 cube_repo._dir 存在时，从 repo 推断。"""
        repo = MagicMock()
        repo._dir = "/some/path"
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cube_repo=repo,
        )
        assert svc._cubes_dir == Path("/some/path")


class TestBuildMtimeIndex:
    """_build_mtime_index 扫描 .yml 文件并返回 mtime 索引。"""

    def test_returns_iso_mtime(self, tmp_path):
        """目录下有 .yml 文件时，索引包含 ISO 时间戳。"""
        yml = tmp_path / "order.yml"
        yml.write_text("name: order")
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cubes_dir=str(tmp_path),
        )
        idx = svc._build_mtime_index()
        assert "order" in idx
        datetime.fromisoformat(idx["order"])

    def test_empty_when_no_dir(self):
        """cubes_dir 为 None 时返回空 dict。"""
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cubes_dir=None,
        )
        assert svc._build_mtime_index() == {}

    def test_empty_when_dir_not_exists(self, tmp_path):
        """cubes_dir 指向不存在的路径时返回空 dict。"""
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cubes_dir=str(tmp_path / "nonexistent"),
        )
        assert svc._build_mtime_index() == {}

    def test_exception_in_glob_returns_partial(self, tmp_path, monkeypatch):
        """glob 过程中抛异常时，返回空索引而非崩溃。"""
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cubes_dir=str(tmp_path),
        )
        monkeypatch.setattr(Path, "glob", MagicMock(side_effect=OSError("boom")))
        result = svc._build_mtime_index()
        assert isinstance(result, dict)


class TestListCubesWithDerivativesMtime:
    """list_cubes_with_derivatives 集成 mtime 填充。"""

    def test_last_modified_at_filled_from_yml(self, tmp_path):
        """cubes_dir 有对应 .yml 文件时 last_modified_at 非 None。"""
        (tmp_path / "cube_0.yml").write_text("name: cube_0")
        svc = CubeListingService(
            semantic_service=_make_semantic_service(),
            cubes_dir=str(tmp_path),
        )
        result = svc.list_cubes_with_derivatives()
        cube_0 = next(c for c in result if c["name"] == "cube_0")
        assert cube_0["last_modified_at"] is not None
