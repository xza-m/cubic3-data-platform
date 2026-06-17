# app/application/semantic/diagnose_run_service.py
"""DiagnoseRun 应用服务（B-back-9）"""
import hashlib
import json
import logging
import time
from typing import Any, Optional

from app.shared.exceptions import EntityNotFoundError

logger = logging.getLogger(__name__)

_ALLOWED_INPUT_KINDS = {"nl", "sql", "yaml"}


class DiagnoseRunService:
    """
    语义诊断历史的应用服务。

    职责：
    - 执行同步诊断（parse + validate）
    - 诊断结果落库 semantic_diagnose_runs（成功与失败均写入）
    - 分页列表 / 详情读取
    """

    def __init__(self, repo=None, semantic_service=None):
        if repo is None:
            from app.infrastructure.semantic.diagnose_run_repo import DiagnoseRunRepo
            repo = DiagnoseRunRepo()
        self._repo = repo
        self._semantic_service = semantic_service

    # ── 诊断 + 落库 ───────────────────────────────────────────────────────────

    def diagnose_and_record(
        self,
        user_id: Any,
        input_kind: str,
        input_text: str,
    ) -> dict:
        """执行诊断并将结果写入 semantic_diagnose_runs。"""
        if input_kind not in _ALLOWED_INPUT_KINDS:
            raise ValueError(f"input_kind 必须是 {_ALLOWED_INPUT_KINDS} 之一")

        parse_ok: Optional[bool] = None
        validate_ok: Optional[bool] = None
        sql_text: Optional[str] = None
        error: Optional[str] = None

        t0 = time.monotonic()
        try:
            parse_ok, validate_ok, sql_text = self._do_diagnose(input_kind, input_text)
        except Exception as exc:
            error = str(exc)
            logger.info("diagnose error for user=%s kind=%s: %s", user_id, input_kind, exc)
        duration_ms = int((time.monotonic() - t0) * 1000)

        run = self._repo.create(
            {
                "user_id": user_id,
                "input_kind": input_kind,
                "input_text": input_text,
                "parse_ok": parse_ok,
                "validate_ok": validate_ok,
                "sql_text": sql_text,
                "error": error,
                "duration_ms": duration_ms,
                "definition_hash": self._current_definition_hash(),
            }
        )
        return run.to_dict()

    # ── 列表 / 详情 ───────────────────────────────────────────────────────────

    def list(self, user_id: Any = None, page: int = 1, page_size: int = 20) -> dict:
        return self._repo.list(user_id=user_id, page=page, page_size=page_size)

    def get(self, run_id: int) -> dict:
        run = self._repo.get(run_id)
        if run is None:
            raise EntityNotFoundError(f"DiagnoseRun {run_id} 不存在")
        return run.to_dict()

    # ── 内部：定义版本标识 ────────────────────────────────────────────────────

    def _current_definition_hash(self) -> Optional[str]:
        """对当前语义定义集（全部 Cube）计算版本标识，回放时用于漂移检测。"""
        svc = self._semantic_service
        cube_repo = getattr(svc, "_cube_repo", None) if svc is not None else None
        if cube_repo is None:
            return None
        try:
            payload = {
                cube.name: cube.model_dump(mode="json")
                for cube in cube_repo.list_all()
            }
            return hashlib.sha256(
                json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
            ).hexdigest()
        except Exception:
            logger.warning("diagnose definition hash failed", exc_info=True)
            return None

    # ── 内部：实际诊断逻辑 ────────────────────────────────────────────────────

    def _do_diagnose(self, input_kind: str, input_text: str):
        """
        执行解析 + 校验，返回 (parse_ok, validate_ok, sql_text)。

        sql 类型：直接校验语法；nl / yaml：利用 semantic_service 或轻量 parser。
        """
        if input_kind == "sql":
            return self._diagnose_sql(input_text)
        elif input_kind == "yaml":
            return self._diagnose_yaml(input_text)
        else:
            return self._diagnose_nl(input_text)

    def _diagnose_sql(self, sql: str):
        import sqlparse
        parsed = sqlparse.parse(sql.strip())
        parse_ok = bool(parsed and parsed[0].tokens)
        validate_ok = parse_ok
        sql_text = sql.strip() if parse_ok else None
        return parse_ok, validate_ok, sql_text

    def _diagnose_yaml(self, content: str):
        import yaml as _yaml
        try:
            data = _yaml.safe_load(content)
            parse_ok = True
        except Exception as exc:
            return False, False, None

        validate_ok = isinstance(data, dict)
        return parse_ok, validate_ok, None

    def _diagnose_nl(self, nl: str):
        """自然语言诊断：目前仅做非空校验；后续可接入 LLM 翻译。"""
        parse_ok = bool(nl and nl.strip())
        validate_ok = parse_ok
        return parse_ok, validate_ok, None
