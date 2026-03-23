# 设计决策

## 1. 契约源
- 以服务端为唯一事实源，前端类型从接口输出映射
- 统一 `ApiResponse` 与分页结构，避免多套响应格式

## 2. API 前缀
- 明确 `/api/v1` 为唯一入口
- 旧 `/api/*` 直接下线并返回 410

## 3. Dataset 领域对象
- `Dataset.to_dict()` 为统一输出入口
- 列表与详情字段一致，字段裁剪仅由前端控制
- 字段子对象（DatasetField）作为 Dataset 契约的一部分统一定义

## 4. 枚举一致性
- 前端识别与后端枚举保持一致：
  - business_type: `partition_key | dimension | measure`
  - sync_status: `active | syncing | synced | failed | pending`

## 5. 联调策略
- 先修正服务端输出，再对齐前端读取
- 通过最小化临时兼容逻辑确保迁移彻底
