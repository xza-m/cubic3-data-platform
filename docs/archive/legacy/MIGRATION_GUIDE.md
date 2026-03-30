---
doc_type: historical-note
status: archived
source_of_truth: historical
owner: engineering
last_reviewed: 2026-03-24
---

# 架构迁移指南

> [!WARNING]
> 本文档记录的是历史迁移过程，不作为当前实现基线。
> 当前请优先参考 `../../../README.md`、`../../TECH_STACK_AND_ARCHITECTURE.md`、`../../QUICK_START.md`、`../../STARTUP_GUIDE.md` 与 `../../DOC_ALIGNMENT_REPORT.md`。

**更新时间**: 2026-01-25  
**适用版本**: v2.0+

本文档说明如何从旧架构迁移到新的六边形架构 + DDD + CQRS 架构。

---

## 📋 迁移概述

### 已完成的迁移

✅ **核心模块已迁移** (2026-01-16 完成):
- 数据源管理 (Datasource)
- 数据集管理 (Dataset)
- 数据提取 (Extraction)
- 查询管理 (Query)
- 对话管理 (Conversation)
- 应用管理 (App)
- 配置管理 (Channel, Subscription)

✅ **架构改进** (2026-01-25 完成):
- 统一日志系统（JSON 结构化）
- 事件总线类型安全重构
- 依赖注入配置验证（Pydantic）
- API 文档自动生成（OpenAPI 3.0）
- 配置中心 UI 完整实现

### 未迁移的模块

⚠️ **仍使用旧架构** (9 个实体):
- `User`, `Role`, `Permission` - 用户权限系统
- `Notification` - 通知系统
- `AuditLog` - 审计日志
- `SystemConfig` - 系统配置
- `FileUpload` - 文件上传
- `ApiKey` - API 密钥管理
- `Webhook` - Webhook 管理

这些模块功能稳定，暂不迁移。

---

## 🏗️ 新架构说明

### 六边形架构 (Hexagonal Architecture)

```
┌─────────────────────────────────────────────────────────┐
│                    Interfaces Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  REST API    │  │  Web UI      │  │  CLI         │  │
│  │  (api/v1/)   │  │  (templates/)│  │  (scripts/)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Commands    │  │  Queries     │  │  Handlers    │  │
│  │  (CQRS写)    │  │  (CQRS读)    │  │  (业务逻辑)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                     Domain Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Entities    │  │  Events      │  │  Services    │  │
│  │  (DDD实体)   │  │  (领域事件)  │  │  (领域服务)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                 Infrastructure Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Repositories │  │  Adapters    │  │  Tasks       │  │
│  │ (数据访问)   │  │  (外部集成)  │  │  (异步任务)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 目录结构

```
app/
├── domain/                 # 领域层（DDD 核心）
│   ├── entities/          # 实体（Entity = ORM Model）
│   ├── events/            # 领域事件
│   ├── ports/             # 端口接口
│   └── services/          # 领域服务
│
├── application/           # 应用层（CQRS）
│   ├── commands/          # 写操作（Command）
│   ├── queries/           # 读操作（Query）
│   ├── handlers/          # 处理器（Handler）
│   └── schemas/           # DTO/Schema
│
├── infrastructure/        # 基础设施层
│   ├── adapters/          # 适配器（外部服务）
│   ├── cache/             # 缓存
│   ├── database/          # 数据库配置
│   ├── events/            # 事件总线
│   ├── repositories/      # 仓储实现
│   └── tasks/             # 异步任务
│
├── interfaces/            # 接口层
│   ├── api/v1/           # REST API
│   ├── api/docs/         # API 文档
│   └── middleware/        # 中间件
│
├── di/                    # 依赖注入
│   ├── container.py       # DI 容器
│   └── utils.py           # DI 工具
│
├── shared/                # 共享模块
│   ├── enums/             # 枚举
│   ├── exceptions/        # 异常
│   ├── utils/             # 工具函数
│   └── logger.py          # 日志系统
│
├── config.py              # 配置（Flask）
└── config_schema.py       # 配置验证（Pydantic）
```

---

## 🔄 迁移步骤

### 1. 创建领域实体 (Domain Entity)

**旧代码** (`app/models.py`):
```python
from app.extensions import db

class Datasource(db.Model):
    __tablename__ = 'datasources'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    config = db.Column(db.JSON)
```

**新代码** (`app/domain/entities/datasource.py`):
```python
from sqlalchemy import Column, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.infrastructure.database.base import Base

class Datasource(Base):
    """数据源实体（DDD Entity）"""
    __tablename__ = 'datasources'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSON)
    
    def __repr__(self):
        return f"<Datasource(id={self.id}, name='{self.name}', type='{self.type}')>"
