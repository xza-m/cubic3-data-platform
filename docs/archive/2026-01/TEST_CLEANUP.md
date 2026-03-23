# 旧架构测试代码清理记录

**清理时间**: 2026-01-16  
**执行原因**: 完成 DDD/Hexagonal 架构迁移后，清理旧架构的测试代码和配置

---

## 清理内容

### ✅ 已删除的测试脚本（7个）

#### 1. 旧 API 测试脚本（4个）

| 文件名 | 测试内容 | 删除原因 |
|--------|----------|----------|
| `test_datasource_api.sh` | 旧的 `/api/datasources` API | 已迁移到 `/api/v1/datasources` |
| `test_dataset_registration.sh` | 旧的 `/api/datasets` API | 已迁移到 `/api/v1/datasets` |
| `test_datasource_types.sh` | 旧的 `/api/datasources` API | 已迁移到 `/api/v1/datasources` |
| `test_filter_builder.sh` | 旧的 `/api/extraction/preview` API | 已迁移到 `/api/v1/extraction` |

#### 2. 旧页面测试脚本（1个）

| 文件名 | 测试内容 | 删除原因 |
|--------|----------|----------|
| `test_all_pages.sh` | 旧的非前后端分离页面 | 新架构采用前后端分离 |

#### 3. Superset 相关测试（2个）

| 文件名 | 测试内容 | 删除原因 |
|--------|----------|----------|
| `test_superset_complete.sh` | Superset 订阅页面测试 | 测试旧的非前后端分离页面 |
| `test_sp_sh.sh` | Superset 截图功能测试 | 外部集成测试，与当前架构无关 |

#### 4. 调试和辅助文件（5个）

| 文件名 | 文件类型 | 删除原因 |
|--------|----------|----------|
| `debug.html` | 页面调试工具 | 旧架构的前端调试页面，新架构不需要 |
| `test_frontend.html` | 前端测试页面 | 旧架构的前端测试工具 |
| `get_token.sh` | Superset Token 脚本 | 包含硬编码账号密码的测试脚本 |
| `cookies.txt` | Cookie 测试文件 | 测试用的临时 cookie 文件 |
| `metadata.md` | 空文件 | 无内容的临时文件 |

---

### 📊 清理统计（总计）

| 类型 | 数量 | 说明 |
|------|------|------|
| Shell 测试脚本 | 7 | 旧 API 测试、页面测试、Superset 测试 |
| HTML 调试页面 | 2 | 前端调试工具 |
| 辅助脚本 | 1 | Token 获取脚本 |
| 临时文件 | 2 | cookies.txt, metadata.md |
| **总计** | **12** | |

---

## 新架构测试策略

### 当前状态

- ❌ 单元测试：未实现
- ❌ 集成测试：未实现
- ❌ API 端点测试：未实现

### 推荐测试方案

#### 1. 单元测试（优先级：高）

**框架**: `pytest` + `pytest-cov`

**测试范围**:
```
tests/
├── unit/
│   ├── domain/
│   │   ├── test_entities.py          # 实体测试
│   │   └── test_domain_services.py   # 领域服务测试
│   ├── application/
│   │   ├── test_handlers.py          # Handler 测试
│   │   └── test_queries.py           # 查询测试
│   └── infrastructure/
│       └── test_repositories.py      # Repository 测试
```

**示例**:
```python
# tests/unit/domain/test_entities.py
def test_datasource_entity():
    ds = Datasource(
        name="Test",
        source_type="postgresql",
        connection_config={...}
    )
    assert ds.name == "Test"
    assert ds.is_valid_connection_config()

# tests/unit/application/test_handlers.py
def test_create_datasource_handler(mock_repository):
    handler = CreateDatasourceHandler(repository=mock_repository)
    command = CreateDatasourceCommand(...)
    result = handler.handle(command)
    assert result.name == "Test"
```

#### 2. 集成测试（优先级：中）

**框架**: `pytest` + `pytest-flask`

**测试范围**:
```
tests/
└── integration/
    ├── test_datasource_api.py    # 数据源 API 完整流程
    ├── test_dataset_api.py       # 数据集 API 完整流程
    └── test_extraction_api.py    # 提取任务 API 完整流程
```

