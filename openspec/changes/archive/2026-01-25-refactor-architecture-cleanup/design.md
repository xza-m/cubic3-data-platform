# 架构清理与技术债务重构 - 技术设计

## Context

项目当前处于 DDD 架构迁移的中间状态：
- 新架构（Hexagonal + DDD + CQRS）已部分实施
- 旧架构（传统 MVC）代码仍然存在
- 两套代码共存导致维护困难和新人困惑

根据 2026-01-25 代码审查报告，识别出 7 个关键技术债务问题，需要系统性解决。

## Goals / Non-Goals

### Goals
1. **彻底清理架构混乱**：移除所有重复定义，统一使用 DDD 实体
2. **统一日志系统**：所有模块使用相同的结构化日志工具
3. **提升类型安全**：事件总线和依赖注入使用类型化接口
4. **自动化文档**：使用 OpenAPI 自动生成 API 文档
5. **简化文档维护**：拆分冗长文档，移除过时内容
6. **优化前后端分离**：独立构建和部署流程

### Non-Goals
- **不改变** 业务逻辑和功能行为
- **不引入** 新的外部依赖（除 Pydantic BaseSettings）
- **不重构** 数据库 Schema
- **不修改** 前端代码逻辑（仅优化构建流程）

## Decisions

### Decision 1: 架构统一策略

**选择**：直接删除旧模型定义，批量迁移所有引用

**理由**：
- ✅ 彻底清理：一次性解决技术债务，无遗留问题
- ✅ 架构清晰：单一真实来源，无混淆
- ✅ 降低维护成本：无需维护兼容层代码

**替代方案**（已拒绝）：
- ❌ 创建兼容层：增加复杂度，技术债务延后而非解决
- ❌ 保持现状：技术债务持续累积

**实施策略**：
1. **审计阶段**：扫描所有 `from app.models import` 引用
   ```bash
   # 查找所有旧模型引用
   rg "from app\.models import (DataSource|Dataset|DatasetField|ExtractionTask|ExtractionRun|Conversation|Message|Query|QueryFolder|QueryHistory|QueryTemplate|AppDefinition|AppInstance|AppExecution|Channel|Subscription)" --type py
   ```

2. **批量替换**：使用脚本自动替换导入语句
   ```bash
   # 批量替换导入
   sed -i 's/from app\.models import Dataset/from app.domain.entities.dataset import Dataset/g' $(rg -l "from app\.models import Dataset" --type py)
   ```

3. **手工处理**：复杂情况（如同时导入多个模型）手工修改

4. **删除定义**：从 `app/models.py` 删除已迁移模型

5. **测试验证**：运行完整测试套件，确保无遗漏引用

### Decision 2: 日志系统设计

**选择**：创建统一的 `StructuredLogger` 类，支持 JSON 格式和请求上下文

**理由**：
- ✅ 结构化日志便于 ELK/Loki 聚合分析
- ✅ 请求上下文（user_id, trace_id）便于追踪问题
- ✅ 统一接口降低学习成本

**替代方案**：
- ❌ 使用 `structlog` 库：引入新依赖，学习成本高
- ❌ 保持现状：日志格式不一致，难以聚合分析

**实施**：
```python
# app/shared/utils/logger.py
class StructuredLogger:
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        # JSON formatter
    
    def _get_context(self):
        return {
            'user_id': getattr(g, 'user_id', None),
            'trace_id': getattr(g, 'trace_id', None),
            'request_id': getattr(g, 'request_id', None),
            'ip': request.remote_addr if request else None
        }
    
    def info(self, message: str, **kwargs):
        extra = {'context': json.dumps({**self._get_context(), **kwargs})}
        self.logger.info(message, extra=extra)
```

### Decision 3: 事件总线类型安全

**选择**：`EventBus.subscribe()` 接受 `Callable` 而非字符串路径

**理由**：
- ✅ IDE 自动完成和跳转支持
- ✅ 重构时自动更新所有引用
- ✅ 类型检查防止运行时错误

**替代方案**：
- ❌ 保持字符串路径：类型不安全，重构风险高
- ❌ 使用装饰器注册：增加复杂度，不够直观

**实施**：
```python
# app/infrastructure/events/event_bus.py
from typing import Callable, Type

class EventBus:
    def subscribe(self, event_type: Type[DomainEvent], handler: Callable[[DomainEvent], None]):
        """订阅事件（类型安全）"""
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        
        # 序列化处理器路径（用于 RQ 任务队列）
        handler_path = f"{handler.__module__}.{handler.__name__}"
        self._handlers[event_type].append(handler_path)

# 注册时
from app.infrastructure.events.handlers.datasource_handler import on_datasource_created

event_bus.subscribe(DataSourceCreated, on_datasource_created)
```

### Decision 4: 依赖注入配置验证

**选择**：使用 Pydantic `BaseSettings` 验证配置结构

**理由**：
- ✅ 类型安全：自动验证配置类型
- ✅ 环境变量支持：自动从 `.env` 加载
- ✅ 嵌套配置：支持 `LLM__API_KEY` 格式
- ✅ 自定义验证器：检查密钥格式

**替代方案**：
- ❌ 手工验证：代码冗长，容易遗漏
- ❌ 使用 `python-decouple`：功能有限，不支持嵌套配置

**实施**：
```python
# app/config.py
from pydantic import BaseSettings, Field, validator

class LLMConfig(BaseSettings):
    api_key: str = Field(..., min_length=10)
    api_base: str = Field(default="https://api.openai.com/v1")
    model: str = Field(default="gpt-4o-mini")
    timeout: int = Field(default=60, ge=10, le=300)
    
    @validator('api_key')
    def validate_api_key(cls, v):
        if v.startswith('sk-your-') or 'example' in v:
            raise ValueError("API key must be configured with a real value")
        return v

class AppConfig(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = Field(..., min_length=32)
    llm: LLMConfig
    
    class Config:
        env_nested_delimiter = '__'  # 支持 LLM__API_KEY
```

