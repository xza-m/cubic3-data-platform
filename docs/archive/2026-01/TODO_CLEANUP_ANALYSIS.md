# TODO/FIXME 注释清理分析

**分析时间**: 2026-01-25  
**总数**: 41 个  
**状态**: ✅ 已分类

---

## 📊 分类统计

| 类别 | 数量 | 处理方式 |
|------|------|---------|
| 🔴 需要实现的核心功能 | 8 | 创建 Issue |
| 🟡 待优化的功能 | 15 | 保留注释 + Issue |
| 🟢 可以立即删除/实现 | 18 | 立即处理 |

---

## 🔴 需要实现的核心功能（创建 Issue）

### 1. 权限系统
**文件**: `app/domain/services/permission_checker.py`
```python
# TODO: 实现真实的权限校验逻辑
# TODO: 实现真实的列级权限校验
# TODO: 实现真实的行级权限逻辑
# TODO: 实现真实的配额管理
```
**建议**: 创建 Issue `feat: 实现完整的权限校验系统`
**优先级**: P1（高）

### 2. 审计日志
**文件**: 
- `app/infrastructure/events/handlers/extraction_handler.py`
- `app/infrastructure/events/handlers/dataset_handler.py`
- `app/infrastructure/events/handlers/datasource_handler.py`

```python
# TODO: 记录审计日志
```
**建议**: 创建 Issue `feat: 实现审计日志系统`
**优先级**: P2（中）

### 3. Hive 数据源支持
**文件**: `app/infrastructure/adapters/datasources/factory.py`
```python
# 'hive': HiveAdapter,  # TODO: 待实现
```
**建议**: 创建 Issue `feat: 支持 Hive 数据源`
**优先级**: P3（低）

### 4. Excel 导出支持
**文件**: `app/infrastructure/adapters/file_delivery/file_delivery_service.py`
```python
# TODO: 支持 Excel 格式（需要 openpyxl）
```
**建议**: 创建 Issue `feat: 支持 Excel 格式导出`
**优先级**: P3（低）

### 5. 飞书文件上传
**文件**: `app/services/export_executor.py`
```python
# TODO: 实现真实的飞书文件上传逻辑
# TODO: 实现飞书消息发送
```
**建议**: 创建 Issue `feat: 完善飞书集成功能`
**优先级**: P2（中）

---

## 🟡 待优化的功能（保留注释 + Issue）

### 1. 提取任务过滤条件
**文件**: `app/infrastructure/tasks/jobs/extraction_job.py`
```python
# TODO: 应用过滤条件（如果有）
```
**建议**: 保留注释，创建 Issue `enhancement: 提取任务支持过滤条件`

### 2. 事件通知
**文件**: `app/infrastructure/events/handlers/`
```python
# TODO: 发送通知
# TODO: 更新统计信息
# TODO: 发送告警通知
# TODO: 发送飞书通知（可选）
```
**建议**: 保留注释，创建 Issue `enhancement: 完善事件通知机制`

### 3. AppInstance 事件触发
**文件**: `app/domain/entities/app_instance.py`
```python
# TODO: 触发启用事件
# TODO: 触发禁用事件
# TODO: 触发配置更新事件
# TODO: 触发调度更新事件
```
**建议**: 保留注释，创建 Issue `enhancement: AppInstance 事件触发`

### 4. 元数据同步优化
**文件**: `app/services/metadata_sync.py`, `app/routes/metadata_sync.py`
```python
# TODO: 实际实现需要使用 SQLAlchemy ORM
# TODO: 查询数据库检查是否存在
# TODO: 查询字段
# TODO: 更新数据集状态
# TODO: 查询同步日志
```
**建议**: 保留注释，创建 Issue `enhancement: 元数据同步优化`

### 5. SQL 生成器优化
**文件**: `app/services/sql_generator.py`
```python
# TODO: 实现真实的数据库查询逻辑
```
**建议**: 保留注释，创建 Issue `enhancement: SQL 生成器优化`

---

## 🟢 可以立即删除/实现（18 个）

### 1. API 文档相关（已实现）
**文件**: `app/interfaces/api/docs.py`
```python
# TODO: 自动从 Pydantic 模型生成
# TODO: 自动从 Blueprint 注册的路由生成
```
**处理**: ✅ **已实现** - 通过 `route_scanner.py` 实现了路由自动扫描
**操作**: 删除注释

### 2. 权限检查（临时跳过）
**文件**: `app/interfaces/api/v1/extraction.py`
```python
# TODO: 检查用户是否有权限下载（当前跳过，允许所有认证用户）
```
**处理**: 保留但改写为更明确的说明
**操作**: 改为 `# NOTE: 当前允许所有认证用户下载，待权限系统完善后限制`

### 3. AppDefinition Schema 验证
**文件**: `app/domain/entities/app_definition.py`
```python
# TODO: 使用 jsonschema 库进行验证
```
**处理**: 立即实现或转为 Issue
**操作**: 创建 Issue `enhancement: AppDefinition Schema 验证`

