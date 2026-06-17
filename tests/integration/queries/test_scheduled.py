# tests/integration/queries/test_scheduled.py
"""
集成测试：ScheduledQuery（B-back-8）

覆盖：
  happy path   — 正常 CRUD、enable/disable、runs 列表
  boundary     — cron 边界值、空 SQL、极大 page_size
  error        — 非法 cron、资源不存在、重复 enable/disable（幂等）

pytest 标记：@pytest.mark.redesign
"""
import pytest
import jwt

BASE = "/api/v1/queries/scheduled"

VALID_CRON = "0 9 * * 1"          # 每周一 09:00
EVERY_MINUTE_CRON = "* * * * *"   # 每分钟（边界）


@pytest.mark.redesign
class TestScheduledQueryCreate:
    """POST /api/v1/queries/scheduled — 创建"""

    def test_create_happy_path(self, client, auth_headers):
        """happy: 合法 5 段 cron 创建成功，返回 201 + id"""
        r = client.post(
            BASE,
            json={
                "name": "daily_report",
                "sql": "SELECT 1",
                "datasource_id": 1,
                "cron": VALID_CRON,
                "timezone": "Asia/Shanghai",
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        data = r.get_json()["data"]
        assert data["id"] is not None
        assert data["cron"] == VALID_CRON
        assert data["enabled"] is True
        assert data["next_run_at"] is not None  # 计算了下次运行时间

    def test_create_boundary_every_minute_cron(self, client, auth_headers):
        """boundary: * * * * * 每分钟 cron 合法"""
        r = client.post(
            BASE,
            json={
                "name": "hi_freq",
                "sql": "SELECT 2",
                "datasource_id": 1,
                "cron": EVERY_MINUTE_CRON,
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.get_json()["data"]["cron"] == EVERY_MINUTE_CRON

    def test_create_error_invalid_cron(self, client, auth_headers):
        """error: 非法 cron（4 段或非法字符）→ 400"""
        r = client.post(
            BASE,
            json={
                "name": "bad_cron",
                "sql": "SELECT 1",
                "datasource_id": 1,
                "cron": "not-a-cron",
            },
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_error_missing_fields(self, client, auth_headers):
        """error: 缺少必填字段 → 400 or 500"""
        r = client.post(
            BASE,
            json={"name": "no_sql"},
            headers=auth_headers,
        )
        assert r.status_code in (400, 500)


@pytest.mark.redesign
class TestScheduledQueryCRUD:
    """GET / PATCH / DELETE"""

    def _create_one(self, client, auth_headers) -> int:
        r = client.post(
            BASE,
            json={"name": "test_q", "sql": "SELECT 1", "datasource_id": 1, "cron": VALID_CRON},
            headers=auth_headers,
        )
        assert r.status_code == 201
        return r.get_json()["data"]["id"]

    def test_list_happy(self, client, auth_headers):
        """happy: 列表返回 {items, total, page, page_size}"""
        self._create_one(client, auth_headers)
        r = client.get(BASE, headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert "items" in data and "total" in data
        assert data["page"] == 1
        assert data["page_size"] == 20

    def test_get_happy(self, client, auth_headers):
        """happy: 详情返回正确 id"""
        qid = self._create_one(client, auth_headers)
        r = client.get(f"{BASE}/{qid}", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["data"]["id"] == qid

    def test_patch_happy(self, client, auth_headers):
        """happy: PATCH 修改 name"""
        qid = self._create_one(client, auth_headers)
        r = client.patch(f"{BASE}/{qid}", json={"name": "renamed"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["data"]["name"] == "renamed"

    def test_delete_happy(self, client, auth_headers):
        """happy: DELETE 后 GET 返回 404"""
        qid = self._create_one(client, auth_headers)
        r = client.delete(f"{BASE}/{qid}", headers=auth_headers)
        assert r.status_code == 200
        r2 = client.get(f"{BASE}/{qid}", headers=auth_headers)
        assert r2.status_code == 404

    def test_get_not_found(self, client, auth_headers):
        """error: 不存在的 id → 404"""
        r = client.get(f"{BASE}/999999", headers=auth_headers)
        assert r.status_code == 404

    def test_list_boundary_large_page_size(self, client, auth_headers):
        """boundary: page_size=1000 也能正常返回"""
        r = client.get(f"{BASE}?page=1&page_size=1000", headers=auth_headers)
        assert r.status_code == 200

    def test_list_with_non_numeric_subject_returns_empty_page(self, client, app):
        """boundary: 飞书 open_id 这类非数字主体不应触发 bigint 过滤 500。"""
        token = jwt.encode(
            {
                "user_id": "ou_a233770c5639ea99ec09a3a5e148fee0",
                "principal_id": "ou_a233770c5639ea99ec09a3a5e148fee0",
                "roles": ["admin"],
                "token_use": "access",
                "sid": "test-session",
                "jti": "test-access-token",
            },
            app.config.get("JWT_SECRET", "your-secret-key"),
            algorithm="HS256",
        )
        r = client.get(BASE, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert data["items"] == []
        assert data["total"] == 0


@pytest.mark.redesign
class TestScheduledQueryEnableDisable:
    """enable / disable 幂等性"""

    def _create_one(self, client, auth_headers) -> int:
        r = client.post(
            BASE,
            json={"name": "idempotent_q", "sql": "SELECT 1", "datasource_id": 1, "cron": VALID_CRON},
            headers=auth_headers,
        )
        return r.get_json()["data"]["id"]

    def test_enable_already_enabled_is_idempotent(self, client, auth_headers):
        """boundary: 对已 enabled 的调用 enable → 仍 200 + enabled=true"""
        qid = self._create_one(client, auth_headers)
        r = client.post(f"{BASE}/{qid}/enable", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["data"]["enabled"] is True
        r2 = client.post(f"{BASE}/{qid}/enable", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.get_json()["data"]["enabled"] is True

    def test_disable_then_enable(self, client, auth_headers):
        """happy: disable → 状态为 false；enable → 恢复 true"""
        qid = self._create_one(client, auth_headers)
        client.post(f"{BASE}/{qid}/disable", headers=auth_headers)
        r = client.get(f"{BASE}/{qid}", headers=auth_headers)
        assert r.get_json()["data"]["enabled"] is False

        client.post(f"{BASE}/{qid}/enable", headers=auth_headers)
        r2 = client.get(f"{BASE}/{qid}", headers=auth_headers)
        assert r2.get_json()["data"]["enabled"] is True

    def test_disable_already_disabled_is_idempotent(self, client, auth_headers):
        """boundary: 对已 disabled 的调用 disable → 仍 200 + enabled=false"""
        qid = self._create_one(client, auth_headers)
        client.post(f"{BASE}/{qid}/disable", headers=auth_headers)
        r = client.post(f"{BASE}/{qid}/disable", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["data"]["enabled"] is False

    def test_enable_not_found(self, client, auth_headers):
        """error: 不存在的 id → 404"""
        r = client.post(f"{BASE}/999998/enable", headers=auth_headers)
        assert r.status_code == 404


@pytest.mark.redesign
class TestScheduledQueryTrigger:
    """手动 trigger 不影响 next_run_at"""

    def _create_one(self, client, auth_headers) -> dict:
        r = client.post(
            BASE,
            json={"name": "trigger_q", "sql": "SELECT 1", "datasource_id": 1, "cron": VALID_CRON},
            headers=auth_headers,
        )
        return r.get_json()["data"]

    def test_trigger_happy_returns_run(self, client, auth_headers):
        """happy: trigger 返回一条 run 记录"""
        sq = self._create_one(client, auth_headers)
        qid = sq["id"]
        r = client.post(f"{BASE}/{qid}/trigger", headers=auth_headers)
        assert r.status_code == 201

    def test_trigger_does_not_change_next_run_at(self, client, auth_headers):
        """happy: 手动 trigger 后 next_run_at 不变"""
        sq = self._create_one(client, auth_headers)
        qid = sq["id"]
        next_run_at_before = sq["next_run_at"]

        client.post(f"{BASE}/{qid}/trigger", headers=auth_headers)

        r = client.get(f"{BASE}/{qid}", headers=auth_headers)
        assert r.get_json()["data"]["next_run_at"] == next_run_at_before

    def test_trigger_not_found(self, client, auth_headers):
        """error: 不存在 id → 404"""
        r = client.post(f"{BASE}/999997/trigger", headers=auth_headers)
        assert r.status_code == 404


@pytest.mark.redesign
class TestScheduledQueryRuns:
    """runs 历史列表 + 失败 run 落库"""

    def _create_one(self, client, auth_headers) -> int:
        r = client.post(
            BASE,
            json={"name": "runs_q", "sql": "SELECT 1", "datasource_id": 1, "cron": VALID_CRON},
            headers=auth_headers,
        )
        return r.get_json()["data"]["id"]

    def test_runs_list_happy(self, client, auth_headers):
        """happy: 触发一次后 runs 列表有记录"""
        qid = self._create_one(client, auth_headers)
        client.post(f"{BASE}/{qid}/trigger", headers=auth_headers)
        r = client.get(f"{BASE}/{qid}/runs", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert "items" in data and "total" in data
        assert data["total"] >= 1

    def test_runs_failed_run_recorded(self, client, auth_headers, db_session):
        """error: 执行失败时 run.status=failed + run.error 不为空"""
        from app.infrastructure.queries.scheduled_query_repo import ScheduledQueryRepo

        qid = self._create_one(client, auth_headers)
        repo = ScheduledQueryRepo()
        run = repo.create_run(qid, status="running")
        repo.finish_run(run.id, status="failed", error="connection refused")

        r = client.get(f"{BASE}/{qid}/runs", headers=auth_headers)
        items = r.get_json()["data"]["items"]
        failed = [i for i in items if i["status"] == "failed"]
        assert len(failed) >= 1
        assert failed[0]["error"] == "connection refused"

    def test_runs_pagination_boundary(self, client, auth_headers):
        """boundary: page_size=1 分页正常"""
        qid = self._create_one(client, auth_headers)
        client.post(f"{BASE}/{qid}/trigger", headers=auth_headers)
        client.post(f"{BASE}/{qid}/trigger", headers=auth_headers)
        r = client.get(f"{BASE}/{qid}/runs?page=1&page_size=1", headers=auth_headers)
        data = r.get_json()["data"]
        assert len(data["items"]) == 1
        assert data["page_size"] == 1
