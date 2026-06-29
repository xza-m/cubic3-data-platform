from __future__ import annotations

import os
from typing import Annotated

import typer

from cubic3_dp_cli.client import ClientConfig, Cubic3DpClient
from cubic3_dp_cli.commands import (
    asset,
    auth,
    chat,
    cube,
    datasource,
    describe,
    governance,
    intent,
    manifest,
    ontology,
    query,
    release,
    view,
)
from cubic3_dp_cli.config import CliConfigStore, DEFAULT_BASE_URL
from cubic3_dp_cli.runtime import OutputFormat, RuntimeContext


app = typer.Typer(
    name="cubic3-dp",
    help="CUBIC3 Data Platform CLI",
    no_args_is_help=True,
    context_settings={"help_option_names": ["-h", "--help"]},
)

app.add_typer(auth.app, name="auth")
app.add_typer(datasource.app, name="datasource")
app.add_typer(asset.app, name="asset")
app.add_typer(cube.app, name="cube")
app.add_typer(view.app, name="view")
app.add_typer(query.app, name="query")
app.add_typer(intent.app, name="intent")
app.add_typer(chat.app, name="chat")
app.add_typer(ontology.app, name="ontology")
app.add_typer(manifest.app, name="manifest")
app.add_typer(release.app, name="release")
app.add_typer(governance.app, name="governance")
app.command("describe", help="输出 Agent 可读的 CLI 自描述信息")(describe.describe)


@app.callback()
def root(
    ctx: typer.Context,
    base_url: Annotated[
        str | None,
        typer.Option(
            "--base-url",
            help="后端 API 地址；解析顺序：参数 > CUBIC3_DP_BASE_URL > profile > http://localhost:5000",
        ),
    ] = None,
    access_token: Annotated[
        str | None,
        typer.Option(
            "--access-token",
            help="平台 Access Token；解析顺序：参数 > CUBIC3_DP_ACCESS_TOKEN > profile",
        ),
    ] = None,
    refresh_token: Annotated[
        str | None,
        typer.Option(
            "--refresh-token",
            help="平台 Refresh Token；解析顺序：参数 > CUBIC3_DP_REFRESH_TOKEN > profile",
        ),
    ] = None,
    api_key: Annotated[
        str | None,
        typer.Option("--api-key", help="平台 API Key；解析顺序：参数 > CUBIC3_DP_API_KEY > profile"),
    ] = None,
    profile: Annotated[str, typer.Option("--profile", help="本地 CLI profile 名称")] = "default",
    config_path: Annotated[
        str | None,
        typer.Option("--config", help="CLI 配置文件路径，默认读取 CUBIC3_DP_CONFIG 或 ~/.config/cubic3-dp/config.json"),
    ] = None,
    timeout: Annotated[float, typer.Option("--timeout", help="请求超时时间，单位秒")] = 30.0,
    output: Annotated[
        OutputFormat,
        typer.Option("--output", help="输出格式", case_sensitive=False),
    ] = OutputFormat.json,
) -> None:
    config_store = CliConfigStore.from_env(config_path)
    stored_profile = config_store.get_profile(profile)
    resolved_base_url = (
        base_url
        or os.getenv("CUBIC3_DP_BASE_URL")
        or stored_profile.base_url
        or DEFAULT_BASE_URL
    )
    resolved_access_token = access_token or os.getenv("CUBIC3_DP_ACCESS_TOKEN") or stored_profile.access_token
    resolved_refresh_token = refresh_token or os.getenv("CUBIC3_DP_REFRESH_TOKEN") or stored_profile.refresh_token
    resolved_api_key = api_key or os.getenv("CUBIC3_DP_API_KEY") or stored_profile.api_key
    auth_source = _auth_source(access_token=access_token, api_key=api_key, stored_profile=stored_profile)
    refresh_handler = _build_refresh_handler(
        config_store=config_store,
        profile=profile,
        base_url=resolved_base_url,
        timeout=timeout,
        refresh_token=resolved_refresh_token,
    )
    ctx.obj = RuntimeContext(
        client=Cubic3DpClient(
            ClientConfig(
                base_url=resolved_base_url,
                access_token=resolved_access_token,
                api_key=resolved_api_key,
                timeout=timeout,
            ),
            refresh_handler=refresh_handler,
        ),
        output=output.value,
        config_store=config_store,
        profile=profile,
        base_url=resolved_base_url,
        timeout=timeout,
        auth_source=auth_source,
        access_token=resolved_access_token,
        refresh_token=resolved_refresh_token,
        access_expires_at=stored_profile.access_expires_at,
        refresh_expires_at=stored_profile.refresh_expires_at,
        api_key=resolved_api_key,
    )


def _auth_source(*, access_token: str | None, api_key: str | None, stored_profile) -> str:
    if access_token:
        return "option_access_token"
    if api_key:
        return "option_api_key"
    if os.getenv("CUBIC3_DP_ACCESS_TOKEN"):
        return "env_access_token"
    if os.getenv("CUBIC3_DP_API_KEY"):
        return "env_api_key"
    if getattr(stored_profile, "access_token", None):
        return "profile_token_pair"
    if getattr(stored_profile, "api_key", None):
        return "profile_api_key"
    return "none"


def _build_refresh_handler(
    *,
    config_store: CliConfigStore,
    profile: str,
    base_url: str,
    timeout: float,
    refresh_token: str | None,
):
    current_refresh_token = refresh_token

    def refresh() -> str | None:
        nonlocal current_refresh_token
        if not current_refresh_token:
            return None
        client = Cubic3DpClient(ClientConfig(base_url=base_url, timeout=timeout))
        result = client.post("/api/v1/auth/refresh", json_body={"refresh_token": current_refresh_token})
        access_value = str(result.get("access_token") or "").strip() if isinstance(result, dict) else ""
        refresh_value = str(result.get("refresh_token") or "").strip() if isinstance(result, dict) else ""
        if not access_value or not refresh_value:
            return None
        current_refresh_token = refresh_value
        config_store.save_auth(
            profile_name=profile,
            base_url=base_url,
            access_token=access_value,
            refresh_token=refresh_value,
            access_expires_at=str(result.get("access_expires_at") or "") or None,
            refresh_expires_at=str(result.get("refresh_expires_at") or "") or None,
            auth_type="token_pair",
        )
        return access_value

    return refresh if refresh_token else None
