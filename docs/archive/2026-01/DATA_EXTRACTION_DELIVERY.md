# 数据提取文件交付功能说明

## 功能概述

数据提取平台支持智能文件交付策略，根据结果文件大小自动选择最优交付方式，平衡用户体验和系统资源。

## 文件大小分层策略

### 📊 三层交付策略

| 文件大小 | 交付方式 | 特点 | 预计下载时间 |
|---------|---------|------|-------------|
| **≤ 20MB** | 飞书直传 / 本地下载 | 即时交付，支持飞书群推送 | 1-10秒 |
| **20-300MB** | 本地下载（推荐）/ OSS | 流式传输，无内存压力 | 30秒-2分钟 |
| **> 300MB** | 强制OSS上传 | 异步处理，预签名URL | 异步，链接24小时有效 |

### 🎯 阈值配置

在 `app/services/file_delivery.py` 中可调整：

```python
class FileDeliveryStrategy:
    FEISHU_UPLOAD_LIMIT = 20        # 飞书文件上传限制（MB）
    LOCAL_DOWNLOAD_LIMIT = 300      # 本地下载推荐上限（MB）
    MANDATORY_OSS_LIMIT = 1000      # 强制OSS上传阈值（保留）
```

## 技术实现

### 1. 文件保存

使用 CSV 格式保存查询结果，支持 UTF-8-BOM 编码（Excel 友好）：

```python
# app/services/file_delivery.py
def save_query_result_to_csv(data, columns, file_path):
    with open(file_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(data)
```

**存储路径**: `instance/extraction_results/extraction_{run_id}_{timestamp}.csv`

### 2. 本地下载（流式传输）

#### 优势
- ✅ **低内存占用**: 使用 Flask `send_file` 流式传输，不加载整个文件到内存
- ✅ **高并发支持**: 单个300MB文件下载仅占用少量内存
- ✅ **断点续传**: 支持 HTTP Range 请求（浏览器默认支持）

#### 实现

```python
# app/routes/extraction.py
@bp.route('/runs/<int:run_id>/download', methods=['GET'])
def download_result(run_id):
    return send_file(
        run.result_file_path,
        as_attachment=True,
        download_name=f"{task_name}_{run_id}.csv",
        mimetype='text/csv',
        max_age=0  # 禁用缓存
    )
```

#### 性能估算

假设网络带宽 5MB/s（普通公网）：

| 文件大小 | 下载时间 | 服务器负载 |
|---------|---------|-----------|
| 50MB | 10秒 | 极低（流式传输）|
| 100MB | 20秒 | 极低 |
| 200MB | 40秒 | 低 |
| 300MB | 60秒 | 低 |

**并发限制建议**: 
- 使用 `flask-limiter` 限制每分钟下载次数（默认10次）
- 如需更高并发，考虑引入 CDN 或 Nginx 反向代理

### 3. 飞书推送

#### 小文件（≤ 20MB）

直接上传文件到飞书群，无需用户登录平台：

```python
# 1. 上传文件
file_key = feishu_client.upload_file(file_path)

# 2. 发送文件消息
feishu_client.send_file_message(chat_id, file_key, file_name)

# 3. 发送说明卡片
feishu_client.send_card_message(
    chat_id,
    title="📊 数据提取完成",
    content=f"**任务名称**: {task_name}\n**文件大小**: {file_size_mb:.2f}MB\n..."
)
```

#### 中大文件（> 20MB）

仅发送通知卡片，引导用户登录平台下载：

```python
feishu_client.send_card_message(
    chat_id,
    title="📊 数据提取完成",
    content="请登录平台下载文件",
    link=f"{APP_BASE_URL}/extraction/tasks"
)
```

### 4. OSS 交付（预留）

#### 适用场景
- 文件 > 300MB
- 用户明确选择 OSS 交付
- 需要长期保存（超过24小时）

#### 实现流程

```python
# 1. 上传到 OSS
oss_client.put_object_from_file(object_name, file_path)

# 2. 生成预签名下载链接（24小时有效）
download_url = oss_client.sign_url('GET', object_name, expires=86400)

# 3. 发送飞书通知（带下载链接）
feishu_client.send_card_message(
    chat_id,
    title="📊 数据提取完成（OSS）",
    content=f"**下载链接**: [点击下载]({download_url})\n**链接有效期**: 24小时",
    link=download_url
)
```

#### 配置要求

在 `.env` 中配置 OSS 信息：

```bash
OSS_ACCESS_KEY_ID=your_access_key
OSS_ACCESS_KEY_SECRET=your_secret_key
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET_NAME=your-bucket-name
```

## 订阅配置

### 任务订阅配置格式

```json
{
  "feishu_chat_id": "oc_xxxxx",           // 飞书群ID
  "delivery_method": "auto",              // auto | local | oss | feishu
  "schedule": {                           // 定时任务配置
    "enabled": true,
    "cron": "0 9 * * *",                  // 每天9点
    "timezone": "Asia/Shanghai"
  }
}
```

### 交付方式优先级

1. **用户明确指定**: `delivery_method` = `feishu` / `local` / `oss`
2. **自动判断（推荐）**: `delivery_method` = `auto`
   - ≤ 20MB: 优先飞书（如配置了 `feishu_chat_id`），否则本地
   - 20-300MB: 本地下载
   - > 300MB: 强制 OSS

## 使用示例

### 示例 1: 手动执行任务

```javascript
// 前端调用
const response = await fetch(`/api/extraction/tasks/${taskId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
});

