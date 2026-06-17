# tests/unit/application/semantic/test_diagnose_run_service.py
"""DiagnoseRunService 应用服务单元测试 — 补充 _do_diagnose 异常分支。"""
from unittest.mock import MagicMock

import pytest

from app.application.semantic.diagnose_run_service import DiagnoseRunService
from app.shared.exceptions import EntityNotFoundError


def _make_repo():
    repo = MagicMock()
    run = MagicMock()
    run.to_dict.return_value = {
        "id": 1, "user_id": 1, "input_kind": "sql",
        "input_text": "x", "parse_ok": None, "validate_ok": None,
        "sql_text": None, "error": "forced error", "duration_ms": 0,
        "created_at": "2026-04-20T00:00:00",
    }
    repo.create.return_value = run
    return repo


class TestDiagnoseAndRecordErrorBranch:
    """diagnose_and_record 中 _do_diagnose 抛异常时走 except 分支。"""

    def test_exception_captured_into_error_field(self):
        """_do_diagnose 抛异常时 error 字段记录异常信息。"""
        repo = _make_repo()
        svc = DiagnoseRunService(repo=repo, semantic_service=None)
        svc._do_diagnose = MagicMock(side_effect=RuntimeError("parse 炸了"))
        result = svc.diagnose_and_record(user_id=1, input_kind="sql", input_text="BAD")
        create_call = repo.create.call_args[0][0]
        assert create_call["error"] == "parse 炸了"
        assert create_call["parse_ok"] is None

    def test_exception_still_records_to_db(self):
        """即使 _do_diagnose 异常，仍然落库。"""
        repo = _make_repo()
        svc = DiagnoseRunService(repo=repo, semantic_service=None)
        svc._do_diagnose = MagicMock(side_effect=ValueError("bad yaml"))
        svc.diagnose_and_record(user_id=2, input_kind="yaml", input_text="[")
        repo.create.assert_called_once()


class TestDiagnoseInvalidKind:
    """非法 input_kind 抛 ValueError。"""

    def test_invalid_kind_raises(self):
        """input_kind='excel' 应抛 ValueError。"""
        svc = DiagnoseRunService(repo=MagicMock())
        with pytest.raises(ValueError, match="input_kind"):
            svc.diagnose_and_record(user_id=1, input_kind="excel", input_text="x")


class TestDefinitionHashRecorded:
    """Phase 3：诊断落库时记录当前语义定义集版本标识。"""

    def test_records_definition_hash_with_semantic_service(self):
        class _Cube:
            def __init__(self, name):
                self.name = name

            def model_dump(self, mode="json"):
                return {"name": self.name}

        semantic_service = MagicMock()
        semantic_service._cube_repo.list_all.return_value = [_Cube("orders")]
        repo = _make_repo()
        svc = DiagnoseRunService(repo=repo, semantic_service=semantic_service)
        svc.diagnose_and_record(user_id=1, input_kind="sql", input_text="SELECT 1")
        create_call = repo.create.call_args[0][0]
        assert isinstance(create_call["definition_hash"], str)
        assert len(create_call["definition_hash"]) == 64

    def test_definition_hash_none_without_semantic_service(self):
        repo = _make_repo()
        svc = DiagnoseRunService(repo=repo, semantic_service=None)
        svc.diagnose_and_record(user_id=1, input_kind="sql", input_text="SELECT 1")
        create_call = repo.create.call_args[0][0]
        assert create_call["definition_hash"] is None

    def test_definition_hash_swallow_repo_failure(self):
        semantic_service = MagicMock()
        semantic_service._cube_repo.list_all.side_effect = RuntimeError("repo down")
        repo = _make_repo()
        svc = DiagnoseRunService(repo=repo, semantic_service=semantic_service)
        svc.diagnose_and_record(user_id=1, input_kind="sql", input_text="SELECT 1")
        assert repo.create.call_args[0][0]["definition_hash"] is None


class TestGetNotFound:
    """get() 返回 None 时抛 EntityNotFoundError。"""

    def test_raises_entity_not_found(self):
        """run_id 不存在时抛 EntityNotFoundError。"""
        repo = MagicMock()
        repo.get.return_value = None
        svc = DiagnoseRunService(repo=repo)
        with pytest.raises(EntityNotFoundError):
            svc.get(run_id=999)
