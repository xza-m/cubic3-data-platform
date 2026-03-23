## ADDED Requirements

### Requirement: 架构统一 - 单一实体定义
系统 SHALL 使用 `app/domain/entities/` 中的实体定义作为唯一真实来源，不得在 `app/models.py` 中重复定义已迁移的实体。

#### Scenario: 实体定义唯一性
- **WHEN** 开发者需要使用 Dataset 实体
- **THEN** 必须从 `app.domain.entities.dataset` 导入
- **AND** 不得从 `app.models` 导入（已删除）

#### Scenario: 导入错误检测
- **WHEN** 旧代码尝试 `from app.models import Dataset`
- **THEN** Python 抛出 `ImportError: cannot import name 'Dataset'`
- **AND** 开发者必须更新导入语句为 `from app.domain.entities.dataset import Dataset`

### Requirement: 批量迁移工具
系统 SHALL 提供批量迁移脚本，自动替换所有旧模型导入语句。

#### Scenario: 迁移脚本执行
- **WHEN** 运行 `scripts/migrate_imports.sh --dry-run`
- **THEN** 生成 diff 预览文件
- **AND** 列出所有待修改的文件和行号
- **AND** 不实际修改文件

#### Scenario: 实际迁移执行
- **WHEN** 运行 `scripts/migrate_imports.sh --execute`
- **THEN** 批量替换所有导入语句
- **EXAMPLE**: `from app.models import Dataset` → `from app.domain.entities.dataset import Dataset`
- **AND** 生成迁移报告（成功/失败文件列表）

### Requirement: 已迁移实体清单
系统 SHALL 维护已迁移至 DDD 架构的实体清单（16 个）：
- DataSource (数据源) → `app.domain.entities.data_source`
- Dataset (数据集) → `app.domain.entities.dataset`
- DatasetField (数据集字段) → `app.domain.entities.dataset_field`
- ExtractionTask (提取任务) → `app.domain.entities.extraction_task`
- ExtractionRun (提取执行记录) → `app.domain.entities.extraction_run`
- Conversation (对话) → `app.domain.entities.conversation`
- Message (消息) → `app.domain.entities.conversation`
- Query (查询) → `app.domain.entities.query`
- QueryFolder (查询文件夹) → `app.domain.entities.query_folder`
- QueryHistory (查询历史) → `app.domain.entities.query_history`
- QueryTemplate (查询模板) → `app.domain.entities.query_template`
- AppDefinition (应用定义) → `app.domain.entities.app_definition`
- AppInstance (应用实例) → `app.domain.entities.app_instance`
- AppExecution (应用执行) → `app.domain.entities.app_execution`
- Channel (渠道) → `app.domain.entities.config.channel`
- Subscription (订阅) → `app.domain.entities.config.subscription`

#### Scenario: 实体迁移验证
- **WHEN** 执行迁移验证脚本
- **THEN** 所有已迁移实体在 `app/domain/entities/` 中存在
- **AND** 所有已迁移实体在 `app/models.py` 中已完全删除
- **AND** 所有引用已更新到新路径

### Requirement: 未迁移实体保留
系统 SHALL 保留以下未迁移实体在 `app/models.py` 中，直到完成迁移：
- TaskConfig (定时任务配置)
- TaskRunLog (任务运行日志)
- FeishuChatRef (飞书群聊引用)
- DatasetRegistry (数据集注册表 - 旧架构)
- FieldMetadata (字段元数据 - 旧架构)
- MetadataSyncLog (元数据同步日志)
- DatasetApproval (数据集审批记录)
- ExtractionTemplate (提取模板)
- DataSourceTableCache (数据源表缓存)

#### Scenario: 未迁移实体使用
- **WHEN** 开发者需要使用 TaskConfig
- **THEN** 从 `app.models` 导入
- **AND** 不会触发 DeprecationWarning

## REMOVED Requirements

### Requirement: 重复实体定义
**Reason**: 违反 DRY 原则，导致维护困难

**Migration**: 所有引用已通过批量迁移脚本自动更新到新路径
