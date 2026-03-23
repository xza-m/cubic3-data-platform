# 数据提取执行和结果保存设计方案

**日期**: 2025-12-22  
**状态**: 🚧 待实现  

---

## 功能概述

完善数据提取功能的执行逻辑，实现从**查询执行 → 结果保存 → 文件分发 → 通知推送**的完整闭环。

---

## 当前状态

### ✅ 已实现

1. **任务配置**: 数据集选择、字段选择、过滤条件配置
2. **任务管理**: 创建、编辑、删除、查看任务列表
3. **SQL 生成**: 根据配置自动生成 SQL
4. **执行框架**: `execute_task` 方法已创建执行记录和基础查询

### ❌ 待实现

1. **结果文件导出**: CSV/Excel 格式导出
2. **文件存储**: 本地文件系统或 OSS 存储
3. **下载链接**: 生成可访问的下载链接
4. **订阅推送**: 飞书消息和文件推送
5. **执行历史**: 可视化的执行记录和日志查看

---

## 技术架构

### 整体流程

```
用户点击"执行"
    ↓
调用 /api/extraction/tasks/{id}/run
    ↓
创建 ExtractionRun 记录（status='running'）
    ↓
执行 SQL 查询（异步）
    ↓
┌─────────────────────────────────┐
│  1. 获取查询结果                │
│  2. 导出为 CSV/Excel            │
│  3. 检查文件大小                │
│  4. 保存到存储                  │
│  5. 生成下载链接                │
│  6. 更新 ExtractionRun 记录     │
└─────────────────────────────────┘
    ↓
检查是否有订阅配置
    ↓
    ├─ 有订阅 → 发送飞书通知
    └─ 无订阅 → 仅记录结果
    ↓
更新任务最后执行状态
    ↓
完成
```

---

## 详细设计

### 1. 结果文件导出

#### CSV 导出（推荐）

**优点**:
- 文件小、速度快
- 通用性强
- Python 原生支持

**实现**:
```python
import csv
import io
from datetime import datetime

def export_to_csv(data: List[Dict], columns: List[str]) -> bytes:
    """导出数据为 CSV"""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns)
    
    writer.writeheader()
    writer.writerows(data)
    
    return output.getvalue().encode('utf-8-sig')  # BOM for Excel
```

#### Excel 导出（可选）

**优点**:
- 格式更友好
- 支持样式和公式

**依赖**: `openpyxl` 或 `xlsxwriter`

```python
import openpyxl

def export_to_excel(data: List[Dict], columns: List[str]) -> bytes:
    """导出数据为 Excel"""
    wb = openpyxl.Workbook()
    ws = wb.active
    
    # 写入表头
    ws.append(columns)
    
    # 写入数据
    for row in data:
        ws.append([row.get(col) for col in columns])
    
    # 保存到内存
    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
```

---

### 2. 文件存储策略

#### 方案 A: 本地文件系统（简单快速）

**目录结构**:
```
/app/data/extractions/
    ├── 2025/
    │   ├── 12/
    │   │   ├── 22/
    │   │   │   ├── run_123_20251222_153045.csv
    │   │   │   ├── run_124_20251222_154012.csv
```

**优点**:
- 实现简单
- 无需额外配置
- 适合小规模使用

**缺点**:
- 磁盘空间有限
- 不支持分布式
- 需要定期清理

**实现**:
```python
import os
from pathlib import Path

def save_to_local(
    run_id: int,
    content: bytes,
    file_ext: str = 'csv'
) -> str:
    """保存文件到本地"""
    base_dir = Path('/app/data/extractions')
    now = datetime.now()
    
    # 按日期分类存储
    date_dir = base_dir / str(now.year) / f"{now.month:02d}" / f"{now.day:02d}"
    date_dir.mkdir(parents=True, exist_ok=True)
    
    # 文件名: run_123_20251222_153045.csv
    filename = f"run_{run_id}_{now.strftime('%Y%m%d_%H%M%S')}.{file_ext}"
    filepath = date_dir / filename
    
    # 写入文件
    filepath.write_bytes(content)
    
    return str(filepath)
```

#### 方案 B: 阿里云 OSS（推荐）

**优点**:
- 无限存储空间
- 高可用性
- 支持预签名 URL
- 按需付费

**配置**:
```python
# .env
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET_NAME=your-bucket
OSS_REGION=cn-hangzhou
```

**实现**:
```python
import oss2

class OSSStorage:
    def __init__(self):
        auth = oss2.Auth(
            os.getenv('OSS_ACCESS_KEY_ID'),
            os.getenv('OSS_ACCESS_KEY_SECRET')
        )
        self.bucket = oss2.Bucket(
            auth,
            os.getenv('OSS_ENDPOINT'),
            os.getenv('OSS_BUCKET_NAME')
        )
    
    def upload_file(
        self,
        content: bytes,
        object_name: str
    ) -> str:
        """上传文件到 OSS"""
        self.bucket.put_object(object_name, content)
        return object_name
    
    def generate_presigned_url(
        self,
        object_name: str,
        expires: int = 86400  # 24小时
    ) -> str:
        """生成预签名 URL"""
        return self.bucket.sign_url(
            'GET',
            object_name,
            expires
        )
```

