# tests/integration/files/test_upload.py
"""
W5.B · Files / Upload API 集成测试

走真实 Flask app（``client`` fixture），无 mock 依赖：
仅测试参数校验与 401，文件解析路径走真实代码（CSV）。

覆盖路径：
  POST /api/v1/files/upload

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

import io

import pytest

URL = "/api/v1/files/upload"


@pytest.mark.redesign
class TestFileUploadValidation:
    def test_missing_file_returns_400(self, client):
        resp = client.post(URL, data={}, content_type="multipart/form-data")
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0
        assert "上传" in body["message"] or "file" in body["message"].lower()

    def test_unsupported_extension_returns_400(self, client):
        data = {"file": (io.BytesIO(b"hello world"), "note.txt")}
        resp = client.post(URL, data=data, content_type="multipart/form-data")
        assert resp.status_code == 400
        body = resp.get_json()
        assert body["code"] != 0
        assert "CSV" in body["message"] or "Excel" in body["message"]

    def test_empty_filename_returns_400(self, client):
        data = {"file": (io.BytesIO(b""), "")}
        resp = client.post(URL, data=data, content_type="multipart/form-data")
        assert resp.status_code == 400


@pytest.mark.redesign
class TestFileUploadHappyCSV:
    def test_csv_upload_returns_metadata(self, client, tmp_path, app):
        """上传一份合法 CSV，返回 file_id / 列信息。"""
        app.config["UPLOAD_FOLDER"] = str(tmp_path)
        csv_bytes = b"a,b,c\n1,2,3\n4,5,6\n"
        data = {"file": (io.BytesIO(csv_bytes), "demo.csv")}
        resp = client.post(URL, data=data, content_type="multipart/form-data")

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        payload = body["data"]
        assert payload["file_name"] == "demo.csv"
        assert payload["file_size"] == len(csv_bytes)
        assert "file_id" in payload
        assert "uploaded_at" in payload


@pytest.mark.redesign
class TestFileUploadAuth:
    def test_upload_requires_auth(self, client_no_auth):
        data = {"file": (io.BytesIO(b"a,b\n1,2\n"), "demo.csv")}
        resp = client_no_auth.post(URL, data=data, content_type="multipart/form-data")
        assert resp.status_code == 401
