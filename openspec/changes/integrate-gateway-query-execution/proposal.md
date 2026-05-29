# Gateway 查询边界收敛与本仓执行面下线

## 状态

`superseded`。原方案曾计划在 `cubic3-data-platform` 内建设统一查询执行面；经 ADR-011 确认，正式受治理数仓查询执行面归属 `dw-query-gateway`，本项目只保留控制面、治理编排、语义规划、可观测 BFF 与 DataSource Adapter SPI。

## 当前目标

- `/api/v1/agent/semantic/execute` 提交受治理查询到 `dw-query-gateway`。
- 查询工作台、SQL Lab、元数据探查和预览继续走 DataSource Adapter SPI。
- 本仓不再暴露内部查询执行 API，不再启动内部查询执行 worker，不再维护内部查询执行 job/result 表。
- Gateway 运行态基础监控由本仓治理页展示，原始运行事实仍由 `dw-query-gateway` 提供。

## 取舍

- KISS：正式查询只有一条执行链路。
- YAGNI：不保留本仓执行 fallback。
- SOLID：data-platform 负责控制面和治理上下文，gateway 负责执行面。
- DRY：治理上下文统一由 GatewayAccessContext 构造器生成。