### Decision 5: API 文档生成

**选择**：启用 Flask-OpenAPI3 自动生成 OpenAPI 3.0 规范

**理由**：
- ✅ 已安装依赖：`flask-openapi3==3.1.0`
- ✅ 自动生成：减少手工维护
- ✅ 标准格式：OpenAPI 3.0 兼容各种工具
- ✅ 交互式文档：Swagger UI + ReDoc

**替代方案**：
- ❌ 手工编写 Markdown：维护成本高，容易过时
- ❌ 使用 `flasgger`：功能有限，不支持 Pydantic

**实施**：
```python
# app/__init__.py
from flask_openapi3 import OpenAPI

app = OpenAPI(__name__, info={
    'title': 'BI Webhook Gateway API',
    'version': '1.0.0',
    'description': '数仓 BI 集成平台 API'
})

# app/interfaces/api/v1/datasets.py
from pydantic import BaseModel

class CreateDatasetRequest(BaseModel):
    dataset_code: str
    dataset_name: str
    source_id: int

@bp.post('/datasets',
    responses={200: DatasetResponse},
    summary="创建数据集",
    description="注册新的数据集到系统")
def create_dataset(body: CreateDatasetRequest):
    pass
```

### Decision 6: 文档拆分策略

**选择**：将 `docs/readme.md` (3595 行) 拆分为 5 个独立文档

**理由**：
- ✅ 可维护性：每个文档聚焦单一主题
- ✅ 可发现性：按需查阅，不需要滚动长文档
- ✅ 同步性：减少过时内容

**拆分方案**：
```
docs/
├── README.md          # 项目概览 (<200 行)
├── ARCHITECTURE.md    # 架构设计 (DDD + Hexagonal + CQRS)
├── API.md             # API 文档 (链接到 /docs)
├── DEPLOYMENT.md      # 部署指南 (Docker + Kubernetes)
├── DEVELOPMENT.md     # 开发指南 (环境搭建 + 测试)
└── archive/
    └── readme-old.md  # 旧文档归档
```

### Decision 7: 前后端分离优化

**选择**：独立 Docker 镜像 + Nginx 反向代理

**理由**：
- ✅ 独立构建：前后端可以独立部署
- ✅ 缓存优化：静态资源使用 Nginx 缓存
- ✅ 版本控制：构建产物不提交到 Git

**实施**：
```yaml
# docker-compose.full.yml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    image: bi-gateway-frontend:latest
  
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    image: bi-gateway-backend:latest
  
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    ports:
      - "80:80"
```

## Risks / Trade-offs

### Risk 1: 大量文件修改
- **风险**：修改 50+ 文件，可能引入 Bug
- **缓解**：分阶段实施，每阶段充分测试
- **回滚**：保留 Git 历史，可快速回滚

### Risk 2: 批量迁移遗漏
- **风险**：脚本可能遗漏某些特殊引用方式（如动态导入、字符串引用）
- **缓解**：
  - 详细审计报告（列出所有待修改文件）
  - 手工 Review 批量替换结果
  - 运行完整测试套件捕获运行时错误
  - 使用 `mypy` 类型检查捕获导入错误
- **验证**：运行 `pytest` + `mypy` + 手工烟测

### Risk 3: 配置验证过严
- **风险**：生产环境启动失败
- **缓解**：开发环境宽松验证，生产环境严格验证
- **降级**：提供 `SKIP_CONFIG_VALIDATION` 环境变量

## Migration Plan

### Phase 1: 准备阶段（1 天）
1. 审计所有旧模型引用（生成待修改文件列表）
2. 实现统一日志工具 `app/shared/utils/logger.py`
3. 实现 Pydantic 配置模型
4. 准备批量替换脚本

### Phase 2: 批量迁移阶段（2-3 天）
1. 批量替换旧模型导入语句（使用脚本）
2. 手工处理复杂引用情况
3. 删除 `app/models.py` 中已迁移模型定义
4. 批量替换日志调用
5. 重构事件总线订阅代码
6. 添加 API 文档装饰器
7. 拆分文档文件
8. 优化前后端构建流程

### Phase 3: 验证和清理阶段（1-2 天）
1. 运行完整测试套件
2. 手工烟测核心功能
3. 清理 TODO/FIXME 注释
4. 归档旧文档
5. 更新 `openspec/project.md`

### Phase 4: 验证阶段（1 天）
1. 运行完整测试套件
2. 验证 API 文档生成
3. 验证日志输出格式
4. 验证配置验证生效
5. 部署到测试环境验证

### Rollback Plan
如果出现严重问题：
1. Git revert 到重构前的 commit
2. 恢复旧配置文件
3. 重新部署

## Open Questions

1. **是否需要迁移所有旧模型？**
   - 建议：仅迁移已在 `app/domain/entities/` 中定义的模型，保留 `TaskConfig`, `FeishuChatRef` 等未迁移模型，待后续统一处理
   
2. **批量替换脚本是否需要交互式确认？**
   - 建议：第一次运行时生成 diff 预览，Review 后再执行实际替换

2. **日志格式是否需要兼容旧系统？**
   - 建议：开发环境使用文本格式（便于阅读），生产环境使用 JSON 格式（便于聚合）

3. **API 文档是否需要版本控制？**
   - 建议：自动生成，不提交到 Git，通过 `/openapi.json` 动态访问

4. **前端构建产物是否需要 CDN？**
   - 建议：当前使用 Nginx 静态文件服务，后续可考虑 CDN（如阿里云 OSS + CDN）
