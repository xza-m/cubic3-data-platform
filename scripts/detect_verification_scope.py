#!/usr/bin/env python3
"""兼容旧路径；请改用 scripts/checks/changed_validation.py。"""

from __future__ import annotations

import runpy
from pathlib import Path


TARGET = Path(__file__).resolve().parent / "checks" / "changed_validation.py"


if __name__ == "__main__":
    runpy.run_path(str(TARGET), run_name="__main__")
