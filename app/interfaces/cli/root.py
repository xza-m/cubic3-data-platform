"""in-process CLI 根命令组：全局 --output / --principal + 子命令装配 + P0 自检命令。"""
from __future__ import annotations

import click

from app.interfaces.cli import __version__
from app.interfaces.cli.commands import asset, chat, cube, datasource, intent, manifest, ontology, query
from app.interfaces.cli.output import emit_success, run


class CliCtx:
    """根上下文：输出格式 + 身份。"""

    def __init__(self, output: str, principal: str | None):
        self.output = output
        self.principal = principal


@click.group(
    name="semctl",
    context_settings={"help_option_names": ["-h", "--help"]},
    help="CUBIC3 语义平台 in-process 本地 CLI（agent 操作面；P0 骨架 + P1 只读读域）。",
)
@click.option("--output", type=click.Choice(["json", "human"]), default="json", show_default=True, help="输出格式")
@click.option("--principal", default=None, help="principal_id（P1 只读命令不强制；写域用）")
@click.version_option(__version__, "-V", "--version", prog_name="semctl")
@click.pass_context
def cli(ctx: click.Context, output: str, principal: str | None) -> None:
    ctx.obj = CliCtx(output=output, principal=principal)


@cli.command("me", help="解析 --principal 的身份与角色（P0 鉴权链路自检）")
@click.pass_obj
def me(obj: CliCtx) -> None:
    def body(_container):
        from app.interfaces.cli.principal import resolve_principal

        return resolve_principal(obj.principal)

    run(obj, body)


@cli.command("describe", help="输出 agent 可读的命令目录（自描述）")
@click.pass_obj
def describe(obj: CliCtx) -> None:
    catalog = {
        "cli": "semctl",
        "version": __version__,
        "mode": "in-process (create_app role=worker + app_context + DI)",
        "contract": {
            "output": "默认 JSON envelope {code,message,data,trace_id}；--output human 给表格",
            "exit_codes": {"0": "ok", "1": "error", "2": "usage", "4": "not_found", "5": "not_ready"},
            "auth": "--principal <id>（P1 只读不强制）",
            "phase": "P0 骨架 + P1 只读读域；写域见 docs/architecture/semantic-platform-cli-plan.md",
        },
        "groups": {
            "datasource": ["list", "show <id>"],
            "asset": ["list", "show <table_id>", "fields <table_id>", "evidence <table_id>"],
            "cube": ["list", "show <name>", "describe <name>"],
            "ontology": ["<kind> list", "<kind> show <key>  (kind: object/property/metric/glossary/relation/action/policy)"],
            "manifest": ["show [--namespace] [--release]"],
            "query": ["compile <dsl>", "plan <question>", "explain <question>  (preview-only,不出数)"],
            "intent": ["route <question>", "extract <question>", "answerability <question>  (--runtime-mode official|preview)"],
            "chat": ["observe [--limit] [--channel]"],
            "me": [],
        },
        "deferred": {
            "query": ["run/execute/status (MaxCompute/gateway/RLS dev 阻断)", "diagnose (写库+需聚合)"],
            "intent": ["eval (脚本移植+真实 LLM)"],
            "note": "写域/建模发布见 P3；远程走既有 HTTP cubic3_dp_cli",
        },
    }
    emit_success(catalog, output=obj.output)


cli.add_command(datasource.datasource)
cli.add_command(asset.asset)
cli.add_command(cube.cube)
cli.add_command(ontology.ontology)
cli.add_command(manifest.manifest)
cli.add_command(query.query)
cli.add_command(intent.intent)
cli.add_command(chat.chat)
