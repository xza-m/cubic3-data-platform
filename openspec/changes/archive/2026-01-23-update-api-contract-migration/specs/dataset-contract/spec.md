## ADDED Requirements

### Requirement: Dataset 字段完整性
系统 SHALL 在 Dataset 输出中提供统一字段集合：
`id, dataset_code, dataset_name, dataset_type, source_id, source_type, physical_table, sql_query, file_metadata, description, owner, sync_status, last_sync_at, sync_error, field_count, fields, created_at, updated_at`。

#### Scenario: 列表输出
- **WHEN** 客户端请求数据集列表
- **THEN** 每个 item 至少包含 `dataset_type`、`source_type` 与 `sync_status`

#### Scenario: 详情输出
- **WHEN** 客户端请求数据集详情（include_fields=true）
- **THEN** 返回 `fields` 与 `field_count`

### Requirement: DatasetField 字段一致性
系统 SHALL 在 Dataset 详情的 `fields` 中返回统一字段集合：
`physical_name, data_type, display_name, business_type, sensitivity_level, mask_rule, comment, field_order, is_sensitive, is_partition_key`。

#### Scenario: 字段列表输出
- **WHEN** 客户端请求数据集详情（include_fields=true）
- **THEN** 每个字段包含 `physical_name` 与 `data_type`

### Requirement: Dataset 创建规则
系统 SHALL 对不同 dataset_type 强制不同字段约束：
- `physical`: 必须包含 `source_id` 与 `physical_table`
- `virtual`: 必须包含 `source_id` 与 `sql_query`
- `file`: 必须包含 `file_metadata`

#### Scenario: 虚拟数据集
- **WHEN** 提交 `dataset_type=virtual` 且缺少 `sql_query`
- **THEN** 返回参数校验错误

### Requirement: Dataset 统计口径一致
系统 SHALL 输出与枚举一致的统计字段：
`total, active, syncing, synced, failed, pending`（允许部分为 0）。

#### Scenario: 统计接口
- **WHEN** 客户端请求数据集统计
- **THEN** 返回字段包含 `active/syncing/failed/pending/synced`

### Requirement: Dataset 枚举约束
系统 SHALL 保证以下枚举值一致：
- `dataset_type`: `physical | virtual | file`
- `sync_status`: `active | syncing | synced | failed | pending`

#### Scenario: 枚举合法性
- **WHEN** 客户端读取数据集列表
- **THEN** `dataset_type` 与 `sync_status` 均符合上述枚举
