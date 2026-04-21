<!-- docs/adr/002-frontend-error-reporting.md -->

# ADR-002: 前端错误上报方案

- **状态**：proposed
- **决策日期**：TBD（W4 完成）
- **决策人**：FE Lead + Tech Lead
- **关联 plan**：[03 §5.1](../superpowers/plans/2026-04-20-platform-redesign/03-cross-cutting-concerns.md)

## 背景

切换后需要监测线上前端错误率与堆栈，作为切换稳定期出口判定（错误率 < 0.5%）。

## 选项

  | 选项 | 优 | 劣 |
  | --- | --- | --- |
  | Sentry SaaS | 现成，快速接入 | 数据出境 / 成本 |
  | Sentry self-hosted | 数据自留 | 运维成本高 |
  | 自建上报 endpoint + ELK | 完全自主，与现有 logging 统一 | 缺 source map 解析、聚合分析需自建 |

## 决策

待评估。

## 影响

- 代码：`frontend/src/v2/lib/telemetry.ts`
- 运维：是否引入 Sentry agent / ELK
- 后续：性能埋点（Web Vitals）是否走同一通道

## 参考资料

- [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/)
