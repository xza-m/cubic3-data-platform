from __future__ import annotations

import sys
import webbrowser
from typing import Annotated, Any
from urllib.parse import urljoin

import typer

from cubic3_dp_cli.client import ClientConfig, Cubic3DpClient, Cubic3DpError
from cubic3_dp_cli.runtime import emit_result, runtime


app = typer.Typer(help="认证、SSO 与本地 profile 命令", no_args_is_help=True)
api_key_app = typer.Typer(help="API Key 本地保存命令", no_args_is_help=True)
app.add_typer(api_key_app, name="api-key")


@app.command("login", help="用户名或邮箱密码登录，获取并保存 Token Pair")
def login(
    ctx: typer.Context,
    username: Annotated[str | None, typer.Option("--username", "-u", help="登录用户名")] = None,
    email: Annotated[str | None, typer.Option("--email", help="登录邮箱；会作为后端 username 字段提交")] = None,
    password: Annotated[str | None, typer.Option("--password", help="登录密码；建议仅在自动化环境使用")] = None,
    password_env: Annotated[str | None, typer.Option("--password-env", help="从指定环境变量读取密码")] = None,
    password_stdin: Annotated[bool, typer.Option("--password-stdin", help="从 stdin 读取密码")] = False,
    save: Annotated[bool, typer.Option("--save/--no-save", help="是否保存 Token Pair 到当前 profile")] = True,
    show_tokens: Annotated[bool, typer.Option("--show-tokens", help="在输出中显示 access_token 与 refresh_token")] = False,
) -> None:
    identifier = _login_identifier(username=username, email=email)
    resolved_password = _password(password=password, password_env=password_env, password_stdin=password_stdin)
    result = _login(ctx, identifier=identifier, password=resolved_password)
    token_pair = _token_pair_from_result(result)
    saved = _save_token_pair(ctx, token_pair=token_pair) if save else None
    payload: dict[str, Any] = {
        "auth_type": "token_pair",
        "base_url": runtime(ctx).base_url,
        "expires_in": token_pair["expires_in"],
        "refresh_expires_in": token_pair["refresh_expires_in"],
        "profile": runtime(ctx).profile,
        "saved": save,
        "token_source": "auth.login",
    }
    if saved:
        payload["config_path"] = str(runtime(ctx).config_store.path)
    if show_tokens or not save:
        payload["access_token"] = token_pair["access_token"]
        payload["refresh_token"] = token_pair["refresh_token"]
    emit_result(ctx, payload)


@app.command("whoami", help="查询当前认证主体")
def whoami(ctx: typer.Context) -> None:
    current = runtime(ctx)
    emit_result(
        ctx,
        {
            "auth_source": current.auth_source,
            "base_url": current.base_url,
            "profile": current.profile,
            "user": current.client.get("/api/v1/auth/me"),
        },
    )


@app.command("status", help="查看 CLI 认证解析状态，不输出敏感值")
def status(ctx: typer.Context) -> None:
    current = runtime(ctx)
    emit_result(
        ctx,
        {
            "auth_source": current.auth_source,
            "base_url": current.base_url,
            "config_path": str(current.config_store.path),
            "has_api_key": bool(current.api_key),
            "has_access_token": bool(current.access_token),
            "has_refresh_token": bool(current.refresh_token),
            "has_token_pair": bool(current.access_token and current.refresh_token),
            "profile": current.profile,
        },
    )


@app.command("logout", help="撤销当前 Refresh Token 并清除 profile 凭据")
def logout(ctx: typer.Context) -> None:
    current = runtime(ctx)
    remote_revoked = False
    if current.refresh_token:
        try:
            result = _unauthenticated_client(ctx).post(
                "/api/v1/auth/logout",
                json_body={"refresh_token": current.refresh_token},
            )
            remote_revoked = bool(isinstance(result, dict) and result.get("revoked"))
        except Cubic3DpError:
            remote_revoked = False
    current.config_store.clear_auth(profile_name=current.profile)
    emit_result(
        ctx,
        {
            "cleared": True,
            "config_path": str(current.config_store.path),
            "profile": current.profile,
            "remote_revoked": remote_revoked,
        },
    )


