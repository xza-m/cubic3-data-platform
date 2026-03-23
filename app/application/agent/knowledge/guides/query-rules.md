# 查询规范

## 强制规则

### 1. 禁止 SELECT *

**规则**：必须明确列出需要的字段，禁止使用 `SELECT *`

**原因**：
- 避免不必要的数据传输
- 明确数据需求，便于审计
- 防止表结构变更导致的意外问题

**错误示例**：
```sql
SELECT * FROM dim_ucenter_user_student_df WHERE ds = MAX_PT('dim_ucenter_user_student_df')
```

**正确示例**：
```sql
SELECT user_id, user_name, user_grade_name, organization_id
FROM dim_ucenter_user_student_df
WHERE ds = MAX_PT('dim_ucenter_user_student_df')
```

### 2. 分区表必须指定分区条件

**规则**：查询分区表时，必须在 WHERE 条件中指定分区字段

**原因**：
- 避免全表扫描
- 控制查询成本
- 提高查询效率

**分区表清单**：

| 表名 | 分区字段 |
|------|----------|
| dim_ucenter_user_student_df | ds |
| dim_ucenter_organization_school_df | ds |
| dwd_question_snapshot | ds |
| dim_question_all_tree_info_df | ds |
| dim_pub_student_subject_insight_df | ds |
| dim_pub_meta_dict_df | ds |
| dwd_study_first_answer_records_snap_di | answer_date |
| dwd_study_lesson_progress_snap | create_date |
| dwd_study_lesson_widget_snap | completed_date |
| dwd_study_energy_detail_di | energy_date |
| dwd_kt_rec_answer_record_flow_di | ds |
| dwd_study_tbl_study_lesson_qa | ds |

**豁免表**（无分区）：
- dim_course_lesson_snap_f
- dwd_study_sessions_snap_f

**错误示例**：
```sql
SELECT user_id, user_name FROM dim_ucenter_user_student_df
```

**正确示例**：
```sql
SELECT user_id, user_name
FROM dim_ucenter_user_student_df
WHERE ds = MAX_PT('dim_ucenter_user_student_df')
```

### 3. 分区范围限制

**规则**：分区范围不超过 90 天

**原因**：
- 控制查询成本
- 避免超时

**错误示例**：
```sql
SELECT * FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '20230101' AND '20240101'  -- 超过90天
```

**正确示例**：
```sql
SELECT student_id, answer_result
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '20240101' AND '20240331'  -- 90天内
```

### 4. 结果集限制

**规则**：未指定 LIMIT 时，自动添加 LIMIT 50000

**原因**：
- 防止结果集过大
- 保护客户端内存

**建议**：
- 明确知道需要多少数据时，指定具体 LIMIT
- 聚合查询可适当放宽 LIMIT

### 5. 禁止危险操作

**规则**：禁止 DROP、DELETE、TRUNCATE、ALTER、INSERT、UPDATE 操作

**原因**：
- 数据安全
- 仅支持查询操作

## 推荐规则

### 1. 使用 MAX_PT() 获取最新分区

对于按 `ds` 分区的维度表，使用 `MAX_PT()` 获取最新分区：

```sql
SELECT user_id, user_name
FROM dim_ucenter_user_student_df
WHERE ds = MAX_PT('dim_ucenter_user_student_df')
```

### 2. 排除测试数据

查询学生或学校数据时，建议排除测试数据：

```sql
-- 排除测试学生
WHERE user_is_test = 1

-- 排除测试学校
WHERE school_is_test = 1
```

### 3. 使用有意义的别名

多表关联时使用清晰的别名：

```sql
SELECT 
    s.user_id,
    s.user_name,
    sch.school_name
FROM dim_ucenter_user_student_df s
JOIN dim_ucenter_organization_school_df sch
    ON s.organization_id = sch.school_id
    AND sch.ds = MAX_PT('dim_ucenter_organization_school_df')
WHERE s.ds = MAX_PT('dim_ucenter_user_student_df')
```

### 4. 合理使用聚合

统计分析时使用聚合函数减少数据量：

```sql
SELECT 
    student_id,
    COUNT(*) AS answer_count,
    SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) AS correct_count
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '20240101' AND '20240107'
GROUP BY student_id
```
