from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli import __version__
from cubic3_dp_cli.runtime import emit_result, runtime


def describe(
    ctx: typer.Context,
    command: Annotated[str | None, typer.Option("--command", help="只查看某个命令，例如 semantic.execute")] = None,
) -> None:
    """输出 Agent 可读的 CLI 自描述信息。"""

    data = _description(runtime(ctx).base_url)
    if command:
        selected = [item for item in data["commands"] if item["id"] == command or item["command"] == command]
        data = {"command": command, "matches": selected}
    emit_result(ctx, data)


def _description(base_url: str) -> dict:
    commands = [
        _command("auth.login", "auth login", "用户名/邮箱密码登录并保存 Token Pair", "POST /api/v1/auth/login", False, True),
        _command("auth.refresh", "auth refresh", "使用 Refresh Token 主动刷新 Token Pair", "POST /api/v1/auth/refresh", False, True),
        _command("auth.feishu", "auth feishu", "生成飞书 SSO 授权 URL 或用 cli_code 兑换 Token Pair", "GET /api/v1/auth/feishu/authorize?client=cli", False, False),
        _command("auth.import-pair", "auth import-pair", "直接导入已有 access_token/refresh_token", None, False, True),
        _command("auth.whoami", "auth whoami", "查询当前认证主体", "GET /api/v1/auth/me", True, False),
        _command("auth.status", "auth status", "查看本地认证解析状态", None, False, False),
        _command("auth.logout", "auth logout", "撤销 Refresh Token 并清除当前 profile 凭据", "POST /api/v1/auth/logout", False, True),
        _command("datasource.list", "datasource list", "列出数据源", "GET /api/v1/data-center/datasources", True, False),
        _command("semantic.health", "semantic health", "检查语义 Runtime 健康状态", "GET /api/v1/semantic/health", True, False),
        _command("semantic.plan", "semantic plan", "生成 Agent-first 语义规划", "POST /api/v1/agent/semantic/plan", True, False),
        _command("semantic.execute", "semantic execute", "提交受治理问数执行", "POST /api/v1/agent/semantic/execute", True, True, "--yes"),
        _command("semantic.assets.radar", "semantic assets radar", "查看数据资产雷达摘要", "GET /api/v1/semantic/assets/radar", True, False),
        _command("semantic.assets.list", "semantic assets list", "列出数据资产物理表", "GET /api/v1/semantic/assets/tables", True, False),
        _command("semantic.assets.fields", "semantic assets fields <table_id>", "列出物理表字段", "GET /api/v1/semantic/assets/tables/{table_id}/fields", True, False),
        _command("semantic.assets.evidence", "semantic assets evidence <table_id>", "获取建模证据包", "GET /api/v1/semantic/assets/tables/{table_id}/evidence", True, False),
        _command("semantic.assets.sync-runs", "semantic assets sync-runs", "列出元数据同步批次", "GET /api/v1/semantic/assets/sync-runs", True, False),
        _command("semantic.assets.sync", "semantic assets sync <payload.json>", "创建元数据同步批次", "POST /api/v1/semantic/assets/sync-runs", True, True, "--yes"),
        _command("governance.audit.list", "governance audit list", "列出治理审计 Trace", "GET /api/v1/governance/audit-traces", True, False),
        _command("governance.audit.get", "governance audit get <trace_id>", "获取治理审计 Trace 详情", "GET /api/v1/governance/audit-traces/{trace_id}", True, False),
    ]
    return {
        "agent_first": {
            "contract": "commands are non-interactive when required flags are supplied; JSON is the stable machine-readable output",
            "dangerous_writes_require": "--yes or explicit auth command",
            "global_options_position": "root options must appear before subcommands",
            "self_describe_command": "cubic3-dp describe",
        },
        "auth": {
            "resolution_order": {
                "base_url": ["--base-url", "CUBIC3_DP_BASE_URL", "profile.base_url", "http://localhost:5000"],
                "access_token": ["--access-token", "CUBIC3_DP_ACCESS_TOKEN", "profile.access_token"],
                "refresh_token": ["--refresh-token", "CUBIC3_DP_REFRESH_TOKEN", "profile.refresh_token"],
                "api_key": ["--api-key", "CUBIC3_DP_API_KEY", "profile.api_key"],
            },
            "auto_refresh": "401 后使用 profile.refresh_token 调用 /api/v1/auth/refresh，并回写 profile",
            "config_env": "CUBIC3_DP_CONFIG",
            "profile_option": "--profile",
        },
        "base_url": base_url,
        "cli": "cubic3-dp",
        "commands": commands,
        "version": __version__,
    }


def _command(
    command_id: str,
    command: str,
    purpose: str,
    endpoint: str | None,
    requires_auth: bool,
    mutates_state: bool,
    confirmation: str | None = None,
) -> dict:
    return {
        "id": command_id,
        "command": command,
        "purpose": purpose,
        "endpoint": endpoint,
        "requires_auth": requires_auth,
        "mutates_state": mutates_state,
        "confirmation": confirmation,
    }
