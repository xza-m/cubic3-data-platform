## 1. Implementation

- [x] 1.1 在 `MeasureDef` 中增加 `description` 与 `certified` 字段，保持向后兼容
- [x] 1.2 调整 `describe_cube` 输出，返回指标说明与认证状态
- [x] 1.3 更新前端语义 API 类型定义，补齐指标说明字段
- [x] 1.4 更新 `/semantic` 详情页展示指标说明与认证状态

## 2. Tests

- [x] 2.1 为 `MeasureDef` 新字段增加单测，验证缺省值与兼容旧 YAML
- [x] 2.2 为 `describe_cube` 增加单测，验证指标说明字段透出
- [x] 2.3 如前端涉及类型变更，确保 `tsc` 与构建通过

## 3. Validation

- [x] 3.1 验证旧 YAML 不需要补字段也可正常加载
- [x] 3.2 验证 `describe_cube` 能返回 `description` 与 `certified`
- [x] 3.3 验证前端能展示无描述和有描述两种情况
- [x] 3.4 运行 `openspec validate add-measure-descriptions --strict`
