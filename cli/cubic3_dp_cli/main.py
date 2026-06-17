from __future__ import annotations

import sys

import click

from cubic3_dp_cli.app import app
from cubic3_dp_cli.client import Cubic3DpError


def main(argv: list[str] | None = None) -> int:
    try:
        app(args=argv, prog_name="cubic3-dp", standalone_mode=False)
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
