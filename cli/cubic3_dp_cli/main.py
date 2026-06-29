from __future__ import annotations

import sys

import click

from cubic3_dp_cli.app import app
from cubic3_dp_cli.client import Cubic3DpError


def main(argv: list[str] | None = None) -> int:
    try:
        # standalone_mode=False 下 click 内部捕获 typer.Exit 并把 exit_code 作为返回值返回，
        # 不再抛 Exit 异常——必须接住该返回值，否则 not_found(4)/not_ready(5)/usage(2) 等退出码丢失。
        result = app(args=argv, prog_name="cubic3-dp", standalone_mode=False)
        if isinstance(result, int):
            return result
    except Cubic3DpError as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
    except click.ClickException as exc:
        exc.show(file=sys.stderr)
        return exc.exit_code
    except click.exceptions.Exit as exc:
        return int(exc.exit_code)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
