"""in-process CLI 装配：create_app(role='worker') + app_context + DI 容器。

参考 run_worker.py。`worker` 角色不注册 web 路由 / scheduler / 飞书长连接，
但完整装配 DB + DI 容器（实测 role='worker' 启动后 url_map 只剩 static 一条规则）。
CLI 是短生命周期进程：每个进程内 boot 一次 app（memoize），命令在 app_context 内直调服务。
"""
from __future__ import annotations

import contextlib
import logging
import sys
from typing import Iterator, Tuple

_app = None


def _redirect_log_streams_to_stderr() -> None:
    """把所有绑定到 stdout 的日志 StreamHandler 改指 stderr。

    StructuredLogger 在 import 期就创建了 StreamHandler(sys.stdout)（早于任何替换），
    必须显式改它们的 stream；否则日志 JSON 行会混进 CLI 的 stdout 结果里。
    约定：结果走 stdout / 日志走 stderr。
    """
    targets = {sys.__stdout__, sys.stdout}
    root = logging.getLogger()
    loggers = [root] + [logging.getLogger(name) for name in list(root.manager.loggerDict)]
    for log in loggers:
        for handler in list(getattr(log, "handlers", [])):
            if isinstance(handler, logging.StreamHandler) and getattr(handler, "stream", None) in targets:
                handler.stream = sys.stderr


def get_app():
    """进程内单例：首次调用时 create_app(role='worker')。

    双管确保 stdout 只留 JSON：① 重定向 import 期已建的 stdout handler→stderr；
    ② boot 期临时把 sys.stdout 指向 stderr，使 create_app 期新建的 handler 也绑 stderr；
    ③ boot 后再重定向一次兜底。
    """
    global _app
    if _app is None:
        _redirect_log_streams_to_stderr()
        real_stdout = sys.stdout
        sys.stdout = sys.stderr
        try:
            from app import create_app

            _app = create_app(role="worker")
        finally:
            sys.stdout = real_stdout
        _redirect_log_streams_to_stderr()
    return _app


@contextlib.contextmanager
def app_context() -> Iterator[Tuple[object, object]]:
    """进入 Flask app_context，产出 (app, container)。

    所有 DI 服务调用都必须在此上下文内（db_session provider 是 Flask-SQLAlchemy
    scoped session，脱离 app_context 取会报无应用上下文）。
    """
    app = get_app()
    with app.app_context():
        yield app, app.container
