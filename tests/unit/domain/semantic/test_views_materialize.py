# tests/unit/domain/semantic/test_views_materialize.py
"""SemanticViewMaterializeRun 领域实体单元测试。"""
from datetime import datetime, timezone

import pytest


class TestSemanticViewMaterializeRunModel:
    """ORM 模型字段与 to_dict() 序列化。"""

    def test_to_dict_all_fields_present(self, app):
        """实例化并调用 to_dict()，确认所有字段均存在。"""
        from app.domain.semantic.views_materialize import SemanticViewMaterializeRun

        now = datetime(2026, 4, 20, 12, 0, 0)
        run = SemanticViewMaterializeRun(
            id=1, view_id=42, status="running",
            started_at=now, finished_at=None, error=None,
        )
        d = run.to_dict()
        assert d["id"] == 1
        assert d["view_id"] == 42
        assert d["status"] == "running"
        assert d["started_at"] == now.isoformat()
        assert d["finished_at"] is None
        assert d["error"] is None

    def test_to_dict_with_finished_at(self, app):
        """finished_at 存在时，序列化为 ISO 字符串。"""
        from app.domain.semantic.views_materialize import SemanticViewMaterializeRun

        start = datetime(2026, 4, 20, 12, 0, 0)
        end = datetime(2026, 4, 20, 12, 5, 0)
        run = SemanticViewMaterializeRun(
            id=2, view_id=10, status="idle",
            started_at=start, finished_at=end, error=None,
        )
        d = run.to_dict()
        assert d["finished_at"] == end.isoformat()

    def test_to_dict_with_error(self, app):
        """error 字段序列化。"""
        from app.domain.semantic.views_materialize import SemanticViewMaterializeRun

        run = SemanticViewMaterializeRun(
            id=3, view_id=10, status="failed",
            started_at=datetime(2026, 1, 1), finished_at=datetime(2026, 1, 1),
            error="timeout",
        )
        assert run.to_dict()["error"] == "timeout"

    def test_to_dict_started_at_none_branch(self, app):
        """started_at 为 None 时，序列化结果也为 None。"""
        from app.domain.semantic.views_materialize import SemanticViewMaterializeRun

        run = SemanticViewMaterializeRun(
            id=4, view_id=10, status="running",
            started_at=None, finished_at=None, error=None,
        )
        assert run.to_dict()["started_at"] is None

    def test_tablename(self, app):
        """确认表名映射正确。"""
        from app.domain.semantic.views_materialize import SemanticViewMaterializeRun

        assert SemanticViewMaterializeRun.__tablename__ == "semantic_view_materialize_runs"
