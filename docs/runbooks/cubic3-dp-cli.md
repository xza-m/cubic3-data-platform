---
doc_type: runbook
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-06-16
---

# cubic3-dp CLI 使用手册

`cubic3-dp` 是 CUBIC3 Data Platform 的外部命令行入口。它不是 `cubic3` 产品系列总入口，也不覆盖 BI、Data Agent 等其他产品线。

CLI 只封装 OpenAPI stable public contract 中适合外部自动化的能力：

- Agent 自描述：`describe`
- 认证：`auth login/refresh/whoami/status/logout/import-pair/feishu/api-key set`
- 数据源发现：`datasource list`
- 数据资产底座：`semantic assets radar/list/fields/evidence/sync-runs/sync`
- 语义运行时：`semantic health`
- Agent-first 问数：`semantic plan` / `semantic execute`
- 治理审计：`governance audit list/get`

## 1. 安装

本仓内开发安装：

```bash
python -m pip install -e cli
```

构建 wheel：

```bash
make build-cli
```

默认产物目录是 `dist/cli`，也可以显式指定：

```bash
CLI_DIST_DIR=/tmp/cubic3-dp-cli-dist make build-cli
```

验证命令：

```bash
cubic3-dp --help
make test-cli
make verify-cli
```

CLI 使用 Typer 构建命令树。根级选项（如 `--base-url`、`--access-token`、`--refresh-token`、`--api-key`、`--output`）建议放在产品命令前。

CLI 不需要完整 DDD 结构。它定位为后端 OpenAPI 的外部接口适配器，应保持“轻量分层”：

- `app.py`：组合根，组装 Typer 命令树和运行时上下文
- `commands/`：命令层，处理参数、确认门禁和调用编排
- `client.py`：HTTP 适配器，封装认证头、URL、错误转换和响应解包
- `output.py`：输出适配器，封装 JSON / table 展示
- `runtime.py`：CLI 运行时上下文、JSON payload 读取和危险动作确认
- `main.py`：进程入口，负责错误到退出码的转换

完整领域行为仍属于后端 `domain/application` 层，CLI 不复制业务规则，只表达稳定外部操作路径。

## 2. Agent-First 约定

CLI 面向人和 Agent 共用。Agent 调用时优先使用 JSON 输出，并先读取自描述信息：

```bash
cubic3-dp describe
cubic3-dp describe --command semantic.execute
```

自描述信息包含：

- 命令 ID 与命令行写法
- 对应后端 endpoint
- 是否需要认证
- 是否会写入状态
- 是否必须显式确认（例如 `--yes`）
- 认证解析顺序和 profile 配置位置

稳定约定：

- 根级参数必须放在子命令前：`cubic3-dp --base-url ... semantic health`
- 默认输出是 JSON；表格只用于人工查看：`--output table`
- 写入类命令必须显式确认或通过认证命令表达意图
- Agent 自动化建议设置 `CUBIC3_DP_CONFIG` 指向临时 profile 文件，避免污染人工本地凭据
- 认证解析顺序是：显式参数 > 环境变量 > profile 配置 > 默认值

这套约束符合：

- KISS：自描述 JSON 足够表达命令面，不引入独立 SDK 描述协议
- YAGNI：先覆盖当前 CLI 能力，不提前生成完整 OpenAPI 客户端
- SOLID：命令执行与命令描述分离，描述层不调用业务接口
- DRY：Agent、文档和测试共享同一套命令 ID 与命令面

## 3. 认证与连接

CLI 默认连接本地后端：

```bash
export CUBIC3_DP_BASE_URL=http://localhost:5000
export CUBIC3_DP_ACCESS_TOKEN=<access-token>
export CUBIC3_DP_REFRESH_TOKEN=<refresh-token>
```

Agent preview 场景也可以使用平台 API Key：

```bash
export CUBIC3_DP_API_KEY=<platform-api-key>
```

也可以在命令行直接传：

```bash
cubic3-dp --base-url http://localhost:5000 --access-token "$CUBIC3_DP_ACCESS_TOKEN" --refresh-token "$CUBIC3_DP_REFRESH_TOKEN" semantic health
```

登录后，CLI 会把凭据保存到本地 profile。默认路径为：

