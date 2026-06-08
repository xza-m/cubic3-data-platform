FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ARG CODEX_CLI_VERSION=rust-v0.133.0
RUN CODEX_CLI_VERSION="${CODEX_CLI_VERSION}" python - <<'PY'
import os
import platform

from openai_codex_sdk.install import install_codex

machine = platform.machine().lower()
if machine in {"aarch64", "arm64"}:
    arch = "aarch64"
elif machine in {"x86_64", "amd64"}:
    arch = "x86_64"
else:
    raise SystemExit(f"unsupported Codex CLI architecture: {machine}")

install_codex(
    version=os.environ["CODEX_CLI_VERSION"],
    filename=f"codex-{arch}-unknown-linux-musl.tar.gz",
)
PY

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
