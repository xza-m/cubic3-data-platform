#!/usr/bin/env python3
# scripts/cutover/digest_oncall.py
# Round 4 · Sprint 0 · T-004b — 从 nginx + backend 容器日志抽取摘要，输出 OnCall 日报（Markdown）。

"""Generate an OnCall digest markdown from docker compose logs (nginx + backend).

Usage:
  python3 scripts/cutover/digest_oncall.py
  python3 scripts/cutover/digest_oncall.py --since 48h -o /tmp/digest.md
  python3 scripts/cutover/digest_oncall.py --no-docker --nginx-file /var/log/...

Exit codes: 0 always on successful write/print; 1 on argparse error.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# 归类「疑似异常」行（仅启发式，非 logfmt 强类型）
PATTERN_HOT = re.compile(
    r"(?i)(error|exception|traceback|fatal|crit|emerg|"
    r"502|503|500|504|connection refused|timeout|upstream|"
    r"no such file|operationalerror|integrityerror)"
)

PATTERN_5XX = re.compile(r"(\b5[0-4][0-9]\b|\"5[0-4][0-9]\"|\s5[0-4][0-9]\s)")


@dataclass
class LogChunk:
    name: str
    lines: list[str] = field(default_factory=list)
    err: str | None = None


def _run_compose_logs(
    compose_file: str, services: list[str], since: str, tail: int
) -> LogChunk:
    args = [
        "docker",
        "compose",
        "-f",
        str(REPO_ROOT / compose_file),
        "logs",
        "--no-color",
    ]
    if since:
        args.extend(["--since", since])
    if tail and not since:
        args.extend(["--tail", str(tail)])
    args.extend(services)
    try:
        out = subprocess.run(
            args,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if out.returncode != 0 and not out.stdout.strip():
            return LogChunk(
                name=",".join(services),
                err=(out.stderr or f"exit {out.returncode}").strip(),
            )
        return LogChunk(name=",".join(services), lines=out.stdout.splitlines())
    except FileNotFoundError:
        return LogChunk("docker", err="docker CLI not found")
    except subprocess.TimeoutExpired:
        return LogChunk(name=",".join(services), err="timeout 120s")


def _read_file(path: Path) -> LogChunk:
    if not path.is_file():
        return LogChunk(name=path.name, err=f"not a file: {path}")
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return LogChunk(name=path.name, err=str(e))
    return LogChunk(name=path.name, lines=text.splitlines())


def _scan(lines: list[str]) -> tuple[int, int, int, list[str], Counter[str]]:
    total = len(lines)
    hot = 0
    s5xx_mentions = 0
    samples: list[str] = []
    by_kw: Counter[str] = Counter()
    for line in lines:
        if PATTERN_5XX.search(line):
            s5xx_mentions += 1
        if PATTERN_HOT.search(line):
            hot += 1
            m = PATTERN_HOT.search(line)
            if m:
                key = m.group(0)[:32].lower()
                by_kw[key] += 1
            if len(samples) < 8:
                clip = line.strip()[:500]
                if clip:
                    samples.append(clip)
    return total, hot, s5xx_mentions, samples, by_kw


def _md_escape(s: str) -> str:
    return s.replace("|", r"\|").replace("\n", " ")


def build_markdown(
    chunks: list[LogChunk], *, since: str, source: str
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out: list[str] = [
        f"# OnCall 日报 · digest_oncall (T-004b) · {now}",
        "",
        f"- **时间窗**: `{since or 'full tail'}`  ·  **来源**: {source}",
        "",
        "## 摘要",
        "",
    ]
    for ch in chunks:
        title = ch.name
        if ch.err:
            out.append(f"### {title}")
            out.append(f"- **采集失败**: `{_md_escape(ch.err)}`")
            out.append("")
            continue
        total, hot, s5, samples, by_kw = _scan(ch.lines)
        rate = (hot / total * 100.0) if total else 0.0
        out.append(f"### {title}")
        out.append(
            f"| 行数 | 疑似异常行 | ~5xx 相关 | 粗错误率(启发式) |"
        )
        out.append(f"| --- | ---: | ---: | ---: |")
        out.append(
            f"| {total} | {hot} | {s5} | {rate:.2f}% |"
        )
        if by_kw:
            top = by_kw.most_common(5)
            out.append("")
            out.append("**关键词 Top-5**（子串，仅归类用）：")
            for k, c in top:
                out.append(f"- `{_md_escape(k)}` — {c}")
        if samples:
            out.append("")
            out.append("<details><summary>样例行（脱敏后仍请人工审）</summary>\n")
            for s in samples:
                out.append(f"```\n{s}\n```\n")
            out.append("</details>\n")
        out.append("")

    out.append("## 建议动作")
    out.append("")
    out.append(
        "1. 若 `502` 或 `upstream` 多：先 `scripts/cutover/health_probe.sh`，"
        "再查 `BACKEND` 容器与 DB migration（Round 4 T-002）。"
    )
    out.append("2. 若 `traceback` 成簇：在 backend 中搜同一 endpoint，贴到 incident 文档。")
    out.append("3. 本报表为**启发式**统计，不替代 Sentry / 可观测性平台分位数告警。")
    out.append("")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="T-004b — aggregate nginx + backend logs into a markdown OnCall digest."
    )
    ap.add_argument(
        "--since",
        default="24h",
        help="docker compose logs --since (e.g. 24h, 2h). Empty = use --tail only.",
    )
    ap.add_argument(
        "--tail",
        type=int,
        default=0,
        help="if --since is empty, pass --tail N to compose logs (default 0 = not set).",
    )
    ap.add_argument(
        "--compose-file",
        default="docker-compose.yml",
        help="compose file relative to repo root",
    )
    ap.add_argument(
        "--services",
        nargs="+",
        default=["nginx", "backend"],
        help="container services to include",
    )
    ap.add_argument(
        "--no-docker",
        action="store_true",
        help="do not call docker; use --nginx-file/--backend-file or emit stub",
    )
    ap.add_argument("--nginx-file", type=Path, help="optional local nginx log")
    ap.add_argument("--backend-file", type=Path, help="optional local backend log")
    ap.add_argument(
        "-o", "--output", type=Path, help="write markdown to file (default: stdout)"
    )
    args = ap.parse_args()

    chunks: list[LogChunk] = []
    source = ""

    if args.no_docker and not args.nginx_file and not args.backend_file:
        text = build_markdown(
            [
                LogChunk(
                    "stub",
                    err="--no-docker 且未提供 --nginx-file / --backend-file；"
                    "请在本机有 docker 时改跑: python3 scripts/cutover/digest_oncall.py",
                )
            ],
            since=args.since,
            source="no-docker (empty)",
        )
        if args.output:
            args.output.write_text(text, encoding="utf-8")
        else:
            print(text, end="")
        return 0

    if args.nginx_file or args.backend_file or args.no_docker:
        if args.nginx_file:
            chunks.append(_read_file(args.nginx_file))
        if args.backend_file:
            chunks.append(_read_file(args.backend_file))
        source = "local files"
    else:
        since_arg = args.since or ""
        tail_arg = int(args.tail) if args.tail else 0
        if not since_arg and not tail_arg:
            tail_arg = 2000
        # 分服务采集，避免合并输出难以归因
        for svc in args.services:
            one = _run_compose_logs(args.compose_file, [svc], since_arg, tail_arg)
            one.name = svc
            chunks.append(one)
        source = f"docker compose -f {args.compose_file} logs"

    if not chunks:
        chunks = [LogChunk("empty", err="no log sources")]

    text = build_markdown(chunks, since=args.since, source=source)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
