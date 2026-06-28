"""入口：python -m app.interfaces.cli ...

退出码由命令内 fail()/not_found() 抛 SystemExit 决定；click 处理用法错（exit 2）。
"""
from __future__ import annotations

from app.interfaces.cli.root import cli

if __name__ == "__main__":
    cli()
