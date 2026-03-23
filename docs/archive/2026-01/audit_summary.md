# 架构迁移审计报告 (Phase 1)

## 已迁移实体清单（16个）✅
以下实体已从 `app/models.py` 迁移至 `app/domain/entities/`：

1. ✅ DataSource - app/domain/entities/datasource.py
2. ✅ Dataset - app/domain/entities/dataset.py
3. ✅ DatasetField - app/domain/entities/dataset.py
4. ✅ ExtractionTask - app/domain/entities/extraction_task.py
5. ✅ ExtractionRun - app/domain/entities/extraction_run.py
6. ✅ Conversation - app/domain/entities/conversation.py
7. ✅ Message - app/domain/entities/message.py
8. ✅ Query - app/domain/entities/query.py
9. ✅ QueryFolder - app/domain/entities/query.py
10. ✅ QueryHistory - app/domain/entities/query.py
11. ✅ QueryTemplate - app/domain/entities/query.py
12. ✅ AppDefinition - app/domain/entities/app.py
13. ✅ AppInstance - app/domain/entities/app.py
14. ✅ AppExecution - app/domain/entities/app.py
15. ✅ Channel - app/domain/entities/channel.py
16. ✅ Subscription - app/domain/entities/subscription.py

## 未迁移实体清单（9个）
以下实体仍在 `app/models.py` 中，待未来迁移：

1. ⏳ TaskConfig - 定时任务配置
2. ⏳ TaskRunLog - 任务运行日志
3. ⏳ FeishuChatRef - 飞书群聊引用
4. ⏳ DatasetRegistry - 数据集注册表（旧架构）
5. ⏳ FieldMetadata - 字段元数据（旧架构）
6. ⏳ MetadataSyncLog - 元数据同步日志
7. ⏳ DatasetApproval - 数据集审批记录
8. ⏳ ExtractionTemplate - 提取模板（引用 Dataset）
9. ⏳ DataSourceTableCache - 数据源表缓存

## 旧模型引用扫描结果
✅ 无任何代码从 `app.models` 导入已迁移的 16 个实体
✅ 所有已迁移实体的定义已从 `app/models.py` 中移除
✅ `app/models.py` 中已添加注释说明迁移情况

## 跨架构依赖（技术债）
⚠️ ExtractionTemplate (app/models.py) 引用了 Dataset (app/domain/entities/)
- ForeignKey: datasets.id
- Relationship: Dataset.templates ↔ ExtractionTemplate.dataset
- 建议：未来将 ExtractionTemplate 也迁移至 DDD 架构

## 结论
✅ 第一阶段架构统一已完成：16个核心实体已全部迁移到 DDD 架构
✅ 无需修改任何导入语句（已全部更新）
✅ 可以继续执行第二阶段任务（日志统一、事件总线、配置验证等）
