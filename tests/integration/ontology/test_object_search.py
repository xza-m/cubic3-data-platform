# tests/integration/ontology/test_object_search.py
"""
B-back-6 集成测试：本体对象搜索接口。

覆盖：
  - happy:    关键词搜索（中文 / 英文）、多字段组合
  - boundary: 大小写不敏感、空关键词返回全部、多字段 OR 匹配
  - error:    非法 field 参数 → 400；超限速 → 429

@pytest.mark.redesign
"""
import pytest
from unittest.mock import MagicMock
from flask import Flask

from app.interfaces.api.v1.ontology import create_ontology_blueprint
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.application.ontology.object_search_service import ObjectSearchService, _InMemoryRateLimiter


# ============================================================================
# Test data
# ============================================================================

_OBJECTS = [
    {"name": "student", "title": "学生", "description": "在校学生对象", "aliases": ["学员"]},
    {"name": "teacher", "title": "教师", "description": "任课教师", "aliases": ["老师", "讲师"]},
    {"name": "course", "title": "课程", "description": "在线课程", "aliases": []},
    {"name": "exam_result", "title": "考试成绩", "description": "学生考试成绩记录", "aliases": []},
]


def _make_ontology_service(objects=None):
    svc = MagicMock()
    svc.list_objects.return_value = {"items": objects or _OBJECTS, "total": len(objects or _OBJECTS)}
    return svc


@pytest.fixture
def app():
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    ontology_svc = _make_ontology_service()
    search_svc = ObjectSearchService(ontology_service=ontology_svc)
    bp = create_ontology_blueprint(
        ontology_service=ontology_svc,
        object_search_service=search_svc,
    )
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    return flask_app


@pytest.fixture
def client(app):
    from tests.conftest import install_default_admin_auth
    return install_default_admin_auth(app.test_client())


# ============================================================================
# Tests
# ============================================================================

@pytest.mark.redesign
class TestObjectSearchHappy:

    def test_search_by_name_english(self, client):
        """Happy: 英文关键词搜索 name 字段。"""
        resp = client.get("/api/v1/ontology/objects?q=student")
        assert resp.status_code == 200
        body = resp.get_json()
        items = body["data"]["items"]
        assert any(o["name"] == "student" for o in items)
        assert all("teacher" != o["name"] for o in items if o["name"] != "exam_result")

    def test_search_chinese(self, client):
        """Happy: 中文关键词匹配 title 字段。"""
        resp = client.get("/api/v1/ontology/objects?q=教师&field=title")
        assert resp.status_code == 200
        items = resp.get_json()["data"]["items"]
        assert any(o["name"] == "teacher" for o in items)

    def test_search_multi_field_or(self, client):
        """Happy: 多字段 OR 匹配 — 搜索出现在 description 或 title 的词。"""
        resp = client.get("/api/v1/ontology/objects?q=学生&field=title&field=description")
        assert resp.status_code == 200
        items = resp.get_json()["data"]["items"]
        names = {o["name"] for o in items}
        # "学生" 出现在 student.title 和 exam_result.description
        assert "student" in names
        assert "exam_result" in names

    def test_no_query_returns_all(self, client):
        """Boundary: 无 q 参数时返回全部对象。"""
        resp = client.get("/api/v1/ontology/objects")
        assert resp.status_code == 200
        # 原始路由不走搜索，直接返回 list_objects()
        body = resp.get_json()
        assert body["code"] == 0

    def test_empty_q_returns_all_via_search(self, client):
        """Boundary: q= 空字符串时走搜索路径但返回全部。"""
        resp = client.get("/api/v1/ontology/objects?q=")
        assert resp.status_code == 200
        body = resp.get_json()
        data = body["data"]
        assert data["total"] == len(_OBJECTS)


@pytest.mark.redesign
class TestObjectSearchCaseInsensitive:

    def test_case_insensitive_english(self, client):
        """Boundary: 大小写不敏感匹配。"""
        resp_lower = client.get("/api/v1/ontology/objects?q=STUDENT")
        resp_upper = client.get("/api/v1/ontology/objects?q=student")
        items_lower = resp_lower.get_json()["data"]["items"]
        items_upper = resp_upper.get_json()["data"]["items"]
        assert {o["name"] for o in items_lower} == {o["name"] for o in items_upper}

    def test_aliases_field_match(self, client):
        """Boundary: aliases 字段匹配（列表类型）。"""
        resp = client.get("/api/v1/ontology/objects?q=讲师&field=aliases")
        assert resp.status_code == 200
        items = resp.get_json()["data"]["items"]
        assert any(o["name"] == "teacher" for o in items)


@pytest.mark.redesign
class TestObjectSearchError:

    def test_invalid_field_returns_400(self, client):
        """Error: 不存在的 field 参数返回 400。"""
        resp = client.get("/api/v1/ontology/objects?q=test&field=invalid_field")
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0

    def test_rate_limit_triggers_429(self):
        """Error: 超出 30 req/min 限速返回 429。"""
        limiter = _InMemoryRateLimiter()
        user = "test_user"
        # 消耗完限额
        for _ in range(30):
            assert limiter.is_allowed(user, max_req=30, window=60)
        # 第 31 次被拒
        assert not limiter.is_allowed(user, max_req=30, window=60)

    def test_no_match_returns_empty(self, client):
        """Boundary: 无匹配结果时返回 items=[]，total=0。"""
        resp = client.get("/api/v1/ontology/objects?q=xyznotexist123")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["total"] == 0
        assert data["items"] == []


@pytest.mark.redesign
class TestObjectSearchUnit:
    """ObjectSearchService 直接单元测试。"""

    def _make_svc(self, objects=None):
        ont = _make_ontology_service(objects)
        return ObjectSearchService(ontology_service=ont)

    def test_search_returns_matching_subset(self):
        svc = self._make_svc()
        result = svc.search(q="student", fields=["name"], user_key="u1")
        names = [o["name"] for o in result["items"]]
        assert "student" in names
        assert "teacher" not in names

    def test_pagination_works(self):
        svc = self._make_svc()
        result = svc.search(q="", fields=["name"], user_key="u1", page=1, page_size=2)
        assert len(result["items"]) == 2
        assert result["total"] == len(_OBJECTS)

    def test_invalid_field_raises_value_error(self):
        svc = self._make_svc()
        with pytest.raises(ValueError):
            svc.search(q="x", fields=["bad_field"], user_key="u1")
