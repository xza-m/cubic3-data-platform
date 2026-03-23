# 常用查询模板

## 学生相关

### 查询学生基础信息

```sql
SELECT 
    user_id,
    user_name,
    user_grade_name,
    organization_id
FROM dim_ucenter_user_student_df
WHERE ds = MAX_PT('dim_ucenter_user_student_df')
  AND user_is_test = 1
  AND user_id = '{student_id}'
```

### 查询学生及其学校信息

```sql
SELECT 
    s.user_id,
    s.user_name,
    s.user_grade_name,
    sch.school_name,
    sch.school_edu_level_name,
    sch.school_region_name
FROM dim_ucenter_user_student_df s
JOIN dim_ucenter_organization_school_df sch
    ON s.organization_id = sch.school_id
    AND sch.ds = MAX_PT('dim_ucenter_organization_school_df')
WHERE s.ds = MAX_PT('dim_ucenter_user_student_df')
  AND s.user_is_test = 1
  AND s.user_id = '{student_id}'
```

### 查询学生学科能力

```sql
SELECT 
    student_id,
    subject_name,
    level_tag,
    ability_mean,
    accuracy,
    answer_count
FROM dim_pub_student_subject_insight_df
WHERE ds = MAX_PT('dim_pub_student_subject_insight_df')
  AND student_id = '{student_id}'
```

## 答题分析

### 统计学生答题正确率

```sql
SELECT 
    student_id,
    subject_name,
    COUNT(*) AS total_count,
    SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) AS correct_count,
    ROUND(SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '{start_date}' AND '{end_date}'
  AND student_id = '{student_id}'
GROUP BY student_id, subject_name
```

### 按学习类型统计答题情况

```sql
SELECT 
    study_type_name,
    COUNT(*) AS answer_count,
    SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) AS correct_count,
    ROUND(AVG(answer_duration), 0) AS avg_duration_ms
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '{start_date}' AND '{end_date}'
GROUP BY study_type_name
ORDER BY answer_count DESC
```

### 统计每日答题趋势

```sql
SELECT 
    answer_date,
    COUNT(*) AS answer_count,
    COUNT(DISTINCT student_id) AS student_count,
    ROUND(SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '{start_date}' AND '{end_date}'
GROUP BY answer_date
ORDER BY answer_date
```

## 学习进度

### 统计 AI 课完成情况

```sql
SELECT 
    lesson_id,
    COUNT(*) AS session_count,
    SUM(CASE WHEN completed_widget_count = total_widget_count THEN 1 ELSE 0 END) AS completed_count,
    ROUND(SUM(CASE WHEN completed_widget_count = total_widget_count THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS completion_rate,
    ROUND(AVG(lesson_duration) / 1000 / 60, 2) AS avg_duration_minutes
FROM dwd_study_lesson_progress_snap
WHERE create_date BETWEEN '{start_date}' AND '{end_date}'
GROUP BY lesson_id
ORDER BY session_count DESC
```

### 统计学生学习时长

```sql
SELECT 
    student_id,
    COUNT(DISTINCT study_session_id) AS session_count,
    SUM(lesson_duration) / 1000 / 60 AS total_duration_minutes
FROM dwd_study_lesson_progress_snap
WHERE create_date BETWEEN '{start_date}' AND '{end_date}'
  AND student_id = '{student_id}'
GROUP BY student_id
```

## 能量分析

### 统计能量发放情况

```sql
SELECT 
    event_type,
    COUNT(*) AS record_count,
    SUM(theoretical_energy) AS total_theoretical,
    SUM(actual_granted_energy) AS total_granted,
    SUM(theoretical_energy - actual_granted_energy) AS total_blocked
FROM dwd_study_energy_detail_di
WHERE energy_date BETWEEN '{start_date}' AND '{end_date}'
GROUP BY event_type
ORDER BY total_granted DESC
```

### 分析能量拦截原因

```sql
SELECT 
    reject_reason,
    COUNT(*) AS block_count,
    SUM(theoretical_energy - actual_granted_energy) AS blocked_energy
FROM dwd_study_energy_detail_di
WHERE energy_date BETWEEN '{start_date}' AND '{end_date}'
  AND reject_reason IS NOT NULL
  AND reject_reason != ''
GROUP BY reject_reason
ORDER BY block_count DESC
```

## 知识点分析

### 查询知识点信息

```sql
SELECT 
    node_id,
    node_name,
    node_path,
    subject_name,
    is_leaf
FROM dim_question_all_tree_info_df
WHERE ds = MAX_PT('dim_question_all_tree_info_df')
  AND tree_type = 'base'
  AND node_id = '{knowledge_id}'
```

### 统计知识点答题情况

```sql
SELECT 
    a.knowledge_id,
    a.knowledge_name,
    COUNT(*) AS answer_count,
    SUM(CASE WHEN a.answer_result = 1 THEN 1 ELSE 0 END) AS correct_count,
    ROUND(SUM(CASE WHEN a.answer_result = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
FROM dwd_study_first_answer_records_snap_di a
WHERE a.answer_date BETWEEN '{start_date}' AND '{end_date}'
  AND a.knowledge_id IS NOT NULL
GROUP BY a.knowledge_id, a.knowledge_name
ORDER BY answer_count DESC
```