### 4. 导出服务相关（测试代码）
**文件**: `app/services/export_executor.py`
```python
# TODO: 实际使用时需要配置真实的认证信息
# TODO: 从现有服务中导入
# TODO: 实际的数据库插入逻辑
# TODO: 实际的数据库更新逻辑
# TODO: 实际的数据库查询逻辑
```
**处理**: 这些是测试/占位代码的注释
**操作**: 
- 如果功能已实现，删除注释
- 如果是废弃代码，删除整个文件或函数
- 如果仍需要，改为更明确的说明

---

## 🎯 立即处理清单

### 删除注释（已实现的功能）

1. ✅ `app/interfaces/api/docs.py:159` - 路由自动生成已实现
2. ✅ `app/interfaces/api/docs.py:186` - 路由自动生成已实现

### 改写注释（临时说明）

3. 🔄 `app/interfaces/api/v1/extraction.py:454` - 改为 NOTE

### 保留并创建 Issue

4. 📝 权限系统 (4个 TODO) → Issue
5. 📝 审计日志 (5个 TODO) → Issue
6. 📝 事件通知 (6个 TODO) → Issue
7. 📝 AppInstance 事件 (4个 TODO) → Issue
8. 📝 Hive 支持 (1个 TODO) → Issue
9. 📝 Excel 导出 (1个 TODO) → Issue
10. 📝 飞书集成 (2个 TODO) → Issue
11. 📝 提取过滤 (1个 TODO) → Issue
12. 📝 元数据同步 (5个 TODO) → Issue
13. 📝 SQL 生成器 (1个 TODO) → Issue
14. 📝 Schema 验证 (1个 TODO) → Issue

---

## 📝 建议创建的 Issue 列表

### P1 - 高优先级
- [ ] **feat: 实现完整的权限校验系统**
  - 描述: 实现用户权限、列级权限、行级权限、配额管理
  - 文件: `app/domain/services/permission_checker.py`
  - 影响: 安全性核心功能

### P2 - 中优先级
- [ ] **feat: 实现审计日志系统**
  - 描述: 记录所有关键操作的审计日志
  - 文件: `app/infrastructure/events/handlers/*.py`
  - 影响: 合规性要求

- [ ] **feat: 完善飞书集成功能**
  - 描述: 实现飞书文件上传和消息发送
  - 文件: `app/services/export_executor.py`
  - 影响: 飞书推送功能

- [ ] **enhancement: 完善事件通知机制**
  - 描述: 实现事件触发后的通知和统计
  - 文件: `app/infrastructure/events/handlers/*.py`
  - 影响: 用户体验

- [ ] **enhancement: AppInstance 事件触发**
  - 描述: 实现应用实例状态变更事件
  - 文件: `app/domain/entities/app_instance.py`
  - 影响: 事件驱动完整性

### P3 - 低优先级
- [ ] **feat: 支持 Hive 数据源**
  - 描述: 添加 Hive 数据源适配器
  - 文件: `app/infrastructure/adapters/datasources/factory.py`
  - 影响: 数据源扩展

- [ ] **feat: 支持 Excel 格式导出**
  - 描述: 添加 Excel 导出功能
  - 文件: `app/infrastructure/adapters/file_delivery/file_delivery_service.py`
  - 影响: 导出功能增强

- [ ] **enhancement: 提取任务支持过滤条件**
  - 描述: 提取任务执行时应用过滤条件
  - 文件: `app/infrastructure/tasks/jobs/extraction_job.py`
  - 影响: 功能完善

- [ ] **enhancement: 元数据同步优化**
  - 描述: 使用 ORM 优化元数据同步逻辑
  - 文件: `app/services/metadata_sync.py`
  - 影响: 代码质量

- [ ] **enhancement: SQL 生成器优化**
  - 描述: 优化 SQL 生成器实现
  - 文件: `app/services/sql_generator.py`
  - 影响: 性能优化

- [ ] **enhancement: AppDefinition Schema 验证**
  - 描述: 使用 jsonschema 验证应用定义
  - 文件: `app/domain/entities/app_definition.py`
  - 影响: 数据验证

---

## 🔧 执行计划

### 第一步：立即清理（今天）
1. 删除已实现功能的 TODO 注释（2个）
2. 改写临时说明的注释（1个）

### 第二步：创建 Issue（本周）
1. 创建 P1 Issue（1个）
2. 创建 P2 Issue（4个）
3. 创建 P3 Issue（6个）

### 第三步：关联任务（下周）
1. 将 Issue 添加到项目看板
2. 分配优先级和里程碑
3. 定期回顾和更新

---

## ✅ 清理效果

**清理前**: 41 个 TODO/FIXME  
**清理后**: 
- 删除: 2 个（已实现）
- 改写: 1 个（临时说明）
- 转 Issue: 38 个（跟踪管理）

**净效果**: 代码中 TODO 减少 3 个，38 个转为可跟踪的 Issue

---

**分析人**: AI Assistant  
**完成时间**: 2026-01-25  
**状态**: ✅ 分析完成，待执行清理