**示例**:
```python
# tests/integration/test_datasource_api.py
def test_datasource_crud_flow(client):
    # 1. 创建数据源
    response = client.post('/api/v1/datasources', json={...})
    assert response.status_code == 201
    ds_id = response.json['data']['id']
    
    # 2. 获取数据源
    response = client.get(f'/api/v1/datasources/{ds_id}')
    assert response.status_code == 200
    
    # 3. 更新数据源
    response = client.put(f'/api/v1/datasources/{ds_id}', json={...})
    assert response.status_code == 200
    
    # 4. 删除数据源
    response = client.delete(f'/api/v1/datasources/{ds_id}')
    assert response.status_code == 200
```

#### 3. API 端点测试（优先级：中）

**工具**: Shell 脚本 + `curl` / `httpie`

**测试范围**:
```bash
tests/
└── api/
    ├── test_v1_datasources.sh    # 数据源 API v1
    ├── test_v1_datasets.sh       # 数据集 API v1
    └── test_v1_extraction.sh     # 提取任务 API v1
```

**示例**:
```bash
#!/bin/bash
# tests/api/test_v1_datasources.sh

BASE_URL="http://localhost:5000/api/v1"

echo "测试数据源 API v1"

# 1. 获取数据源列表
curl -s "${BASE_URL}/datasources?page=1&page_size=10" | jq

# 2. 创建数据源
curl -s -X POST "${BASE_URL}/datasources" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test_user" \
  -d '{...}' | jq

# 3. 获取统计信息
curl -s "${BASE_URL}/datasources/statistics" | jq
```

#### 4. 前端测试（优先级：中）

**框架**: `Vitest` + `React Testing Library`

**测试范围**:
```
frontend/
└── src/
    ├── __tests__/
    │   ├── components/          # 组件测试
    │   ├── pages/              # 页面测试
    │   └── api/                # API 客户端测试
```

---

## 测试环境配置

### 1. 依赖安装

```bash
# Python 测试依赖
pip install pytest pytest-cov pytest-flask pytest-asyncio

# 前端测试依赖
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

### 2. pytest 配置

创建 `pytest.ini`:
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = 
    -v
    --cov=app
    --cov-report=html
    --cov-report=term
```

### 3. 测试数据库

创建 `tests/conftest.py`:
```python
import pytest
from app import create_app
from app.extensions import db

@pytest.fixture
def app():
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()
```

---

## 运行测试

### 单元测试
```bash
# 运行所有测试
pytest

# 运行特定模块
pytest tests/unit/domain/

# 生成覆盖率报告
pytest --cov=app --cov-report=html
open htmlcov/index.html
```

### 集成测试
```bash
# 运行集成测试
pytest tests/integration/

# 运行特定 API 测试
pytest tests/integration/test_datasource_api.py
```

### API 端点测试
```bash
# 启动应用
docker-compose up -d

# 运行 API 测试
bash tests/api/test_v1_datasources.sh
bash tests/api/test_v1_datasets.sh
bash tests/api/test_v1_extraction.sh
```

### 前端测试
```bash
cd frontend
npm test                 # 运行测试
npm run test:coverage    # 生成覆盖率报告
```

---

## 测试覆盖率目标

| 层级 | 目标覆盖率 | 说明 |
|------|-----------|------|
| Domain | 90%+ | 核心业务逻辑，必须高覆盖 |
| Application | 80%+ | Handler 和 Service |
| Infrastructure | 70%+ | Repository 和 Adapter |
| Interface | 60%+ | API 端点基本流程 |

---

## 持续集成（CI）

### GitHub Actions 配置示例

创建 `.github/workflows/test.yml`:
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.9'
    
    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install pytest pytest-cov
    
    - name: Run tests
      run: pytest --cov=app --cov-report=xml
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

---

## 相关文档

- [架构重构记录](./ARCHITECTURE_REFACTORING.md)
- [依赖注入完善](./DI_CONTAINER_COMPLETE.md)
- [API 迁移完成](./API_MIGRATION_COMPLETE.md)

---

**状态**: ✅ 旧架构测试清理完成，推荐的新测试方案已规划！
