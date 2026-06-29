from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli import __version__
from cubic3_dp_cli.output import emit
from cubic3_dp_cli.runtime import runtime


def describe(
    ctx: typer.Context,
    command: Annotated[str | None, typer.Option("--command", help="只查看某个命令，例如 cube.show")] = None,
) -> None:
    """输出 Agent 可读的 CLI 自描述信息。"""

    data = _description(runtime(ctx).base_url)
    if command:
        selected = [item for item in data["commands"] if item["id"] == command or item["command"] == command]
        data = {"command": command, "matches": selected}
    # 与 semctl describe 同契约：包 envelope
    emit({"code": 0, "message": "success", "data": data, "trace_id": None}, output=runtime(ctx).output)


def _description(base_url: str) -> dict:
    commands = [
        _command("auth.login", "auth login", "用户名/邮箱密码登录并保存 Token Pair", "POST /api/v1/auth/login", False, True),
        _command("auth.whoami", "auth whoami", "查询当前认证主体", "GET /api/v1/auth/me", True, False),
        # T1 读 / 查询 / preview（http-client 覆盖；与 semctl 同词汇/同 envelope）
        _command("datasource.list", "datasource list", "列出数据源", "GET /api/v1/data-center/datasources", True, False),
        _command("datasource.show", "datasource show <id>", "查看单个数据源", "GET /api/v1/data-center/datasources/{id}", True, False),
        _command("asset.list", "asset list", "列出数据资产物理表", "GET /api/v1/semantic/assets/tables", True, False),
        _command("asset.show", "asset show <table_id>", "查看资产表详情", "GET /api/v1/semantic/assets/tables/{id}", True, False),
        _command("asset.fields", "asset fields <table_id>", "列出资产表字段", "GET /api/v1/semantic/assets/tables/{id}/fields", True, False),
        _command("asset.evidence", "asset evidence <table_id>", "构建资产证据包", "GET /api/v1/semantic/assets/tables/{id}/evidence", True, False),
        _command("cube.list", "cube list", "列出 Cube 定义", "GET /api/v1/semantic/cubes", True, False),
        _command("cube.show", "cube show <name>", "查看 Cube（含 dims/measures）", "GET /api/v1/semantic/cubes/{name}", True, False),
        _command("view.list", "view list", "列出 View 定义", "GET /api/v1/semantic/views", True, False),
        _command("view.show", "view show <name>", "查看 View 详情", "GET /api/v1/semantic/views/{name}", True, False),
        _command("ontology.list", "ontology <kind> list", "列出本体（kind: object/property/metric/glossary/relation/action/policy）", "GET /api/v1/ontology/{plural}", True, False),
        _command("ontology.show", "ontology <kind> show <key>", "查看单个本体", "GET /api/v1/ontology/{plural}/{key}", True, False),
        _command("ontology.status", "ontology <kind> status <key>", "查本体状态（投影 show.status）", "GET /api/v1/ontology/{plural}/{key}", True, False),
        _command("query.compile", "query compile --dsl <json>", "QueryDSL→SQL（纯编译）", "POST /api/v1/semantic/compile", True, False),
        _command("query.plan", "query plan <question>", "NL→语义规划", "POST /api/v1/semantic-router/plan", True, False),
        _command("query.explain", "query explain <question>", "NL→编译预览 SQL（不出数）", "POST /api/v1/semantic-router/execute-plan-preview", True, False),
        _command("intent.route", "intent route <question>", "语义路由", "POST /api/v1/semantic-router/route", True, False),
        _command("intent.extract", "intent extract <question>", "L1 意图理解产物（投影 route）", "POST /api/v1/semantic-router/route", True, False),
        _command("intent.answerability", "intent answerability <question>", "可回答性门控（投影 route）", "POST /api/v1/semantic-router/route", True, False),
        _command("manifest.show", "manifest show", "查看 active runtime manifest", "GET /api/v1/semantic/manifest", True, False),
        _command("release.list", "release list", "列出语义发布", "GET /api/v1/semantic/releases", True, False),
        _command("release.show", "release show <id>", "查看发布详情", "GET /api/v1/semantic/releases/{id}", True, False),
        _command("chat.observe", "chat observe", "观察 DataChat 问数：结果分布+缺口维度+样例", "GET /api/v1/conversations/datachat/observe", True, False),
        _command("governance.audit.list", "governance audit list", "列出治理审计 Trace", "GET /api/v1/governance/audit-traces", True, False),
    ]
    return {
        "agent_first": {
            "contract": "默认输出 JSON envelope {code,message,data,trace_id}；与 in-process semctl 同契约",
            "exit_codes": {"0": "ok", "1": "error", "2": "usage", "4": "not_found", "5": "not_ready"},
            "dangerous_writes_require": "--yes",
            "global_options_position": "root options must appear before subcommands",
            "self_describe_command": "cubic3-dp describe",
        },
        "scope": {
            "this_cli": "cubic3-dp（http-client，可 npm 分发）：T1 读/查询/preview。",
            "local_only_semctl": "写域走本地引擎 semctl（python -m app.interfaces.cli，需 exec 进部署）："
            "cube draft/create/update、proposal 7 步发布管线、release rollback、ontology upsert/publish。"
            "原因：写 live manifest/共享语义定义的信任边界是 exec，不对远程 token 开放。",
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