@app.command("import-pair", help="导入已有 Token Pair")
def import_pair(
    ctx: typer.Context,
    access_token: Annotated[str | None, typer.Option("--access-token", help="Access Token")] = None,
    refresh_token: Annotated[str | None, typer.Option("--refresh-token", help="Refresh Token")] = None,
    show_tokens: Annotated[bool, typer.Option("--show-tokens", help="在输出中显示 Token Pair")] = False,
) -> None:
    token_pair = extract_token_pair(
        access_token=access_token,
        refresh_token=refresh_token,
    )
    _save_token_pair(ctx, token_pair=token_pair)
    payload = {
        "auth_type": "token_pair",
        "base_url": runtime(ctx).base_url,
        "config_path": str(runtime(ctx).config_store.path),
        "profile": runtime(ctx).profile,
        "saved": True,
        "token_source": "auth.import-pair",
    }
    if show_tokens:
        payload["access_token"] = token_pair["access_token"]
        payload["refresh_token"] = token_pair["refresh_token"]
    emit_result(ctx, payload)


@app.command("feishu", help="飞书 SSO 登录：生成授权 URL，或用 CLI 一次性 code 兑换 Token Pair")
def feishu(
    ctx: typer.Context,
    exchange_code: Annotated[
        str | None,
        typer.Option("--exchange-code", help="完成 CLI SSO：传入回调页上的 code"),
    ] = None,
    open_browser: Annotated[bool, typer.Option("--open-browser", help="使用默认浏览器打开授权 URL")] = False,
    show_tokens: Annotated[bool, typer.Option("--show-tokens", help="完成登录时在输出中显示 Token Pair")] = False,
) -> None:
    if exchange_code:
        token_pair = _exchange_feishu_code(ctx, code=exchange_code)
        _save_token_pair(ctx, token_pair=token_pair)
        payload = {
            "auth_type": "token_pair",
            "base_url": runtime(ctx).base_url,
            "config_path": str(runtime(ctx).config_store.path),
            "profile": runtime(ctx).profile,
            "saved": True,
            "token_source": "auth.feishu.exchange",
        }
        if show_tokens:
            payload["access_token"] = token_pair["access_token"]
            payload["refresh_token"] = token_pair["refresh_token"]
        emit_result(ctx, payload)
        return

    authorize_url = _feishu_authorize_url(ctx)
    if open_browser:
        webbrowser.open(authorize_url)
    emit_result(
        ctx,
        {
            "authorization_url": authorize_url,
            "base_url": runtime(ctx).base_url,
            "opened_browser": open_browser,
            "profile": runtime(ctx).profile,
            "next_steps": [
                "在浏览器中打开 authorization_url；浏览器会先访问平台授权入口，再跳转到飞书",
                "从最终跳转登录页复制 cli_code 参数",
                "执行 cubic3-dp auth feishu --exchange-code '<cli_code>'",
            ],
            "complete_command": "cubic3-dp auth feishu --exchange-code '<cli_code>'",
        },
    )


@app.command("refresh", help="使用当前 Refresh Token 主动刷新 Token Pair")
def refresh(ctx: typer.Context, show_tokens: Annotated[bool, typer.Option("--show-tokens", help="在输出中显示 Token Pair")] = False) -> None:
    current = runtime(ctx)
    if not current.refresh_token:
        raise Cubic3DpError("当前 profile 未保存 refresh_token，请重新登录", exit_code=2)
    result = _unauthenticated_client(ctx).post(
        "/api/v1/auth/refresh",
        json_body={"refresh_token": current.refresh_token},
    )
    token_pair = _token_pair_from_result(result)
    _save_token_pair(ctx, token_pair=token_pair)
    payload: dict[str, Any] = {
        "auth_type": "token_pair",
        "base_url": current.base_url,
        "config_path": str(current.config_store.path),
        "expires_in": token_pair["expires_in"],
        "profile": current.profile,
        "refresh_expires_in": token_pair["refresh_expires_in"],
        "saved": True,
        "token_source": "auth.refresh",
    }
    if show_tokens:
        payload["access_token"] = token_pair["access_token"]
        payload["refresh_token"] = token_pair["refresh_token"]
    emit_result(ctx, payload)


