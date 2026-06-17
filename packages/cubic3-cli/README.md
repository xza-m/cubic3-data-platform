# @cubic3/dp-cli

CUBIC3 Data Platform 的命令行工具包，对齐 BI CLI 的发布格式：

- npm 包名：`@cubic3/dp-cli`
- 命令名：`cubic3-dp`
- 私仓：`https://verdaccio.xiaoluxue.cn/`

## 安装

```bash
npm install -g @cubic3/dp-cli --registry https://verdaccio.xiaoluxue.cn/
cubic3-dp --help
```

仓库内本地调试：

```bash
cd packages/cubic3-cli
npm install
npm link
cubic3-dp describe
```

## 运行时

这个 npm 包是轻量包装层：安装时会把仓库内 Python Typer CLI 安装到包内 `.venv`，命令 `cubic3-dp` 再委托到该 Python CLI。这样可以复用当前已经验证的 CLI 能力，避免维护 Node 与 Python 两套业务命令。

安装机器需要：

- Node.js `>=18.17`
- Python `>=3.11`
- 可访问 Python 依赖源以安装 `requests`、`typer`

如需指定 Python 解释器：

```bash
CUBIC3_DP_PYTHON=/path/to/python npm install -g @cubic3/dp-cli --registry https://verdaccio.xiaoluxue.cn/
```

## Agent 自举

```bash
cubic3-dp describe
cubic3-dp auth status
cubic3-dp auth login --email admin@example.com --password-env CUBIC3_DP_PASSWORD
cubic3-dp semantic health
```

默认输出是 JSON，适合 Agent 直接解析。认证解析顺序、profile 配置和 Token Pair 规则见项目文档 `docs/runbooks/cubic3-dp-cli.md`。
