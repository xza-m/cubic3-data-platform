# tests/integration/queries/test_scheduled_errors.py
"""
集成测试：ScheduledQuery API 异常分支覆盖

目标：命中 scheduled_queries.py 中每个 except Exception → server_error
以及 EntityNotFoundError → not_found / ValidationError → error 路径。
"""
import pytest
from unittest.mock import MagicMock

BASE = "/api/v1/queries/scheduled"


def _patch_service(monkeypatch, mock_svc):
    """将 _service() 工厂替换为返回 mock_svc。"""
    monkeypatch.setattr(
        "app.interfaces.api.v1.scheduled_queries._service",
        lambda: mock_svc,
    )


# ── list_scheduled: except Exception → server_error ───────────────────────

@pytest.mark.redesign
class TestListScheduledErrors:

    def test_list_server_error(self, client, auth_headers, monkeypatch):
        """list_scheduled 内部异常 → 500"""
        svc = MagicMock()
        svc.list.side_effect = RuntimeError("db connection lost")
        _patch_service(monkeypatch, svc)

        r = client.get(BASE, headers=auth_headers)
        assert r.status_code == 500
        assert "db connection lost" in r.get_json()["message"]


# ── create_scheduled: ValidationError + except Exception ──────────────────

@pytest.mark.redesign
class TestCreateScheduledErrors:

    def test_create_server_error(self, client, auth_headers, monkeypatch):
        """create_scheduled 非 ValidationError 异常 → 500"""
        svc = MagicMock()
        svc.create.side_effect = RuntimeError("unexpected")
        _patch_service(monkeypatch, svc)

        r = client.post(BASE, json={"name": "x"}, headers=auth_headers)
        assert r.status_code == 500

    def test_create_validation_error(self, client, auth_headers, monkeypatch):
        """create_scheduled ValidationError → 400"""
        from app.shared.exceptions import ValidationError
        svc = MagicMock()
        svc.create.side_effect = ValidationError("cron 格式错误")
        _patch_service(monkeypatch, svc)

        r = client.post(BASE, json={"name": "x"}, headers=auth_headers)
        assert r.status_code == 400
        assert "cron" in r.get_json()["message"]


# ── get_scheduled: EntityNotFoundError + except Exception ─────────────────

