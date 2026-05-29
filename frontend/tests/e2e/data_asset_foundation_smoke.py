from __future__ import annotations

import json
import sys
import time
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import BASE_URL, attach_api_logger, create_context, dump_debug, resolve_auth_token


SMOKE_SOURCE_ID = "data-asset-smoke"
SMOKE_DATABASE = "df_cb_258187"
SMOKE_SCHEMA = "dw_smoke"
SMOKE_TABLE = "dwd_data_asset_smoke_df"
SMOKE_ASSET_KEY = f"{SMOKE_SOURCE_ID}.{SMOKE_DATABASE}.{SMOKE_SCHEMA}.{SMOKE_TABLE}"


class ApiContractError(AssertionError):
    """用于区分 API 未实现、鉴权失败和响应契约不一致。"""


def deterministic_sync_payload() -> dict[str, Any]:
    return {
        "source_id": SMOKE_SOURCE_ID,
        "source_type": "maxcompute",
        "mode": "payload",
        "requested_by": "data_asset_foundation_smoke",
        "metadata": {"fixture": "data_asset_foundation_smoke", "version": "2026-05-23"},
        "tables": [
            {
                "database": SMOKE_DATABASE,
                "schema": SMOKE_SCHEMA,
                "name": SMOKE_TABLE,
                "title": "数据资产底座 smoke 评论事实表",
                "layer": "dwd",
                "description": "用于验证数据资产底座真实后端契约的确定性元数据夹具",
                "profile": {
                    "row_count": 128,
                    "partition_count": 1,
                    "freshness_status": "fresh",
                },
                "fields": [
                    {
                        "name": "school_id",
                        "data_type": "BIGINT",
                        "nullable": False,
                        "description": "学校 ID",
                        "profile": {"null_rate": 0.0, "cardinality": 3},
                    },
                    {
                        "name": "comment_count",
                        "data_type": "BIGINT",
                        "nullable": False,
                        "description": "评论数",
                        "profile": {"null_rate": 0.0, "cardinality": 32},
                    },
                ],
                "lineage": [
                    {
                        "direction": "downstream",
                        "target_type": "cube",
                        "target_ref": "student_comment_cube",
                        "relation_type": "derived_metric_source",
                    }
                ],
                "usage": [
                    {
                        "source_type": "sql_history",
                        "source_ref": "smoke_query_data_asset_foundation",
                        "usage_count": 5,
                    }
                ],
            }
        ],
    }


def api_fetch(
    page,
    path: str,
    *,
    method: str = "GET",
    data: dict[str, Any] | None = None,
    expected_statuses: set[int] | None = None,
) -> dict[str, Any]:
    auth_token = resolve_auth_token()
    response = page.request.fetch(
        f"{BASE_URL}{path}",
        method=method,
        data=data,
        timeout=90_000,
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        },
    )

    body = response.text()
    try:
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise ApiContractError(f"{method} {path} 返回非 JSON 响应，HTTP {response.status}: {body[:500]}") from exc

    if response.status == 404:
        raise ApiContractError(f"{method} {path} 未实现或未注册路由，HTTP 404: {payload}")
    if response.status in {401, 403}:
        raise ApiContractError(f"{method} {path} 鉴权失败，HTTP {response.status}: {payload}")
    if expected_statuses is not None and response.status not in expected_statuses:
        raise ApiContractError(
            f"{method} {path} HTTP 状态必须是 {sorted(expected_statuses)}，实际 {response.status}: {payload}"
        )
    if not response.ok:
        raise ApiContractError(f"{method} {path} 请求失败，HTTP {response.status}: {payload}")
    if not isinstance(payload, dict):
        raise ApiContractError(f"{method} {path} 响应必须是 JSON 对象: {payload}")
    return payload


def data_object(payload: dict[str, Any], *, endpoint: str) -> dict[str, Any]:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ApiContractError(f"{endpoint} 响应缺少 data 对象: {payload}")
    return data


