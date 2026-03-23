## MODIFIED Requirements

### Requirement: 配置验证 - Pydantic BaseSettings
系统 SHALL 使用 Pydantic `BaseSettings` 验证所有配置项的类型和格式，启动时自动检测配置错误并提供明确的错误提示。

#### Scenario: 配置模型定义
- **WHEN** 定义配置类
- **THEN** 继承 `pydantic.BaseSettings`
- **AND** 使用类型标注（`str`, `int`, `bool` 等）
- **AND** 使用 `Field()` 定义默认值和验证规则
- **EXAMPLE**:
  ```python
  class LLMConfig(BaseSettings):
      api_key: str = Field(..., min_length=10)
      api_base: str = Field(default="https://api.openai.com/v1")
      model: str = Field(default="gpt-4o-mini")
      timeout: int = Field(default=60, ge=10, le=300)
  ```

#### Scenario: 配置验证成功
- **WHEN** 所有必需配置项已设置且格式正确
- **THEN** 应用正常启动
- **AND** 配置对象可通过 `app.config` 访问

#### Scenario: 配置验证失败 - 缺失必需项
- **WHEN** 环境变量 `JWT_SECRET` 未设置
- **THEN** 应用启动失败
- **AND** 输出错误信息 `Configuration validation failed: field required (type=value_error.missing)`
- **AND** 明确指出缺失的配置项 `JWT_SECRET`

#### Scenario: 配置验证失败 - 格式错误
- **WHEN** 环境变量 `JWT_SECRET=weak`（长度小于 32）
- **THEN** 应用启动失败
- **AND** 输出错误信息 `ensure this value has at least 32 characters`

### Requirement: 嵌套配置支持
系统 SHALL 支持嵌套配置结构，使用 `__` 分隔符从环境变量加载嵌套配置。

#### Scenario: 嵌套配置加载
- **WHEN** 环境变量 `LLM__API_KEY=sk-abc123`
- **THEN** 解析为 `config.llm.api_key = "sk-abc123"`
- **WHEN** 环境变量 `LLM__MODEL=gpt-4`
- **THEN** 解析为 `config.llm.model = "gpt-4"`

### Requirement: 自定义验证器
系统 SHALL 支持自定义验证器检查配置值的业务规则（如密钥不能包含示例值）。

#### Scenario: 密钥示例值检测
- **WHEN** 环境变量 `JWT_SECRET=your-secret-key-change-in-production`
- **THEN** 应用启动失败
- **AND** 输出错误信息 `JWT secret must not contain example values`

#### Scenario: 生产环境强制验证
- **WHEN** 环境变量 `FLASK_ENV=production`
- **AND** 任何密钥配置包含 `example`, `change-in-production`, `your-` 等关键字
- **THEN** 应用启动失败
- **AND** 强制要求配置真实的密钥值

### Requirement: 依赖注入容器初始化
系统 SHALL 在 `init_container()` 函数中使用验证后的配置对象初始化 DI 容器。

#### Scenario: 容器初始化成功
- **WHEN** 调用 `init_container(app)`
- **THEN** 首先验证配置（`AppConfig.from_flask_config(app.config)`）
- **AND** 使用验证后的配置初始化所有 Providers
- **AND** 返回配置完成的 `Container` 实例

#### Scenario: 容器初始化失败
- **WHEN** 配置验证失败
- **THEN** 抛出 `ValueError` 异常
- **AND** 异常消息包含详细的配置错误信息
- **AND** 应用停止启动

## ADDED Requirements

### Requirement: 配置类型定义
系统 SHALL 提供以下配置类型定义：
- `AppConfig`: 应用主配置
- `DatabaseConfig`: 数据库配置
- `RedisConfig`: Redis 配置
- `LLMConfig`: LLM 服务配置
- `FeishuConfig`: 飞书集成配置
- `OSSConfig`: 阿里云 OSS 配置

#### Scenario: 配置类型使用
- **WHEN** 访问配置项
- **THEN** 使用类型化的配置对象
- **EXAMPLE**: `config.llm.api_key` (类型为 `str`)
- **AND** IDE 提供自动完成和类型检查