```

**关键变化**:
- 使用 `Base` 而不是 `db.Model`
- 使用 `Mapped` 类型注解（SQLAlchemy 2.0）
- 放在 `domain/entities/` 目录

---

### 2. 创建仓储 (Repository)

**新代码** (`app/infrastructure/repositories/datasource_repository.py`):
```python
from typing import List, Optional
from sqlalchemy.orm import Session
from app.domain.entities.datasource import Datasource

class DatasourceRepository:
    """数据源仓储"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def find_by_id(self, datasource_id: int) -> Optional[Datasource]:
        return self.session.query(Datasource).filter_by(id=datasource_id).first()
    
    def find_all(self) -> List[Datasource]:
        return self.session.query(Datasource).all()
    
    def save(self, datasource: Datasource) -> Datasource:
        self.session.add(datasource)
        self.session.flush()
        return datasource
    
    def delete(self, datasource: Datasource):
        self.session.delete(datasource)
        self.session.flush()
```

**关键点**:
- 仓储负责数据访问
- 接收 `Session` 作为依赖
- 返回领域实体，不返回字典

---

### 3. 创建命令和处理器 (Command & Handler)

**命令** (`app/application/datasource/commands/create_datasource.py`):
```python
from dataclasses import dataclass
from typing import Dict

@dataclass
class CreateDatasourceCommand:
    """创建数据源命令"""
    name: str
    type: str
    config: Dict
    created_by: str
```

**处理器** (`app/application/datasource/handlers/create_datasource_handler.py`):
```python
from app.application.datasource.commands.create_datasource import CreateDatasourceCommand
from app.domain.entities.datasource import Datasource
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.infrastructure.events.event_bus import EventBus
from app.domain.events.datasource_events import DatasourceCreated

class CreateDatasourceHandler:
    """创建数据源处理器"""
    
    def __init__(self, repository: DatasourceRepository, event_bus: EventBus):
        self.repository = repository
        self.event_bus = event_bus
    
    def handle(self, command: CreateDatasourceCommand) -> Datasource:
        # 1. 创建实体
        datasource = Datasource(
            name=command.name,
            type=command.type,
            config=command.config
        )
        
        # 2. 保存到数据库
        datasource = self.repository.save(datasource)
        
        # 3. 发布领域事件
        event = DatasourceCreated(
            datasource_id=datasource.id,
            name=datasource.name,
            type=datasource.type
        )
        self.event_bus.publish(event)
        
        return datasource
```

**关键点**:
- 命令是不可变的（`@dataclass`）
- 处理器通过依赖注入获取仓储和事件总线
- 处理器负责业务逻辑编排

---

### 4. 创建 API 端点

**新代码** (`app/interfaces/api/v1/datasources.py`):
```python
from flask import Blueprint, request, jsonify
from app.application.datasource.commands.create_datasource import CreateDatasourceCommand
from app.application.datasource.handlers.create_datasource_handler import CreateDatasourceHandler
from app.di.utils import get_app_container

bp = Blueprint('datasources_v1', __name__, url_prefix='/api/v1/datasources')

@bp.route('', methods=['POST'])
def create_datasource():
    """创建数据源"""
    data = request.json
    
    # 1. 创建命令
    command = CreateDatasourceCommand(
        name=data['name'],
        type=data['type'],
        config=data.get('config', {}),
        created_by=request.headers.get('X-User-Id', 'system')
    )
    
    # 2. 获取处理器（依赖注入）
    container = get_app_container()
    handler = container.datasource_create_handler()
    
    # 3. 执行命令
    datasource = handler.handle(command)
    
    # 4. 返回结果
    return jsonify({
        'code': 0,
        'message': 'success',
        'data': {
            'id': datasource.id,
            'name': datasource.name,
            'type': datasource.type
        }
    }), 201
```

**关键点**:
- API 层只负责 HTTP 请求/响应
- 业务逻辑在 Handler 中
- 通过 DI 容器获取依赖

---

### 5. 配置依赖注入

**新代码** (`app/di/container.py`):
```python
from dependency_injector import containers, providers
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.application.datasource.handlers.create_datasource_handler import CreateDatasourceHandler
from app.infrastructure.events.event_bus import EventBus

class Container(containers.DeclarativeContainer):
    """依赖注入容器"""
    
    # 配置
    config = providers.Configuration()
    
    # 数据库会话
    db_session = providers.Singleton(
        lambda: get_db_session()  # 实际实现
    )
    
    # 事件总线
    event_bus = providers.Singleton(EventBus)
    
    # 仓储
    datasource_repository = providers.Factory(
        DatasourceRepository,
        session=db_session
    )
    
    # 处理器
    datasource_create_handler = providers.Factory(
        CreateDatasourceHandler,
        repository=datasource_repository,
        event_bus=event_bus
    )
```

**关键点**:
- 使用 `dependency-injector` 库
- 配置所有依赖关系
- 支持 Singleton 和 Factory 模式

---

## 📝 最佳实践

### 1. 实体设计

✅ **推荐**:
```python
class Dataset(Base):
    """数据集实体"""
    __tablename__ = 'datasets'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    
    # 业务方法
    def is_active(self) -> bool:
        return self.status == 'active'
    
    def can_be_deleted(self) -> bool:
        return not self.has_dependencies()
```

❌ **避免**:
```python
# 不要在实体中直接访问数据库
class Dataset(Base):
    def get_fields(self):
        return db.session.query(DatasetField).filter_by(dataset_id=self.id).all()
```

---

### 2. 仓储设计

✅ **推荐**:
```python
class DatasetRepository:
    def find_by_name(self, name: str) -> Optional[Dataset]:
        return self.session.query(Dataset).filter_by(name=name).first()
    
    def find_active_datasets(self) -> List[Dataset]:
        return self.session.query(Dataset).filter_by(status='active').all()
```

❌ **避免**:
```python
# 不要在仓储中包含业务逻辑
class DatasetRepository:
    def create_and_notify(self, dataset: Dataset):
        self.save(dataset)
        send_notification(dataset)  # 业务逻辑应该在 Handler 中
```

---

### 3. 命令和查询分离 (CQRS)

✅ **推荐**:
```python
# 写操作 - Command
@dataclass
class UpdateDatasetCommand:
    dataset_id: int
    name: str
    description: str

# 读操作 - Query
@dataclass
class GetDatasetQuery:
    dataset_id: int

# 查询处理器
class GetDatasetHandler:
    def handle(self, query: GetDatasetQuery) -> Dict:
        # 可以直接查询数据库，不需要通过仓储
        return db.session.query(Dataset).filter_by(id=query.dataset_id).first()
```

---

### 4. 事件发布

✅ **推荐**:
```python
class CreateDatasetHandler:
    def handle(self, command: CreateDatasetCommand) -> Dataset:
        dataset = Dataset(...)
        dataset = self.repository.save(dataset)
        
        # 发布事件
        event = DatasetCreated(
            dataset_id=dataset.id,
            name=dataset.name
        )
        self.event_bus.publish(event)
        
        return dataset
```

---

## 🔍 常见问题

### Q1: 旧代码如何与新代码共存？

**A**: 新旧代码可以共存，但要注意：
- 新 API 使用 `/api/v1/` 前缀
- 旧 API 保持原路径
- 数据库表可以共享（实体 = ORM Model）
- 逐步迁移，不要一次性重写

### Q2: 如何迁移现有的 API？

**A**: 按以下步骤：
1. 创建领域实体（如果不存在）
2. 创建仓储
3. 创建命令/查询
4. 创建处理器
5. 创建新的 API 端点（`/api/v1/`）
6. 测试新 API
7. 废弃旧 API（保留一段时间兼容）

### Q3: 依赖注入如何使用？

**A**: 
```python
# 在 API 中获取容器
from app.di.utils import get_app_container

container = get_app_container()
handler = container.datasource_create_handler()
result = handler.handle(command)
```

### Q4: 如何处理事务？

**A**: 
```python
# 在 Handler 中使用 session
class CreateDatasetHandler:
    def handle(self, command: CreateDatasetCommand) -> Dataset:
        try:
            dataset = self.repository.save(dataset)
            self.session.commit()  # 提交事务
            return dataset
        except Exception as e:
            self.session.rollback()  # 回滚
            raise
```

---

## 📚 参考资源

- **架构文档**: [TECH_STACK_AND_ARCHITECTURE.md](../../TECH_STACK_AND_ARCHITECTURE.md)
- **数据库架构**: 当前仓库无独立数据库架构文档，请以 `../../TECH_STACK_AND_ARCHITECTURE.md` 和当前代码为准
- **API 文档**: http://localhost/api/docs
- **开发指南**: [AGENTS.md](../../../AGENTS.md)
- **架构清理总结**: [ARCHITECTURE_CLEANUP_SUMMARY.md](../2026-01/ARCHITECTURE_CLEANUP_SUMMARY.md)

---

## 🎯 下一步

1. **学习新架构**: 阅读 [TECH_STACK_AND_ARCHITECTURE.md](../../TECH_STACK_AND_ARCHITECTURE.md)
2. **查看示例**: 参考已迁移的模块（Datasource, Dataset, Extraction）
3. **开始迁移**: 从简单的模块开始（如 Notification）
4. **测试验证**: 编写单元测试和集成测试
5. **文档更新**: 更新 API 文档和用户手册

---

**更新日期**: 2026-01-25  
**维护者**: Data Platform Team
