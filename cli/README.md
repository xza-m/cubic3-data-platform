# cubic3-dp CLI

`cubic3-dp` 是 CUBIC3 Data Platform 的命令行入口，用于把 stable OpenAPI 中适合外部自动化的能力暴露给脚本、CI 和运维流程。

## 安装

开发安装：

```bash
python -m pip install -e cli
```

构建 wheel：

```bash
make build-cli
```

默认产物目录为 `dist/cli`，可通过 `CLI_DIST_DIR=/tmp/cubic3-dp-cli-dist make build-cli` 覆盖。

## 架构边界

CLI 不承载完整领域模型，也不复制后端业务规则。它采用轻量分层：

- `app.py`：Typer 组合根，统一注入运行时上下文。
- `commands/`：命令层，只负责参数、确认门禁和调用编排。
- `client.py`：HTTP 适配器，负责认证头、URL 拼接、错误转换和响应解包。
- `output.py`：输出适配器，负责 JSON / table 展示。
- `runtime.py`：CLI 运行时上下文、payload 读取和危险动作确认等共享能力。
- `main.py`：进程入口，负责将可展示错误转换为退出码。

这保持了 KISS 和 YAGNI：CLI 作为外部接口适配器，而不是后端领域层的第二份实现。

## Agent-First

CLI 提供机器可读自描述入口：

```bash
cubic3-dp describe
cubic3-dp describe --command auth.login
```

Agent 自动化建议：

- 使用默认 JSON 输出。
- 写入类命令按提示显式传 `--yes` 或认证命令。
- 通过 `CUBIC3_DP_CONFIG` 指向临时配置文件。
- 用 `auth status` 检查当前认证来源，用 `auth whoami` 验证后端身份。

## 认证

邮箱 / 用户名登录：

```bash
cubic3-dp auth login --email admin@example.com --password-env CUBIC3_DP_PASSWORD
```

飞书 SSO：

```bash
cubic3-dp auth feishu
cubic3-dp auth feishu --exchange-code '<cli_code>'
```

主动刷新 Token Pair：

```bash
cubic3-dp auth refresh
```

API Key：

```bash
cubic3-dp auth api-key set --api-key "$CUBIC3_DP_API_KEY"
```

## 验证

```bash
make test-cli
make verify-cli
PYTHONPATH=cli python -m cubic3_dp_cli.main --help
```
