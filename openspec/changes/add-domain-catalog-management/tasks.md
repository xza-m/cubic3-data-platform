## 1. Backend Model
- [x] 1.1 新增 `CatalogDefinition` 实体与 YAML catalog 仓储
- [x] 1.2 让 domain 改为引用真实 catalog，而不是把 catalog 名称作为事实源保存
- [x] 1.3 初始化真实默认 catalog，并为历史 domain 做兼容迁移

## 2. API
- [x] 2.1 新增 catalog 列表、创建、更新接口
- [x] 2.2 提供 catalog 归档/删除约束，明确有 domain 时的行为
- [x] 2.3 保持现有 `/domains` 和 `/catalogs` 返回兼容，避免前端断链

## 3. Frontend Directory
- [x] 3.1 在领域目录页补 catalog 级管理入口
- [x] 3.2 将 domain 详情中的 catalog 编辑改为选择真实 catalog
- [x] 3.3 保持左侧 catalog / domain 两层结构，不引入多级树

## 4. Modeling Entry
- [x] 4.1 在新建领域入口增加 catalog 选择
- [x] 4.2 允许在建模入口内联创建 catalog 或跳转回目录创建

## 5. Verification
- [x] 5.1 补 catalog 仓储和服务层单测
- [x] 5.2 补 catalog API 集成测试
- [x] 5.3 补目录页和建模入口的前端验收用例
