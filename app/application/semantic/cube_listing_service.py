# app/application/semantic/cube_listing_service.py
"""
Cube 列表派生字段服务（B-back-7）。

职责：在 semantic_service.list_cubes() 基础上，一次性补充四个派生字段：
  - dimension_count   (已存在，直接透传)
  - measure_count     (已存在，直接透传)
  - downstream_bi_count  (当前无 BI 关联表，返回 0，详见 TODO)
  - last_modified_at  (YAML 文件 mtime 或注册表时间戳，单次批量获取)

性能目标：100 cube 列表 P95 ≤ 300ms（见 tests/integration/semantic/test_cube_list_derivatives.py）

注意：不修改 SemanticDefinitionService.list_cubes()，只在此层做增量包装，
      保持底层服务对其他消费方透明。
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class CubeListingService:
    """包装 semantic_service，附加派生字段后返回增强 cube 列表。"""

    def __init__(self, semantic_service, cube_repo=None, cubes_dir: str | None = None):
        """
        Args:
            semantic_service: SemanticLayerService — 提供基础 list_cubes()
            cube_repo:        YamlCubeRepository — 可选，用于读取文件元数据
            cubes_dir:        YAML 文件目录路径 — 若传入则直接读 mtime；
                              若未传入则从 cube_repo._dir 推断。
        """
        self._svc = semantic_service
        self._cube_repo = cube_repo
        self._cubes_dir: Path | None = None
        if cubes_dir:
            self._cubes_dir = Path(cubes_dir)
        elif cube_repo is not None:
            repo_dir = getattr(cube_repo, "_dir", None)
            if repo_dir is not None:
                self._cubes_dir = Path(repo_dir)

    # ── 公开接口 ─────────────────────────────────────────────────────────────

    def list_cubes_with_derivatives(self) -> list[dict[str, Any]]:
        """返回带有四个派生字段的 cube 列表（单次批量，无 N+1）。"""
        cubes = self._svc.list_cubes()

        # 一次批量获取所有 YAML 文件 mtime
        mtime_index = self._build_mtime_index()

        # TODO(B-back-7-bi): downstream_bi_count 需 BI/Question 关联表；
        #   当前项目无此关联表，返回 0。
        #   后续实现：JOIN semantic_registry_entries / bi_datasets 按 cube_name 聚合。
        downstream_counts: dict[str, int] = self._build_downstream_bi_counts(cubes)

        enriched = []
        for cube in cubes:
            name = cube.get("name", "")
            enriched.append({
                **cube,
                "dimension_count": cube.get("dimension_count", 0),
                "measure_count": cube.get("measure_count", 0),
                "downstream_bi_count": downstream_counts.get(name, 0),
                "last_modified_at": mtime_index.get(name),
            })
        return enriched

    # ── 私有：批量文件 mtime ─────────────────────────────────────────────────

    def _build_mtime_index(self) -> dict[str, str | None]:
        """一次扫描 cubes_dir，构建 {cube_name: iso_mtime} 索引。

        若目录不可用则返回空 dict（字段会以 None 填充）。
        """
        index: dict[str, str | None] = {}
        if self._cubes_dir is None or not self._cubes_dir.exists():
            return index
        try:
            for fp in self._cubes_dir.glob("*.yml"):
                cube_name = fp.stem
                mtime = fp.stat().st_mtime
                dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
                index[cube_name] = dt.isoformat()
        except Exception:
            logger.warning("cube_mtime_index_failed", exc_info=True)
        return index

    # ── 私有：downstream BI 计数 ─────────────────────────────────────────────

    def _build_downstream_bi_counts(self, cubes: list[dict]) -> dict[str, int]:
        """查询 BI 关联计数，返回 {cube_name: count}。

        TODO(B-back-7-bi): 当 BI/Question 关联表存在时，替换为：
          SELECT cube_name, COUNT(*) FROM bi_cube_refs GROUP BY cube_name
        """
        return {cube.get("name", ""): 0 for cube in cubes}
