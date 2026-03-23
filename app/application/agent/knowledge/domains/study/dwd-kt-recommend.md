# 算法 KT 推题事实表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_kt_rec_answer_record_flow_di |
| 分区字段 | ds（业务日期） |
| 表类型 | 普通表 |

## 业务定义

在巩固练习、拓展练习等场景，为提升学生的学习效果，采用 KT 模型自适应推题的策略。这张表将推题请求、推题过程、推题结果、答题结果整条业务流串联，以分析实际推题效果。

## 使用说明

`ds` 为业务日期，含义为推题日期，但是推题和答题是存在跨天的，所以在推题记录关联答题记录时采用的 `answer_date >= recommend_date` 的不等值 join。但是答题和推题的日期 gap 无边界，所以还是会有少量的关联缺失。

**使用场景**：推题效果分析、推题问题排查。

```sql
SELECT 
    recommend_id,
    student_id,
    question_id,
    question_probability,
    answer_result
FROM dwd_kt_rec_answer_record_flow_di
WHERE ds BETWEEN '20240101' AND '20240107'
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_first_answer_records_snap_di | recommend_id / answer_record_id | 关联答题记录 |
| dwd_study_sessions_snap_f | study_session_id | 关联会话信息 |
| dwd_question_snapshot | question_id | 关联题目维度 |
| dim_ucenter_user_student_df | student_id | 学生维度 |
| dim_question_all_tree_info_df | knowledge_id | 知识点维度 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| recommend_id | KT 推荐记录 ID | **主键**，可关联推荐题目的实际答题结果 |
| answer_record_id | 答题记录 ID | 外键，可关联答题记录的其他信息 |
| study_session_id | 学习会话 ID | 外键，可关联答题记录对应会话的其他信息 |
| student_id | 学生 ID | 外键，可关联学生维度表 |
| subject_name | 学科名称 | |
| question_id | 题目 ID | 外键，可关联题库维度表 |
| question_difficulty | 题目难度 | 1-5 |
| answer_result | 答题结果 | 0-未作答, 1-正确, 2-错误, 3-部分正确, 4-放弃作答, 99-未判题 |
| answer_duration | 答题耗时（毫秒） | |
| evaluation_type | 判题类型 | 1-系统判题, 2-自评判题 |
| study_type | 学习类型 | |
| study_type_name | 学习类型名称 | |
| answer_mode_name | 作答方式名称 | |
| knowledge_id | 知识点 ID | 外键，可关联知识点维度表 |
| knowledge_name | 知识点名称 | |
| level_tag | 学生 IRT 学科能力分层 | S+/S/A/B/C |
| school_name | 学校名称 | |
| result_count | KT 预测结果数 | |
| question_probability | KT 预测结果值 | 策略选取后的预测值 |

## 常用查询

```sql
-- 分析推题准确性
SELECT 
    level_tag,
    COUNT(*) AS total_count,
    SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) AS correct_count,
    AVG(question_probability) AS avg_probability
FROM dwd_kt_rec_answer_record_flow_di
WHERE ds BETWEEN '20240101' AND '20240107'
  AND answer_result IN (1, 2)
GROUP BY level_tag
```