@api_key_app.command("set", help="保存平台 API Key 到当前 profile")
def set_api_key(
    ctx: typer.Context,
    api_key: Annotated[str | None, typer.Option("--api-key", help="平台 API Key；缺省时从 stdin 读取")] = None,
) -> None:
    value = (api_key or sys.stdin.read()).strip()
    if not value:
        raise Cubic3DpError("API Key 不能为空")
    current = runtime(ctx)
    current.config_store.save_auth(
        profile_name=current.profile,
        base_url=current.base_url,
        api_key=value,
        auth_type="api_key",
    )
    emit_result(
        ctx,
        {
            "auth_type": "api_key",
            "base_url": current.base_url,
            "config_path": str(current.config_store.path),
            "profile": current.profile,
            "saved": True,
        },
    )


def extract_token_pair(
    *,
    access_token: str | None = None,
    refresh_token: str | None = None,
) -> dict[str, Any]:
    access_value = str(access_token or "").strip()
    refresh_value = str(refresh_token or "").strip()
    if not access_value or not refresh_value:
        raise Cubic3DpError("必须提供 access_token 与 refresh_token", exit_code=2)
    return {
        "access_token": access_value,
        "refresh_token": refresh_value,
        "expires_in": 0,
        "refresh_expires_in": 0,
        "access_expires_at": None,
        "refresh_expires_at": None,
    }


def _login_identifier(*, username: str | None, email: str | None) -> str:
    if username and email:
        raise Cubic3DpError("--username 和 --email 只能提供一个", exit_code=2)
    identifier = (email or username or "").strip()
    if not identifier:
        raise Cubic3DpError("请提供 --username 或 --email", exit_code=2)
    return identifier


def _password(*, password: str | None, password_env: str | None, password_stdin: bool) -> str:
    if password_env:
        import os

        password = os.getenv(password_env)
    if password_stdin:
        password = sys.stdin.read()
    if password is None:
        password = typer.prompt("Password", hide_input=True)
    value = str(password or "").strip()
    if not value:
        raise Cubic3DpError("密码不能为空", exit_code=2)
    return value


def _login(ctx: typer.Context, *, identifier: str, password: str) -> Any:
    return _unauthenticated_client(ctx).post(
        "/api/v1/auth/login",
        json_body={"username": identifier, "password": password},
    )


def _feishu_authorize_url(ctx: typer.Context) -> str:
    """返回平台授权入口，确保浏览器持有 OAuth state cookie。"""
    return urljoin(runtime(ctx).base_url.rstrip("/") + "/", "api/v1/auth/feishu/authorize?client=cli")


def _token_pair_from_result(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise Cubic3DpError("服务端未返回 Token Pair")
    access_token = str(result.get("access_token") or "").strip()
    refresh_token = str(result.get("refresh_token") or "").strip()
    if not access_token or not refresh_token:
        raise Cubic3DpError("服务端未返回完整 Token Pair")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": int(result.get("expires_in") or 0),
        "refresh_expires_in": int(result.get("refresh_expires_in") or 0),
        "access_expires_at": result.get("access_expires_at"),
        "refresh_expires_at": result.get("refresh_expires_at"),
    }


def _save_token_pair(ctx: typer.Context, *, token_pair: dict[str, Any]):
    current = runtime(ctx)
    return current.config_store.save_auth(
        profile_name=current.profile,
        base_url=current.base_url,
        access_token=token_pair["access_token"],
        refresh_token=token_pair["refresh_token"],
        access_expires_at=token_pair.get("access_expires_at"),
        refresh_expires_at=token_pair.get("refresh_expires_at"),
        auth_type="token_pair",
    )


def _exchange_feishu_code(ctx: typer.Context, *, code: str) -> dict[str, Any]:
    result = _unauthenticated_client(ctx).post(
        "/api/v1/auth/feishu/exchange",
        json_body={"code": code},
    )
    return _token_pair_from_result(result)


def _unauthenticated_client(ctx: typer.Context) -> Cubic3DpClient:
    current = runtime(ctx)
    return Cubic3DpClient(ClientConfig(base_url=current.base_url, timeout=current.timeout))