---

### 3. 智能文件分发策略

#### 文件大小判断

```python
FILE_SIZE_THRESHOLD = 20 * 1024 * 1024  # 20MB

if file_size < FILE_SIZE_THRESHOLD:
    # 方案1: 直接上传到飞书
    upload_to_feishu_chat(file_content, filename)
else:
    # 方案2: 生成 OSS 链接
    oss_url = upload_to_oss_and_get_url(file_content, filename)
    send_feishu_message(f"数据提取完成，请点击下载：{oss_url}")
```

#### 飞书文件上传

```python
async def upload_to_feishu_chat(
    chat_id: str,
    file_content: bytes,
    filename: str
):
    """上传文件到飞书群聊"""
    # 1. 上传文件获取 file_key
    upload_url = 'https://open.feishu.cn/open-apis/im/v1/files'
    
    files = {
        'file': (filename, file_content, 'text/csv')
    }
    data = {
        'file_type': 'stream',
        'file_name': filename
    }
    
    response = requests.post(
        upload_url,
        headers={'Authorization': f'Bearer {access_token}'},
        files=files,
        data=data
    )
    file_key = response.json()['data']['file_key']
    
    # 2. 发送文件消息到群聊
    message_url = f'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id'
    
    payload = {
        'receive_id': chat_id,
        'msg_type': 'file',
        'content': json.dumps({'file_key': file_key})
    }
    
    requests.post(
        message_url,
        headers={'Authorization': f'Bearer {access_token}'},
        json=payload
    )
```

#### 飞书消息推送

```python
async def send_extraction_notification(
    chat_id: str,
    task_name: str,
    status: str,
    download_url: Optional[str] = None,
    row_count: int = 0,
    file_size: int = 0
):
    """发送提取结果通知"""
    if status == 'success':
        content = {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"""**数据提取完成** ✅
                
**任务名称**: {task_name}
**数据行数**: {row_count:,} 行
**文件大小**: {format_size(file_size)}
**完成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

{f'**下载链接**: [点击下载]({download_url})' if download_url else ''}
**有效期**: 24小时
"""
            }
        }
    else:
        content = {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"""**数据提取失败** ❌
                
**任务名称**: {task_name}
**失败时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

请联系管理员查看日志
"""
            }
        }
    
    # 发送卡片消息
    # ...
```

---

### 4. 执行历史页面

#### 页面设计

**路由**: `/extraction/runs` 或 `/extraction/tasks/{id}/runs`

**功能**:
- 📋 执行记录列表
- 🔍 按任务、状态筛选
- 📥 下载结果文件
- 📊 查看执行详情（SQL、行数、耗时）
- 🔄 重新执行

**表格列**:
| 执行时间 | 任务名称 | 状态 | 行数 | 文件大小 | 耗时 | 操作 |
|---------|---------|------|------|---------|------|------|
| 2025-12-22 15:30 | 订单导出 | ✅ 成功 | 1,234 | 1.2MB | 3.5s | 下载 \| 查看 |
| 2025-12-22 14:20 | 用户数据 | ❌ 失败 | - | - | 0.8s | 重试 \| 日志 |

#### API 设计

```
GET  /api/extraction/runs?task_id=1&status=success&page=1
GET  /api/extraction/runs/{run_id}
GET  /api/extraction/runs/{run_id}/download
POST /api/extraction/runs/{run_id}/retry
```

---

### 5. 完整的 execute_task 实现