const data = await response.json();
if (data.code === 0 && data.data.status === 'success') {
    // 立即下载
    window.location.href = `/api/extraction/runs/${data.data.id}/download`;
}
```

### 示例 2: 订阅任务（定时执行）

```json
{
  "task_name": "每日订单数据提取",
  "dataset_id": 123,
  "select_fields": ["order_id", "user_id", "amount", "ds"],
  "filter_conditions": {
    "logic": "AND",
    "filters": [
      {
        "field": "ds",
        "operator": "=",
        "value": "{{ yesterday }}"  // 动态变量
      }
    ]
  },
  "task_type": "scheduled",
  "schedule_config": {
    "cron": "0 9 * * *"
  },
  "subscription_config": {
    "feishu_chat_id": "oc_xxxxx",
    "delivery_method": "auto"
  }
}
```

**执行流程**:
1. 定时任务触发（每天9点）
2. 查询数据并保存 CSV
3. 根据文件大小选择交付方式：
   - 小文件: 飞书直传
   - 中文件: 飞书通知 + 平台下载
   - 大文件: OSS链接推送飞书

## 监控与日志

### 执行历史记录

所有执行记录保存在 `extraction_runs` 表：

```python
class ExtractionRun:
    run_id = ...
    task_id = ...
    status = 'running' | 'success' | 'failed'
    start_time = ...
    end_time = ...
    duration_ms = ...
    row_count = ...
    result_file_path = ...
    result_size_mb = ...
    delivery_method = 'local' | 'feishu' | 'oss'
    delivery_info = {...}  # JSONB，详细交付信息
    error_message = ...
```

### 查询执行历史

```bash
# API 查询
GET /api/extraction/runs?task_id=123&page=1&page_size=20

# 响应示例
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1,
        "task_id": 123,
        "status": "success",
        "row_count": 15000,
        "result_size_mb": 5.8,
        "delivery_method": "local",
        "duration_ms": 3500,
        "start_time": "2025-12-22T09:00:00Z"
      }
    ],
    "total": 50
  }
}
```

## 性能优化建议

### 1. 数据库分区

对于大数据量场景，建议按日期分区 `extraction_runs` 表：

```sql
CREATE TABLE extraction_runs_202501 PARTITION OF extraction_runs
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### 2. 文件清理策略

建议定期清理旧文件（Cron Job）：

```python
# 清理30天前的文件
def cleanup_old_files(days=30):
    cutoff_date = datetime.now() - timedelta(days=days)
    old_runs = ExtractionRun.query.filter(
        ExtractionRun.created_at < cutoff_date,
        ExtractionRun.result_file_path.isnot(None)
    ).all()
    
    for run in old_runs:
        if os.path.exists(run.result_file_path):
            os.remove(run.result_file_path)
        run.result_file_path = None
    
    db.session.commit()
```

### 3. 限流配置

```python
# app/routes/extraction.py
from flask_limiter import Limiter

limiter = Limiter(app, key_func=get_remote_address)

@bp.route('/runs/<int:run_id>/download')
@limiter.limit("10 per minute")  # 每分钟最多10次下载
def download_result(run_id):
    ...
```

## 安全注意事项

### 1. 文件访问控制

- ✅ 验证用户身份（TODO: 集成 Feishu SSO）
- ✅ 检查文件是否属于当前用户
- ✅ 禁止目录遍历攻击

### 2. 文件大小限制

```python
# 硬性限制：拒绝超过500MB的本地下载
if file_size_mb > 500:
    return jsonify({
        'code': -1,
        'message': '文件过大，请使用 OSS 链接下载'
    }), 400
```

### 3. 敏感数据脱敏

在 `ExtractionService.generate_sql` 中自动应用脱敏规则：

```python
# TODO: 根据字段的 sensitivity 和 mask_rule 自动应用脱敏
if field.sensitivity == 'PII' and field.mask_rule:
    select_clause += apply_mask_rule(field.physical_name, field.mask_rule)
```

## 未来扩展

### 1. 支持更多文件格式

- Excel (.xlsx): 使用 `openpyxl`
- Parquet: 使用 `pyarrow`
- JSON Lines: 适合半结构化数据

### 2. 数据压缩

对于大文件，自动压缩为 `.zip` 或 `.gz`：

```python
import gzip

with gzip.open(f"{file_path}.gz", 'wb') as gz:
    with open(file_path, 'rb') as f:
        gz.write(f.read())
```

### 3. 增量提取

支持基于 watermark 的增量提取，减少重复数据传输。

## 故障排查

### 问题 1: 下载文件损坏

**原因**: CSV 编码问题或文件写入未完成

**解决**: 
```python
# 写入完成后验证文件完整性
os.fsync(f.fileno())  # 强制刷新到磁盘
```

### 问题 2: 飞书推送失败

**原因**: 
- 机器人未加入群聊
- 权限不足（`im:message:send_as_bot`）

**解决**: 
1. 检查飞书应用权限配置
2. 确保机器人在目标群聊中

### 问题 3: OSS 上传超时

**原因**: 大文件上传时网络波动

**解决**: 
```python
# 分片上传（适用于 > 100MB 文件）
oss2.resumable_upload(bucket, object_name, file_path, 
                      multipart_threshold=10*1024*1024)
```

## 总结

数据提取文件交付功能采用**智能分层策略**，在用户体验、系统成本和性能之间取得最佳平衡：

- **20MB 以下**: 飞书直传，即时触达
- **20-300MB**: 本地流式下载，无内存压力（**推荐阈值**）
- **300MB 以上**: OSS 异步上传，预签名链接

通过合理的阈值配置和限流策略，系统可支持高并发场景下的稳定运行。