def list_from_data(data: dict[str, Any], keys: tuple[str, ...], *, endpoint: str) -> list[dict[str, Any]]:
    for key in keys:
        value = data.get(key)
        if isinstance(value, list):
            if not all(isinstance(item, dict) for item in value):
                raise ApiContractError(f"{endpoint} data.{key} 必须是对象数组: {value}")
            return value
    raise ApiContractError(f"{endpoint} 响应缺少列表字段 {keys}: {data}")


def assert_sync_run(payload: dict[str, Any]) -> str:
    data = data_object(payload, endpoint="POST /api/v1/semantic/assets/sync-runs")
    sync_run = data.get("sync_run") if isinstance(data.get("sync_run"), dict) else data
    run_id = sync_run.get("id") or sync_run.get("run_id")
    status = sync_run.get("status")
    if not run_id:
        raise ApiContractError(f"sync-runs 创建响应缺少 id/run_id: {payload}")
    if status not in {"success", "completed", "running", "queued", "pending"}:
        raise ApiContractError(f"sync-runs 创建响应 status 非法: {status}; payload={payload}")
    return str(run_id)


def assert_radar(payload: dict[str, Any]) -> None:
    data = data_object(payload, endpoint="GET /api/v1/semantic/assets/radar")
    numeric_fields = ("table_count", "field_count")
    missing = [field for field in numeric_fields if not isinstance(data.get(field), int)]
    if missing:
        raise ApiContractError(f"radar 缺少整数统计字段 {missing}: {payload}")
    if data["table_count"] < 1 or data["field_count"] < 2:
        raise ApiContractError(f"radar 统计未反映 smoke 元数据写入: {data}")


def find_smoke_table(payload: dict[str, Any]) -> dict[str, Any]:
    data = data_object(payload, endpoint="GET /api/v1/semantic/assets/tables")
    tables = list_from_data(data, ("tables", "items"), endpoint="GET /api/v1/semantic/assets/tables")
    for table in tables:
        identifiers = {
            str(table.get("asset_key") or ""),
            str(table.get("qualified_name") or ""),
            str(table.get("name") or ""),
        }
        if SMOKE_ASSET_KEY in identifiers or SMOKE_TABLE in identifiers:
            table_id = table.get("id") or table.get("asset_id")
            if not table_id:
                raise ApiContractError(f"smoke 表缺少 id/asset_id: {table}")
            return table
    raise ApiContractError(f"tables 响应中找不到 smoke 表 {SMOKE_ASSET_KEY}: {tables}")


def assert_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    data = data_object(payload, endpoint="GET /api/v1/semantic/assets/tables/<id>/evidence")
    evidence = data.get("evidence_bundle") if isinstance(data.get("evidence_bundle"), dict) else data
    refs = evidence.get("asset_refs")
    if not isinstance(refs, list) or not refs:
        raise ApiContractError(f"evidence 缺少 asset_refs: {payload}")
    if not any(SMOKE_TABLE in str(ref.get("qualified_name") or ref.get("name") or "") for ref in refs if isinstance(ref, dict)):
        raise ApiContractError(f"evidence.asset_refs 未包含 smoke 表: {refs}")
    if evidence.get("runtime_truth") is not False:
        raise ApiContractError(f"EvidenceBundle 必须明确 runtime_truth=false: {payload}")
    if not isinstance(evidence.get("schema_snapshot"), dict):
        raise ApiContractError(f"evidence 缺少 schema_snapshot 对象: {payload}")
    return evidence


def assert_modeling_copilot_session(payload: dict[str, Any]) -> str:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    session_id = data.get("id")
    if not session_id:
        raise ApiContractError(f"modeling-copilot session 创建响应缺少 data.id/id: {payload}")
    return str(session_id)


def assert_governance(payload: dict[str, Any]) -> None:
    data = data_object(payload, endpoint="GET /api/v1/semantic/governance/issues?schema_source=asset_snapshot")
    summary = data.get("summary")
    items = data.get("items")
    if not isinstance(summary, dict) or not isinstance(items, list):
        raise ApiContractError(f"governance issues 响应缺少 summary/items: {payload}")
    if summary.get("status") not in {"ok", "warn", "error"}:
        raise ApiContractError(f"governance summary.status 非法: {summary}")
    if not isinstance(summary.get("issue_count"), int):
        raise ApiContractError(f"governance summary.issue_count 必须是整数: {summary}")


