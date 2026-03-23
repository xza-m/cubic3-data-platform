# 问一问记录事实表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_study_tbl_study_lesson_qa |
| 分区字段 | ds（业务日期） |
| 表类型 | 普通表 |

## 业务定义

在 AI 课学习场景中，学生如果对知识点有疑问或者延伸需求时，可通过问一问模块进行 AI 问答。

## 使用说明

`ds` 为业务日期。

**使用场景**：问一问场景分析、问题排查。

```sql
SELECT 
    student_id,
    user_question,
    ai_answer,
    tokens_num,
    send_time
FROM dwd_study_tbl_study_lesson_qa
WHERE ds BETWEEN '20240101' AND '20240107'
  AND is_deleted = 0
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_sessions_snap_f | session_id | 关联学习会话 |
| dim_course_lesson_snap_f | lesson_id + lesson_version | 关联课程维度 |
| dim_question_all_tree_info_df | knowledge_id | 知识点维度 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| chat_id | 聊天 ID | |
| study_lesson_qa_id | 答疑记录主键 ID | |
| session_id | 学习会话 ID | 外键，可关联学习会话记录表 |
| widget_index | 文档组件下标 | |
| knowledge_id | 知识点 ID | 外键，可关联知识点维度表 |
| lesson_id | 课程 ID | 外键 |
| lesson_version | 课程版本 | |
| user_question | 用户问题 | |
| ai_answer | AI 回答 | |
| send_time | 用户发送时间 | |
| receive_time | AI 接收时间 | |
| tokens_num | Tokens 数量 | |
| response_tokens | 模型输出 token 数 | |
| is_deleted | 是否删除 | 0-未删除, 1-已删除 |
| create_time | 记录创建时间 | |
| update_time | 记录最后更新时间 | |
| student_id | 学生 ID | |
| study_type | 学习类型 | |
| question_id | 题目 ID | |
| phase_id | 学段 | |
| subject_id | 学科 | |
| is_exception | 异常 | |
| query_score | 用户问题评分 | |
| qa_session_key | 答疑会话唯一标识 | |
| widget_id | 组件 ID | |
| is_thinking | 是否开启思考模式 | 0-否, 1-是 |
| quote | 引用原文 | |
| query_source | 输入方式 | input_text-键盘输入, input_voice-语音输入, preset_general-预设问题 |

## 常用查询

```sql
-- 统计问一问使用频率
SELECT 
    subject_id,
    COUNT(*) AS qa_count,
    COUNT(DISTINCT student_id) AS student_count,
    SUM(tokens_num) AS total_tokens
FROM dwd_study_tbl_study_lesson_qa
WHERE ds BETWEEN '20240101' AND '20240107'
  AND is_deleted = 0
GROUP BY subject_id
```