```python
@staticmethod
async def execute_task(
    task_id: int,
    triggered_by: str = 'manual'
) -> ExtractionRun:
    """执行提取任务（完整版）"""
    task = ExtractionTask.query.get(task_id)
    if not task:
        raise ValueError(f"任务不存在: {task_id}")
    
    # 创建执行记录
    run = ExtractionRun(
        task_id=task_id,
        run_type='manual',
        triggered_by=triggered_by,
        execution_params={},
        generated_sql=task.sql_template,
        status='running',
        start_time=datetime.utcnow()
    )
    db.session.add(run)
    db.session.commit()
    
    try:
        # 1. 执行查询
        dataset = task.dataset
        datasource = dataset.source
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        result = await adapter.execute_query(task.sql_template)
        
        # 2. 导出文件
        columns = result.get('columns', [])
        data = result.get('data', [])
        
        file_content = export_to_csv(data, columns)
        file_size = len(file_content)
        
        # 3. 保存文件
        storage = OSSStorage()  # 或 LocalStorage()
        
        filename = f"extraction_{task_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        object_name = f"extractions/{datetime.now().year}/{datetime.now().month:02d}/{filename}"
        
        storage.upload_file(file_content, object_name)
        
        # 4. 生成下载链接
        download_url = storage.generate_presigned_url(object_name, expires=86400)
        
        # 5. 更新执行记录
        run.status = 'success'
        run.end_time = datetime.utcnow()
        run.duration_ms = int((run.end_time - run.start_time).total_seconds() * 1000)
        run.row_count = len(data)
        run.file_size = file_size
        run.file_path = object_name
        run.download_url = download_url
        run.url_expires_at = datetime.utcnow() + timedelta(days=1)
        
        # 6. 发送通知
        if task.subscription_config and task.subscription_config.get('enabled'):
            await send_extraction_notification(
                chat_id=task.subscription_config.get('feishu_chat_id'),
                task_name=task.task_name,
                status='success',
                download_url=download_url,
                row_count=len(data),
                file_size=file_size
            )
            run.notification_status = 'sent'
        
    except Exception as e:
        run.status = 'failed'
        run.end_time = datetime.utcnow()
        run.duration_ms = int((run.end_time - run.start_time).total_seconds() * 1000)
        run.error_message = str(e)
        run.error_stack = traceback.format_exc()
        
        # 发送失败通知
        if task.subscription_config and task.subscription_config.get('enabled'):
            await send_extraction_notification(
                chat_id=task.subscription_config.get('feishu_chat_id'),
                task_name=task.task_name,
                status='failed'
            )
    
    db.session.commit()
    
    # 更新任务最后执行信息
    task.last_run_at = run.end_time
    task.last_run_status = run.status
    db.session.commit()
    
    return run
```

---

## 数据库表补充

### ExtractionRun 字段确认

```python
class ExtractionRun(db.Model):
    # ... 现有字段
    
    # 需要确保有以下字段：
    file_path = db.Column(db.String(500))           # 文件路径/OSS key
    file_size = db.Column(db.BigInteger)            # 文件大小（字节）
    download_url = db.Column(db.String(1000))       # 下载链接
    url_expires_at = db.Column(db.DateTime)         # 链接过期时间
    notification_status = db.Column(db.String(20))  # 通知状态
```

---

## 实施优先级

### Phase 1: 基础执行（优先）

✅ **目标**: 能执行并看到结果

1. 完善 `execute_task` 方法
2. CSV 导出功能
3. 本地文件存储
4. 执行历史列表页面
5. 文件下载接口

### Phase 2: 云存储（推荐）

✅ **目标**: 大文件支持

1. OSS 集成
2. 预签名 URL 生成
3. 文件过期清理

### Phase 3: 订阅推送（高级）

✅ **目标**: 自动化通知

1. 飞书文件上传
2. 飞书消息推送
3. 订阅配置界面

---

## 配置项

```python
# config.py 或 .env

# 文件存储
STORAGE_TYPE = 'local'  # local, oss
LOCAL_STORAGE_PATH = '/app/data/extractions'
FILE_SIZE_THRESHOLD = 20 * 1024 * 1024  # 20MB

# OSS配置
OSS_ACCESS_KEY_ID = 'xxx'
OSS_ACCESS_KEY_SECRET = 'xxx'
OSS_ENDPOINT = 'oss-cn-hangzhou.aliyuncs.com'
OSS_BUCKET_NAME = 'your-bucket'
OSS_URL_EXPIRES = 86400  # 24小时

# 飞书配置
FEISHU_APP_ID = 'xxx'
FEISHU_APP_SECRET = 'xxx'
FEISHU_ENABLE_NOTIFICATION = True
```

---

## 测试检查清单

### 基础功能
- [ ] 执行任务能生成 CSV 文件
- [ ] 文件保存到本地/OSS
- [ ] 生成有效的下载链接
- [ ] 执行记录正确保存

### 异常处理
- [ ] SQL 执行失败正确记录错误
- [ ] 文件保存失败正确处理
- [ ] 超大结果集（>100万行）处理
- [ ] 磁盘空间不足处理

### 性能测试
- [ ] 10万行数据导出时间 < 10秒
- [ ] 100万行数据导出时间 < 60秒
- [ ] 并发执行5个任务不阻塞

### 通知功能
- [ ] 飞书小文件直接上传成功
- [ ] 飞书大文件发送链接成功
- [ ] 通知消息格式正确美观

---

## 预估工作量

| 功能模块 | 工作量 | 优先级 |
|---------|-------|--------|
| CSV 导出 | 2小时 | P0 |
| 本地文件存储 | 2小时 | P0 |
| 执行历史页面 | 4小时 | P0 |
| 文件下载接口 | 2小时 | P0 |
| OSS 集成 | 4小时 | P1 |
| 飞书文件上传 | 3小时 | P1 |
| 飞书消息推送 | 2小时 | P1 |
| 订阅配置界面 | 4小时 | P2 |
| **总计** | **23小时** | - |

---

**下一步行动**: 需要先实现 Phase 1 的基础执行功能，让整个数据提取流程能够跑通。

**技术负责人审批**: _________  
**产品经理审批**: _________  
**预计完成时间**: ________

