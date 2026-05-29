# Design: Gateway 查询边界收敛

## 目标架构

```text
Query Workbench / SQL Lab / Preview
        |
        v
DataSource Adapter SPI

Agent semantic execute / 正式用户查询
        |
        v
PolicyDecision + GatewayAccessContext
        |
        v
dw-query-gateway
        |
        v
MaxCompute / result / audit / telemetry
```

## Data-platform 职责

- 解析 Principal、RoleBinding、DataPolicy 和语义规划。
- 生成 `GatewayAccessContext`。
- 代理 gateway telemetry summary / query runs 供治理页展示。
- 通过 DataSource Adapter SPI 支撑查询工作台、SQL Lab、schema/table/preview 能力。

## Gateway 职责

- 正式查询提交、排队、执行、取消、结果对象、审计和运行态 telemetry。
- SQL guard、CredentialBinding 和 MaxCompute 物理兜底。

## 下线项

- 本仓内部查询执行 API。
- 本仓内部查询执行 worker。
- 本仓内部查询执行 job/event/result 表。
- 面向内部执行面的 Makefile、OpenAPI 和测试入口。
