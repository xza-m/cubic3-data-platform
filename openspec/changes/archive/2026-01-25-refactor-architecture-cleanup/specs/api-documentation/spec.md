## ADDED Requirements

### Requirement: OpenAPI 3.0 规范自动生成
系统 SHALL 使用 Flask-OpenAPI3 自动生成 OpenAPI 3.0 规范，提供标准化的 API 文档。

#### Scenario: OpenAPI 规范访问
- **WHEN** 访问 `/openapi.json`
- **THEN** 返回完整的 OpenAPI 3.0 规范（JSON 格式）
- **AND** 包含所有已注册的 API 端点
- **AND** 包含请求/响应 Schema 定义

#### Scenario: Swagger UI 访问
- **WHEN** 访问 `/docs`
- **THEN** 显示 Swagger UI 交互式文档界面
- **AND** 可以直接在浏览器中测试 API 端点
- **AND** 自动填充请求参数和 Body

#### Scenario: ReDoc 访问
- **WHEN** 访问 `/redoc`
- **THEN** 显示 ReDoc 文档界面
- **AND** 提供更友好的阅读体验
- **AND** 支持搜索和导航

### Requirement: API 端点装饰器
系统 SHALL 为所有 API 端点添加 OpenAPI 装饰器，定义请求/响应 Schema 和文档说明。

#### Scenario: API 端点文档化
- **WHEN** 定义 API 端点
- **THEN** 使用 `@bp.post()` 或 `@bp.get()` 装饰器
- **AND** 指定 `responses` 参数定义响应 Schema
- **AND** 指定 `summary` 和 `description` 参数添加文档说明
- **EXAMPLE**:
  ```python
  @bp.post('/datasets',
      responses={200: DatasetResponse, 400: ErrorResponse},
      summary="创建数据集",
      description="注册新的数据集到系统，支持物理表、SQL 虚拟表和 CSV 文件三种类型")
  def create_dataset(body: CreateDatasetRequest):
      pass
  ```

### Requirement: Pydantic Schema 复用
系统 SHALL 复用 `app/application/*/schemas/` 中已定义的 Pydantic 模型作为 OpenAPI Schema。

#### Scenario: Schema 复用
- **WHEN** 定义 API 端点
- **THEN** 使用已存在的 Pydantic 模型（如 `CreateDatasetRequest`, `DatasetResponse`）
- **AND** 不需要重复定义 Schema
- **AND** Schema 自动包含字段类型、验证规则和示例值

#### Scenario: Schema 文档生成
- **WHEN** Pydantic 模型包含 `Field()` 定义
- **THEN** OpenAPI Schema 自动包含字段描述、默认值、验证规则
- **EXAMPLE**:
  ```python
  class CreateDatasetRequest(BaseModel):
      dataset_code: str = Field(..., description="数据集唯一标识", example="user_behavior")
      dataset_name: str = Field(..., description="数据集显示名称", example="用户行为数据集")
      source_id: int = Field(..., description="数据源 ID", gt=0)
  ```

### Requirement: 认证配置
系统 SHALL 在 OpenAPI 规范中定义认证方式（JWT Bearer Token），便于客户端集成。

#### Scenario: 认证配置定义
- **WHEN** 生成 OpenAPI 规范
- **THEN** 包含 `securitySchemes` 定义
- **EXAMPLE**:
  ```json
  {
    "components": {
      "securitySchemes": {
        "BearerAuth": {
          "type": "http",
          "scheme": "bearer",
          "bearerFormat": "JWT"
        }
      }
    }
  }
  ```

#### Scenario: 端点认证标记
- **WHEN** API 端点使用 `@require_auth` 装饰器
- **THEN** OpenAPI 规范自动标记该端点需要认证
- **AND** Swagger UI 提供认证输入框

### Requirement: 错误响应标准化
系统 SHALL 定义标准化的错误响应 Schema，所有 API 端点使用统一的错误格式。

#### Scenario: 错误响应 Schema
- **WHEN** API 返回错误
- **THEN** 使用 `ErrorResponse` Schema
- **AND** 包含 `code`, `message`, `error_code`, `details` 字段
- **EXAMPLE**:
  ```json
  {
    "code": -1,
    "message": "Dataset not found",
    "error_code": "ENTITY_NOT_FOUND",
    "details": {"dataset_id": 123}
  }
  ```
