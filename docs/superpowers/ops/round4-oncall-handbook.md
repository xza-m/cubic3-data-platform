<!-- docs/superpowers/ops/round4-oncall-handbook.md -->

# Round 4 · OnCall 操作手册（钉群 / 收藏）

> 目标：30s 内区分 **backend 未起 / migration 未跑 / nginx 错 / 纯前端**，并留下可审计记录。  
> 配套：Sprint 0 脚本 T-002 ~ T-004c。

## 1. 快速探测

| 步骤 | 命令 | 期望 |
| --- | --- | --- |
| 全量 | `BASE_URL=http://localhost:81 ./scripts/cutover/health_probe.sh` | 退出码 0 |
| 仅 API | `ONLY_API=1 ./scripts/cutover/health_probe.sh` | 同上 |
| 日志摘要 | `python3 scripts/cutover/digest_oncall.py -o /tmp/digest.md` | 生成 Markdown（需本机 `docker compose`） |

## 2. 典型 502 / 空白页

1. **API 段红、SPA 绿** → 查 `backend` 容器、`flask db current`、migration（T-002）。
2. **全红** → 查 `nginx` 与入口 `81` 是否起来；`docker compose ps`。
3. **仅 metrics 401** → 正常（未登录）；若 502 才异常。

## 3. Incident

```bash
python3 scripts/cutover/incident_init.py "简述现象"
# 输出路径在 docs/superpowers/ops/incidents/ 下；飞书群请人工创建后把链接写进文档
```

## 4. 发布与回滚

- **切版**：`./scripts/cutover/deploy.sh`（含 migrate、health_probe）。
- **rollback.sh**：已标 **DEPRECATED（D+14）** — 生产优先热修；脚本仅演练/灾备，需 TL 批准。

## 5. 告警复位（A1 / A4）

封盘报告 W6.B 中若在 D+7~D+14 **临时收紧**了阈值，请在观测平台按基线恢复；本仓库不存云厂商凭据，仅作流程提醒。

---

*Round 4 Sprint 0 · 与 `2026-04-21-round4-cleanup-and-i18n.md` 同步*
