# tests/integration/semantic/test_diagnose_runs.py
"""
集成测试：SemanticDiagnoseRun（B-back-9）

覆盖：
  happy path   — 诊断成功落库（parse_ok=True）、列表、详情
  boundary     — 极长 SQL、yaml 诊断、空字符串边界
  error        — 非法 input_kind、不存在 run_id → 404

pytest 标记：@pytest.mark.redesign
"""
import pytest

BASE_DIAGNOSE = "/api/v1/semantic/diagnose"
BASE_RUNS = "/api/v1/semantic/diagnose/runs"


@pytest.mark.redesign
class TestDiagnoseRecording:
    """POST /api/v1/semantic/diagnose — 同步诊断落库"""

    def test_diagnose_sql_success_recorded(self, client, auth_headers):
        """happy: 合法 SQL 诊断成功，parse_ok=true, validate_ok=true，写入历史"""
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "sql", "input_text": "SELECT id FROM users"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert data["id"] is not None
        assert data["parse_ok"] is True
        assert data["validate_ok"] is True
        assert data["input_kind"] == "sql"

    def test_diagnose_yaml_success_recorded(self, client, auth_headers):
        """happy: 合法 YAML 诊断，parse_ok=true"""
        yaml_text = "name: cube1\ndimensions:\n  - id"
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "yaml", "input_text": yaml_text},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert data["parse_ok"] is True

    def test_diagnose_nl_success_recorded(self, client, auth_headers):
        """happy: 自然语言诊断非空则 parse_ok=true"""
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "nl", "input_text": "查询最近 7 天的活跃用户数"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()["data"]["parse_ok"] is True

    def test_diagnose_failure_recorded_with_error(self, client, auth_headers):
        """error: 非法 YAML 语法也落库，parse_ok=false 或 error 字段不为空"""
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "yaml", "input_text": ": invalid: yaml: ["},
            headers=auth_headers,
        )
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            data = r.get_json()["data"]
            assert data["parse_ok"] is False or data["error"] is not None

    def test_diagnose_invalid_kind_returns_error(self, client, auth_headers):
        """error: 非法 input_kind → 400"""
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "excel", "input_text": "some text"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_diagnose_empty_input_returns_error(self, client, auth_headers):
        """boundary: 空 input_text → 400"""
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "sql", "input_text": ""},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_diagnose_large_sql_recorded(self, client, auth_headers):
        """boundary: 极长 SQL（10KB）也能落库"""
        big_sql = "SELECT " + ", ".join([f"col_{i}" for i in range(500)]) + " FROM t"
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "sql", "input_text": big_sql},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()["data"]["id"] is not None


@pytest.mark.redesign
class TestDiagnoseRunsList:
    """GET /api/v1/semantic/diagnose/runs — 分页列表"""

    def _make_run(self, client, auth_headers, sql: str = "SELECT 1"):
        return client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "sql", "input_text": sql},
            headers=auth_headers,
        )

    def test_list_happy(self, client, auth_headers):
        """happy: 列表返回 {items, total, page, page_size}"""
        self._make_run(client, auth_headers)
        r = client.get(BASE_RUNS, headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert "items" in data and "total" in data
        assert data["total"] >= 1

    def test_list_pagination_boundary(self, client, auth_headers):
        """boundary: page_size=1 每页只返回 1 条"""
        self._make_run(client, auth_headers, "SELECT 1")
        self._make_run(client, auth_headers, "SELECT 2")
        r = client.get(f"{BASE_RUNS}?page=1&page_size=1", headers=auth_headers)
        data = r.get_json()["data"]
        assert len(data["items"]) == 1
        assert data["page_size"] == 1

    def test_list_ordered_by_created_at_desc(self, client, auth_headers):
        """happy: 按 created_at 倒序（最新在前，id 较大的在前）"""
        self._make_run(client, auth_headers, "SELECT 'a'")
        self._make_run(client, auth_headers, "SELECT 'b'")
        r = client.get(BASE_RUNS, headers=auth_headers)
        items = r.get_json()["data"]["items"]
        if len(items) >= 2:
            assert items[0]["id"] >= items[1]["id"]

    def test_list_empty_when_no_runs(self, client, auth_headers):
        """boundary: 空库时列表返回 total=0 + items=[]"""
        r = client.get(BASE_RUNS, headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()["data"]
        assert data["total"] == 0
        assert data["items"] == []


@pytest.mark.redesign
class TestDiagnoseRunDetail:
    """GET /api/v1/semantic/diagnose/runs/:id — 详情幂等读取"""

    def _make_run(self, client, auth_headers) -> int:
        r = client.post(
            BASE_DIAGNOSE,
            json={"input_kind": "sql", "input_text": "SELECT NOW()"},
            headers=auth_headers,
        )
        return r.get_json()["data"]["id"]

    def test_get_happy_idempotent(self, client, auth_headers):
        """happy: 连续两次 GET 相同 id，返回相同 data（幂等；trace_id 可以不同）"""
        run_id = self._make_run(client, auth_headers)
        r1 = client.get(f"{BASE_RUNS}/{run_id}", headers=auth_headers)
        r2 = client.get(f"{BASE_RUNS}/{run_id}", headers=auth_headers)
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.get_json()["data"] == r2.get_json()["data"]

    def test_get_contains_expected_fields(self, client, auth_headers):
        """happy: 详情包含所有必要字段"""
        run_id = self._make_run(client, auth_headers)
        r = client.get(f"{BASE_RUNS}/{run_id}", headers=auth_headers)
        data = r.get_json()["data"]
        for field in ("id", "user_id", "input_kind", "input_text", "parse_ok", "created_at"):
            assert field in data, f"缺少字段: {field}"

    def test_get_not_found(self, client, auth_headers):
        """error: 不存在的 run_id → 404"""
        r = client.get(f"{BASE_RUNS}/999999", headers=auth_headers)
        assert r.status_code == 404

    def test_get_boundary_id_zero(self, client, auth_headers):
        """boundary: id=0 → 404（不存在）"""
        r = client.get(f"{BASE_RUNS}/0", headers=auth_headers)
        assert r.status_code == 404
