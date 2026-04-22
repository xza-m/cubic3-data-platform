<!-- docs/superpowers/ops/round4-d14-closure-2026-04-22.md -->

# D+14 · 回滚窗口关闭 · Round 4 工程侧记录

**日期**：2026-04-22  
**状态**：已执行（工程记录；飞书/站内信「宣告无回滚预案」由产品/运维自行补发）

## 1. 宣告范围

- Round 3 **日切 cutover** 后的 **14 天「可整包回滚」窗口** — 在工程上视为结束。
- 之后生产事件：优先 **热修 + forward fix**；数据库变更走 **受控 migration** 与 DBA/维护窗（见 `deploy.sh --skip-migrate`）。

## 2. 脚本

- `scripts/cutover/rollback.sh` 已加文件头 **DEPRECATED**：保留用于演练或极端灾备，**不**作为日常路径；需 TL/值班负责人书面批准后再用。

## 3. 告警（A1 / A4）

若 W6.B 在稳定期对告警阈值做了**临时收紧**，请在各观测/告警平台按 **W6 基线**恢复；本仓库不承载具体阈值，以免与线上漂移。

## 4. OnCall 节奏

- 值班交接恢复为「常规周」；钉群文档：`round4-oncall-handbook.md`。

## 5. 引用

- 封盘报告 §7.1：`round3-cutover-final-report.md`