@pytest.mark.redesign
class TestGetScheduledErrors:

    def test_get_server_error(self, client, auth_headers, monkeypatch):
        """get_scheduled 非 EntityNotFoundError 异常 → 500"""
        svc = MagicMock()
        svc.get.side_effect = RuntimeError("boom")
        _patch_service(monkeypatch, svc)

        r = client.get(f"{BASE}/1", headers=auth_headers)
        assert r.status_code == 500

    def test_get_not_found_error(self, client, auth_headers, monkeypatch):
        """get_scheduled EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.get.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.get(f"{BASE}/1", headers=auth_headers)
        assert r.status_code == 404


# ── update_scheduled: EntityNotFound + Validation + Exception ─────────────

@pytest.mark.redesign
class TestUpdateScheduledErrors:

    def test_update_not_found(self, client, auth_headers, monkeypatch):
        """update_scheduled EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.update.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.patch(f"{BASE}/1", json={"name": "x"}, headers=auth_headers)
        assert r.status_code == 404

    def test_update_validation_error(self, client, auth_headers, monkeypatch):
        """update_scheduled ValidationError → 400"""
        from app.shared.exceptions import ValidationError
        svc = MagicMock()
        svc.update.side_effect = ValidationError("cron invalid")
        _patch_service(monkeypatch, svc)

        r = client.patch(f"{BASE}/1", json={"cron": "bad"}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_server_error(self, client, auth_headers, monkeypatch):
        """update_scheduled 非预期异常 → 500"""
        svc = MagicMock()
        svc.update.side_effect = RuntimeError("disk full")
        _patch_service(monkeypatch, svc)

        r = client.patch(f"{BASE}/1", json={"name": "x"}, headers=auth_headers)
        assert r.status_code == 500


# ── delete_scheduled: EntityNotFound + Exception ──────────────────────────

@pytest.mark.redesign
class TestDeleteScheduledErrors:

    def test_delete_not_found(self, client, auth_headers, monkeypatch):
        """delete_scheduled EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.delete.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.delete(f"{BASE}/1", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_server_error(self, client, auth_headers, monkeypatch):
        """delete_scheduled 非预期异常 → 500"""
        svc = MagicMock()
        svc.delete.side_effect = RuntimeError("oops")
        _patch_service(monkeypatch, svc)

        r = client.delete(f"{BASE}/1", headers=auth_headers)
        assert r.status_code == 500


# ── enable_scheduled: EntityNotFound + Exception ──────────────────────────

@pytest.mark.redesign
class TestEnableScheduledErrors:

    def test_enable_server_error(self, client, auth_headers, monkeypatch):
        """enable_scheduled 非预期异常 → 500"""
        svc = MagicMock()
        svc.enable.side_effect = RuntimeError("scheduler down")
        _patch_service(monkeypatch, svc)

        r = client.post(f"{BASE}/1/enable", headers=auth_headers)
        assert r.status_code == 500

    def test_enable_not_found(self, client, auth_headers, monkeypatch):
        """enable_scheduled EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.enable.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.post(f"{BASE}/1/enable", headers=auth_headers)
        assert r.status_code == 404


# ── disable_scheduled: EntityNotFound + Exception ─────────────────────────

@pytest.mark.redesign
class TestDisableScheduledErrors:

    def test_disable_not_found(self, client, auth_headers, monkeypatch):
        """disable_scheduled EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.disable.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.post(f"{BASE}/1/disable", headers=auth_headers)
        assert r.status_code == 404

    def test_disable_server_error(self, client, auth_headers, monkeypatch):
        """disable_scheduled 非预期异常 → 500"""
        svc = MagicMock()
        svc.disable.side_effect = RuntimeError("redis gone")
        _patch_service(monkeypatch, svc)

        r = client.post(f"{BASE}/1/disable", headers=auth_headers)
        assert r.status_code == 500


# ── trigger_scheduled: EntityNotFound + Exception ─────────────────────────

@pytest.mark.redesign
class TestTriggerScheduledErrors:

    def test_trigger_server_error(self, client, auth_headers, monkeypatch):
        """trigger_scheduled 非预期异常 → 500"""
        svc = MagicMock()
        svc.trigger.side_effect = RuntimeError("executor crash")
        _patch_service(monkeypatch, svc)

        r = client.post(f"{BASE}/1/trigger", headers=auth_headers)
        assert r.status_code == 500

    def test_trigger_not_found(self, client, auth_headers, monkeypatch):
        """trigger_scheduled EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.trigger.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.post(f"{BASE}/1/trigger", headers=auth_headers)
        assert r.status_code == 404


# ── list_runs: EntityNotFound + Exception ─────────────────────────────────

@pytest.mark.redesign
class TestListRunsErrors:

    def test_list_runs_not_found(self, client, auth_headers, monkeypatch):
        """list_runs EntityNotFoundError → 404"""
        from app.shared.exceptions import EntityNotFoundError
        svc = MagicMock()
        svc.list_runs.side_effect = EntityNotFoundError("不存在")
        _patch_service(monkeypatch, svc)

        r = client.get(f"{BASE}/1/runs", headers=auth_headers)
        assert r.status_code == 404

    def test_list_runs_server_error(self, client, auth_headers, monkeypatch):
        """list_runs 非预期异常 → 500"""
        svc = MagicMock()
        svc.list_runs.side_effect = RuntimeError("timeout")
        _patch_service(monkeypatch, svc)

        r = client.get(f"{BASE}/1/runs", headers=auth_headers)
        assert r.status_code == 500