def assert_page_visible(page, path: str, texts: tuple[str, ...]) -> None:
    target_url = f"{BASE_URL}{path}"
    try:
        page.goto(target_url, wait_until="domcontentloaded", timeout=15_000)
    except PlaywrightTimeoutError:
        if path not in page.url:
            raise
    for text in texts:
        wait_for_any_visible_text(page, text)


def wait_for_any_visible_text(page, text: str, *, timeout_ms: int = 10_000) -> None:
    """等待页面上任意一个匹配文本可见，避免隐藏命令项抢占 first() 导致误判。"""

    deadline = time.monotonic() + timeout_ms / 1000
    last_count = 0
    while time.monotonic() < deadline:
        locator = page.get_by_text(text, exact=False)
        last_count = locator.count()
        for index in range(min(last_count, 50)):
            try:
                if locator.nth(index).is_visible(timeout=100):
                    return
            except PlaywrightTimeoutError:
                continue
        page.wait_for_timeout(200)
    raise AssertionError(f"页面中未找到可见文本 {text!r}; matches={last_count}")


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)

    try:
        sync_payload = api_fetch(
            page,
            "/api/v1/semantic/assets/sync-runs",
            method="POST",
            data=deterministic_sync_payload(),
        )
        sync_run_id = assert_sync_run(sync_payload)

        assert_radar(api_fetch(page, "/api/v1/semantic/assets/radar"))
        table = find_smoke_table(
            api_fetch(page, f"/api/v1/semantic/assets/tables?source_id={SMOKE_SOURCE_ID}&page_size=50")
        )
        table_id = str(table.get("id") or table.get("asset_id"))
        evidence = assert_evidence(api_fetch(page, f"/api/v1/semantic/assets/tables/{table_id}/evidence"))
        assert_governance(api_fetch(page, "/api/v1/semantic/governance/issues?schema_source=asset_snapshot"))

        # 当前 Copilot session 创建契约只接收业务问题入口；资产 EvidenceBundle 由后续候选召回读取，
        # 这里先证明同一真实后端中数据资产证据已可用，并能接上 Modeling Copilot session。
        copilot_session_id = assert_modeling_copilot_session(
            api_fetch(
                page,
                "/api/v1/semantic/modeling-copilot/sessions",
                method="POST",
                expected_statuses={200, 201},
                data={
                    "user_goal": "查询最近 7 天学生评论数，按学校汇总",
                    "entry_type": "business_question",
                },
            )
        )

        assert_page_visible(page, "/semantic/assets", ("数据资产底座", "资产雷达"))
        assert_page_visible(page, "/semantic/assets/tables", ("数据资产底座", "物理表"))
        assert_page_visible(page, "/semantic/assets/table-profile", ("数据资产底座", "表画像"))
        assert_page_visible(page, "/semantic/assets/field-profile", ("数据资产底座", "字段画像"))
        assert_page_visible(page, "/semantic/assets/lineage-usage", ("数据资产底座", "血缘使用"))
        assert_page_visible(page, "/semantic/assets/sync", ("数据资产底座", "元数据同步"))

        print(
            "PASS: 数据资产底座 API + UI + Copilot session 真实 E2E smoke 通过 -> "
            f"sync_run_id={sync_run_id}, table_id={table_id}, "
            f"asset_refs={len(evidence['asset_refs'])}, copilot_session_id={copilot_session_id}, "
            f"asset_key={SMOKE_ASSET_KEY}"
        )
        return 0
    except (ApiContractError, AssertionError, PlaywrightTimeoutError, Exception) as exc:
        screenshot_path = dump_debug(page, api_events, "data_asset_foundation_failure.png")
        print(f"FAIL: 数据资产底座 API + UI + Copilot session 真实 E2E smoke 失败: {exc}")
        print("提示: 若后端资产 API 或前端资产页面尚未实现，这是预期的契约失败；实现后应保持本脚本通过。")
        print(f"截图: {screenshot_path}")
        return 1
    finally:
        context.close()
        browser.close()
        playwright.stop()


if __name__ == "__main__":
    sys.exit(main())
