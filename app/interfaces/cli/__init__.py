"""CUBIC3 语义平台 in-process 本地 CLI（agent 操作面）。

设计见 docs/architecture/semantic-platform-cli-plan.md：
- 一个 in-process 命令核（create_app(role='worker') + app_context + DI 直调既有 application 服务），
  是 agent 的主操作面；薄封装、零新建领域逻辑、零新建端点。
- 入口：`python -m app.interfaces.cli`（参考 wsgi.py / run_worker.py 的装配方式）。

当前覆盖 P0（骨架）+ P1（只读读域：datasource / asset / cube / ontology / manifest）。
"""
from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.1.0"
