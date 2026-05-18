"""Access 身份体系模型注册测试。"""

from __future__ import annotations

from app.extensions import db


def test_access_preference_table_is_registered(app):
    assert "access_principal_preferences" in db.metadata.tables
