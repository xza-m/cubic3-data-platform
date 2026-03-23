# AI 课学习进度事实表（组件粒度）

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_study_lesson_widget_snap |
| 分区字段 | completed_date（组件完成日期） |
| 表类型 | delta table |

## 业务定义

学生 AI 课会话扁平化拆分组件粒度，记录 AI 课中各组件的学习进度、时长和其他信息。

## 使用说明

增量快照事务表，采用分区 delta 表模式。未完成的组件存量存储在 99991231 墓碑分区，每日读取昨日变更数据抽取完成的组件增量 MERGE 到对应分区，并重新计算未完成组件覆写墓碑分区。

**使用场景**：AI 课组件学习时长、数量、完成度相关分析，AI 课学习问题排查。

**当前问题**：某些完成状态的组件未记录时间、完成时间等信息。

```sql
SELECT 
    study_progress_id,
    widget_index,
    widget_name,
    widget_type,
    widget_status,
    widget_duration
FROM dwd_study_lesson_widget_snap
WHERE completed_date BETWEEN '20240101' AND '20240107'
  AND widget_status = 'completed'
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_lesson_progress_snap | study_progress_id | 关联会话粒度进度 |
| dwd_study_sessions_snap_f | study_session_id | 关联会话信息 |
| dim_course_lesson_snap_f | lesson_id + lesson_version | 关联课程维度 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| study_progress_id | 学习进度 ID | **联合主键** |
| widget_index | 组件序号 | **联合主键** |
| study_session_id | 关联的学习会话 ID | 会话外键 |
| lesson_id | AI 课程 ID | 课程外键 |
| lesson_version | AI 课程版本 | |
| knowledge_id | 知识点 ID | 知识点外键 |
| total_widget_count | 总组件数 | |
| student_id | 学生 ID | 学生外键 |
| exercise_session_id | 课中练习会话 ID | |
| widget_status | 组件状态 | completed/locked/unlocked |
| widget_duration | 组件时长（毫秒） | |
| widget_name | 组件名称 | |
| widget_type | 组件类型 | video/exercise/interactive/guide |
| widget_completed_time | 组件完成时间 | |
| create_time | 创建时间 | |
| update_time | 更新时间 | |

## 组件类型说明

| widget_type | 说明 |
|-------------|------|
| video | 视频组件 |
| exercise | 练习组件 |
| interactive | 互动组件 |
| guide | 引导组件 |

## 注意事项

- 未完成的组件存储在 `99991231` 墓碑分区
- 查询已完成组件时，建议过滤 `widget_status = 'completed'`
