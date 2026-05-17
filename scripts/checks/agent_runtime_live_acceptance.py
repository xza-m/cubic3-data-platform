#!/usr/bin/env python
"""Agent-first Runtime 真实执行验收。

该脚本用于 opt-in 验收，不并入默认 verify：

1. 读取当前仓库已发布 Cube / Ontology YAML 资产。
2. 使用临时控制面数据库注册真实 MaxCompute 数据源。
3. 通过真实 Flask API 调用 `/api/v1/agent/semantic/execute`。
4. 驱动真实 `QueryExecutionWorkerService` 执行 SQL 并持久化结果。
5. 校验 SQL 和结果不暴露 restricted 字段。

脚本不会打印 access_id / access_key 等敏感信息。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RESTRICTED_FIELDS = {"student_name", "student_mobile", "comment_content"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--question", default="查询最近7天学生评论数，按学校汇总")
    parser.add_argument("--principal-id", default="data_agent_test")
    parser.add_argument("--principal-name", default="Data Agent Test")
    parser.add_argument("--role", action="append", dest="roles", default=["ops_readonly"])
    parser.add_argument("--source-id", type=int, default=1)
    parser.add_argument("--source-name", default="live_maxcompute_acceptance")
    parser.add_argument("--expected-table", default="df_cb_258187.dwd_interaction_comment_reports_df")
    parser.add_argument("--expected-metric", default="comment_count")
    parser.add_argument("--expected-dimension", default="school_name")
    parser.add_argument("--require-non-empty", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--keep-workdir", action="store_true")
    return parser.parse_args()


def _read_odps_config_value(key: str) -> str | None:
    """只读取非密钥配置项；密钥必须来自显式环境变量。"""

    odps_home = os.getenv("ODPSCMD_HOME")
    if not odps_home:
        return None
    path = Path(odps_home) / "conf" / "odps_config.ini"
    if not path.exists():
        return None
    wanted = key.lower()
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip().lower() == wanted:
            return value.strip() or None
    return None


def _maxcompute_config() -> tuple[dict[str, str], list[str]]:
    access_id = os.getenv("MAXCOMPUTE_ACCESS_ID")
    access_key = os.getenv("MAXCOMPUTE_ACCESS_KEY")
    project = os.getenv("MAXCOMPUTE_PROJECT") or _read_odps_config_value("project_name")
    endpoint = (
        os.getenv("MAXCOMPUTE_ENDPOINT")
        or os.getenv("MAXCOMPUTE_END_POINT")
        or _read_odps_config_value("end_point")
    )
    missing = [
        name
        for name, value in [
            ("MAXCOMPUTE_ACCESS_ID", access_id),
            ("MAXCOMPUTE_ACCESS_KEY", access_key),
            ("MAXCOMPUTE_PROJECT", project),
            ("MAXCOMPUTE_ENDPOINT", endpoint),
        ]
        if not value
    ]
    if missing:
        return {}, missing
    return {
        "access_id": access_id or "",
        "access_key": access_key or "",
        "project": project or "",
        "endpoint": endpoint or "",
    }, []


def _install_datasource(app, *, args: argparse.Namespace, connection_config: dict[str, str]) -> None:
    from app.domain.entities.data_source import DataSource
    from app.extensions import db
    from app.shared.enums import ConnectionStatus

    datasource = DataSource(
        id=args.source_id,
        name=args.source_name,
        source_type="maxcompute",
        description="Agent Runtime live acceptance datasource",
        connection_config=connection_config,
        extra_config={},
        is_active=True,
        connection_status=ConnectionStatus.CONNECTED.value,
        created_by=args.principal_id,
    )
    db.session.merge(datasource)
    db.session.commit()


def _token_for(*, user_id: str, user_name: str, roles: list[str]) -> str:
    from app.interfaces.api.middleware.auth import generate_token

    return generate_token(user_id=user_id, user_name=user_name, roles=roles)


def _payload(response) -> dict[str, Any]:
    try:
        return response.get_json() or {}
    except Exception:
        return {"raw": response.get_data(as_text=True)}


def _ensure_success(response, *, action: str) -> dict[str, Any]:
    payload = _payload(response)
    if response.status_code >= 400 or payload.get("success") is False:
        raise RuntimeError(
            json.dumps(
                {
                    "action": action,
                    "status_code": response.status_code,
                    "payload": payload,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return payload.get("data") or payload


def _assert_live_acceptance(
    *,
    args: argparse.Namespace,
    job_payload: dict[str, Any],
    result_payload: dict[str, Any],
) -> None:
    sql = str(job_payload.get("validated_sql") or job_payload.get("logical_sql") or "")
    sql_lower = sql.lower()
    result_columns = [str(item) for item in ((result_payload.get("preview") or {}).get("columns") or [])]
    result_columns_lower = {item.lower() for item in result_columns}

    required_sql_fragments = [
        args.expected_table.lower(),
        "group by",
        args.expected_metric.lower(),
        "ds >=",
        "ds <=",
    ]
    for fragment in required_sql_fragments:
        if fragment not in sql_lower:
            raise AssertionError(f"SQL 缺少期望片段: {fragment}")
    if args.expected_dimension.lower() not in sql_lower and not any(
        args.expected_dimension.lower() in column for column in result_columns_lower
    ):
        raise AssertionError(
            json.dumps(
                {
                    "reason": f"SQL/结果缺少学校维度: {args.expected_dimension}",
                    "sql": sql,
                    "result_columns": result_columns,
                    "preview_rows": ((result_payload.get("preview") or {}).get("rows") or [])[:5],
                },
                ensure_ascii=False,
                indent=2,
            )
        )

    leaked_sql = sorted(field for field in RESTRICTED_FIELDS if field in sql_lower)
    leaked_columns = sorted(field for field in RESTRICTED_FIELDS if field in result_columns_lower)
    if leaked_sql or leaked_columns:
        raise AssertionError(
            f"restricted 字段泄露，SQL={leaked_sql or []}, columns={leaked_columns or []}"
        )

    rows = (result_payload.get("preview") or {}).get("rows") or []
    if args.require_non_empty and not rows:
        raise AssertionError("真实执行结果为空，不满足本次验收的学校维度评论数返回要求")


def run_acceptance(args: argparse.Namespace, *, workdir: Path, connection_config: dict[str, str]) -> dict[str, Any]:
    database_path = workdir / "agent_runtime_live.sqlite"
    spool_dir = workdir / "query_execution_results"

    os.environ["FLASK_TESTING"] = "1"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"
    os.environ["QUERY_EXECUTION_SPOOL_DIR"] = str(spool_dir)
    os.environ.setdefault("JWT_SECRET", "agent-runtime-live-acceptance")

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    from app import create_app
    from app.extensions import db

    app = create_app(role="web")
    with app.app_context():
        db.create_all()
        _install_datasource(app, args=args, connection_config=connection_config)
        token = _token_for(user_id=args.principal_id, user_name=args.principal_name, roles=args.roles)

        client = app.test_client()
        client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"

        execute_payload = _ensure_success(
            client.post(
                "/api/v1/agent/semantic/execute",
                json={
                    "question": args.question,
                    "principal_context": {
                        "principal_id": args.principal_id,
                        "display_name": args.principal_name,
                        "roles": args.roles,
                    },
                    "viewer_roles": args.roles,
                    "idempotency_key": f"live-agent-runtime-{os.getpid()}",
                },
            ),
            action="agent_semantic_execute",
        )
        query_id = execute_payload.get("query_id")
        if not query_id:
            raise RuntimeError(f"Agent execute 未返回 query_id: {execute_payload}")

        worker_job = app.container.query_execution_worker_service().process_next(
            worker_id=f"live-agent-runtime-{os.getpid()}",
        )
        if worker_job is None:
            raise RuntimeError("QueryExecutionWorkerService 未 claim 到刚提交的 job")

        job_payload = _ensure_success(
            client.get(f"/api/v1/query-execution/jobs/{query_id}"),
            action="query_execution_status",
        )
        events_payload = _ensure_success(
            client.get(f"/api/v1/query-execution/jobs/{query_id}/events"),
            action="query_execution_events",
        )
        if job_payload.get("status") != "SUCCEEDED":
            raise RuntimeError(
                json.dumps(
                    {
                        "action": "worker_process_next",
                        "query_id": query_id,
                        "status": job_payload.get("status"),
                        "error_code": job_payload.get("error_code"),
                        "error_message": job_payload.get("error_message"),
                        "events": events_payload,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )

        result_payload = _ensure_success(
            client.get(f"/api/v1/query-execution/jobs/{query_id}/results"),
            action="query_execution_result",
        )
        if result_payload.get("status") != "READY":
            raise RuntimeError(f"结果对象不是 READY: {result_payload}")

        _assert_live_acceptance(args=args, job_payload=job_payload, result_payload=result_payload)

        return {
            "status": "passed",
            "question": args.question,
            "principal_id": args.principal_id,
            "roles": args.roles,
            "query_id": query_id,
            "engine_query_id": job_payload.get("engine_query_id"),
            "semantic_plan_id": job_payload.get("semantic_plan_id"),
            "sql": job_payload.get("validated_sql"),
            "result": {
                "row_count": result_payload.get("row_count"),
                "columns": (result_payload.get("preview") or {}).get("columns") or [],
                "preview_rows": ((result_payload.get("preview") or {}).get("rows") or [])[:5],
            },
            "events": [item.get("event_type") for item in events_payload.get("items", [])],
            "workdir": str(workdir) if args.keep_workdir else None,
        }


def main() -> int:
    args = parse_args()
    connection_config, missing = _maxcompute_config()
    if missing:
        print(
            json.dumps(
                {
                    "status": "blocked",
                    "reason": "缺少真实 MaxCompute 连接环境变量",
                    "missing": missing,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2

    temp_dir = tempfile.TemporaryDirectory(prefix="agent-runtime-live-", delete=not args.keep_workdir)
    workdir = Path(temp_dir.name)
    try:
        result = run_acceptance(args, workdir=workdir, connection_config=connection_config)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error": str(exc),
                    "workdir": str(workdir) if args.keep_workdir else None,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1
    finally:
        temp_dir.cleanup()


if __name__ == "__main__":
    sys.exit(main())