```text
~/.config/cubic3-dp/config.json
```

可用环境变量或根级参数覆盖：

```bash
export CUBIC3_DP_CONFIG=/tmp/cubic3-dp-agent-config.json
cubic3-dp --config /tmp/cubic3-dp-agent-config.json auth status
```

### 3.1 用户名 / 邮箱密码登录

当前后端登录接口是 `/api/v1/auth/login`，字段名仍是 `username`。CLI 的 `--email` 会作为 `username` 提交，适配后续邮箱账号形态：

```bash
cubic3-dp auth login --email admin@example.com --password-env CUBIC3_DP_PASSWORD
cubic3-dp auth whoami
```

非交互自动化建议使用：

```bash
printf '%s' "$CUBIC3_DP_PASSWORD" | cubic3-dp auth login --email admin@example.com --password-stdin
```

如不希望保存 Token Pair，可使用：

```bash
cubic3-dp auth login --email admin@example.com --password-env CUBIC3_DP_PASSWORD --no-save --show-tokens
```

CLI 默认保存 `access_token` 与 `refresh_token`。当业务请求收到 401 且本地存在 `refresh_token` 时，CLI 会自动调用 `/api/v1/auth/refresh` 轮换 Token Pair、回写 profile，并重试原请求一次。

### 3.2 飞书 SSO

飞书 SSO 是浏览器 OAuth 跳转流。CLI 采用 Agent 友好的两步协议：

```bash
cubic3-dp auth feishu
```

输出的 `authorization_url` 是平台授权入口，而不是飞书二跳地址。打开该 URL 后，浏览器会先访问平台 `/api/v1/auth/feishu/authorize?client=cli` 写入 OAuth state cookie，再跳转到飞书授权页。最终登录页会展示 `cli_code`，然后执行：

```bash
cubic3-dp auth feishu --exchange-code '<cli_code>'
```

人工使用时也可直接打开浏览器：

```bash
cubic3-dp auth feishu --open-browser
```

### 3.3 导入已有 Token Pair 或 API Key

导入 Token Pair：

```bash
cubic3-dp auth import-pair --access-token "$CUBIC3_DP_ACCESS_TOKEN" --refresh-token "$CUBIC3_DP_REFRESH_TOKEN"
```

保存平台 API Key：

```bash
cubic3-dp auth api-key set --api-key "$CUBIC3_DP_API_KEY"
```

查看当前认证解析状态：

```bash
cubic3-dp auth status
```

退出当前 profile：

```bash
cubic3-dp auth logout
```

## 4. 常用命令

数据源：

```bash
cubic3-dp --output table datasource list
```

语义 Runtime：

```bash
cubic3-dp semantic health
cubic3-dp semantic plan "最近7天评论数按学校汇总"
```

真实执行会提交受治理查询到 `dw-query-gateway`，必须显式确认：

```bash
cubic3-dp semantic execute "最近7天评论数按学校汇总" --yes
```

数据资产：

```bash
cubic3-dp semantic assets radar
cubic3-dp --output table semantic assets list --keyword comment
cubic3-dp semantic assets fields tbl_comment
cubic3-dp semantic assets evidence tbl_comment
cubic3-dp semantic assets sync-runs
```

写入数据资产底座的同步命令必须显式确认：

```bash
cubic3-dp semantic assets sync ./metadata-payload.json --yes
```

治理审计：

```bash
cubic3-dp governance audit list --decision allow
cubic3-dp governance audit get <trace_id>
```

## 5. 契约来源

CLI 只依赖 `/api/docs/openapi.json` 中进入 stable public contract 的接口。新增 CLI 命令前应先补 OpenAPI 显式 metadata，并通过：

```bash
make typecheck-contracts
make test-cli
make build-cli
```

这套约束符合：

- KISS：CLI 只封装高频外部路径，不映射全量后端路由
- YAGNI：不提前承诺建模 Copilot 和发布后台接口为外部 CLI 能力
- SOLID：命令层、HTTP 适配器、输出适配器和进程入口职责分离；后端服务保持业务职责
- DRY：CLI 复用 stable OpenAPI 与共享 client/output/runtime，不维护第二套接口事实和展示逻辑
