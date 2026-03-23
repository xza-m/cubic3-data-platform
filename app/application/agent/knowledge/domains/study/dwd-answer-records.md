# 学生答题记录事实表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dwd_study_first_answer_records_snap_di |
| 分区字段 | answer_date（答题日期） |
| 表类型 | delta table |

## 业务定义

观察学生答题情况的核心依据。

## 使用说明

`answer_date` 为学生完成作答提交日期，学生未完成的答题记录均归档在 99991231 分区。

该表采用 delta 表类型，支持事务变更、MVCC，经过 MC 的 MOR 以达到读时一致性。

**使用场景**：学生重要学习行为分析、学生刷题反作弊检测、学情分析。

**当前问题**：服务端某些行为会导致 answer_time 的变更。

```sql
SELECT 
    student_id,
    question_id,
    answer_result,
    answer_duration,
    study_type_name
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '20240101' AND '20240107'
  AND answer_result IN (1, 2)  -- 正确或错误
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_study_sessions_snap_f | study_session_id | 关联会话信息 |
| dwd_question_snapshot | question_id | 关联题目维度 |
| dim_ucenter_user_student_df | student_id | 学生维度 |
| dim_question_all_tree_info_df | knowledge_id | 知识点维度 |
| dwd_kt_rec_answer_record_flow_di | recommend_id | 推题策略关联 |
| dim_pub_meta_dict_df | study_type, answer_mode | 元数据枚举 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| answer_record_id | 答题记录 ID | **主键** |
| study_session_id | 学习会话 ID | 会话外键 |
| question_id | 题目 ID | 题目外键 |
| student_id | 学生 ID | 学生外键 |
| student_answer | 学生答案 | |
| answer_result | 答题结果 | 0-未作答, 1-正确, 2-错误, 3-部分正确, 4-放弃作答, 99-未判题 |
| answer_duration | 答题耗时（毫秒） | |
| question_difficulty | 题目难度 | 1-5，数字越大难度越高 |
| correct_combo_count | 连答正确次数 | |
| answer_time | 答题时间 | |
| mastery_change | 掌握度变化信息 | JSON 字段 |
| answer_type | 答案类型 | 1-文本, 2-图片, 3-视频, 4-音频 |
| evaluation_type | 判题类型 | 1-系统判题, 2-自评判题 |
| answer_count | 答题次数 | |
| exercise_index | 练习次序 | |
| subject_id | 学科 ID | |
| subject_name | 学科名称 | |
| phase_id | 学段 ID | |
| phase_name | 学段名称 | |
| study_type | 学习类型 | |
| study_type_name | 学习类型名称 | |
| knowledge_id | 知识点 ID | |
| knowledge_name | 知识点名称 | |
| question_type | 题目类型 | |
| answer_mode | 作答方式 | |
| answer_mode_name | 作答方式名称 | |
| recommend_id | 推题策略 ID | 可关联推题事实表 |
| answer_flag | AI 批改标签 | 1-AI 批改, 17-AI 批改受限 |

## 答题结果说明

| answer_result | 说明 |
|---------------|------|
| 0 | 未作答 |
| 1 | 正确 |
| 2 | 错误 |
| 3 | 部分正确 |
| 4 | 放弃作答 |
| 99 | 未判题 |

## 常用查询

```sql
-- 统计某学生的答题正确率
SELECT 
    student_id,
    COUNT(*) AS total_count,
    SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) AS correct_count,
    ROUND(SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '20240101' AND '20240107'
  AND answer_result IN (1, 2)  -- 仅统计已判题的
GROUP BY student_id
```
