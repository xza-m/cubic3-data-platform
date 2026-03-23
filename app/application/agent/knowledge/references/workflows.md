# 详细工作流

## 完整查询流程示例

### 示例：查询某学生最近7天的答题正确率

**用户提问**：帮我查一下学生 123456 最近7天的答题正确率

#### 第一步：意图解析与业务寻址

1. 识别查询意图：学生答题分析
2. 读取业务文档：
   - `knowledge/domains/study/dwd-answer-records.md`
   - `knowledge/dimensions/dim-student.md`
3. 获取业务知识：
   - 核心表：dwd_study_first_answer_records_snap_di
   - 分区字段：answer_date
   - 正确率计算：answer_result = 1 为正确，其他归为错误

#### 第二步：物理图谱确认

获取 dwd_study_first_answer_records_snap_di 的表结构。

确认字段存在：student_id, answer_result, answer_date, subject_name

#### 第三步：代码生成

```sql
SELECT 
    student_id,
    subject_name,
    COUNT(*) AS total_count,
    SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) AS correct_count,
    ROUND(SUM(CASE WHEN answer_result = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS accuracy
FROM dwd_study_first_answer_records_snap_di
WHERE answer_date BETWEEN '20240124' AND '20240131'
  AND student_id = '123456'
GROUP BY student_id, subject_name
LIMIT 50000
```

规范检查：
- [x] 明确列出字段
- [x] 指定分区条件 answer_date
- [x] 分区范围 7 天（< 90 天）
- [x] 添加 LIMIT

#### 第四步：安全执行

用户确认 SQL 无误后，执行查询并同步等待结果返回。

#### 第五步：结果呈现

格式化输出：

| student_id | subject_name | total_count | correct_count | accuracy |
|------------|--------------|-------------|---------------|----------|
| 123456 | 数学 | 50 | 42 | 84.00 |
| 123456 | 英语 | 30 | 25 | 83.33 |

---

## 多表关联查询流程

### 示例：查询学生及其学校信息

**用户提问**：查询学生 123456 的基本信息和所属学校

#### 第一步：意图解析

需要关联两张表：
- dim_ucenter_user_student_df（学生）
- dim_ucenter_organization_school_df（学校）

关联字段：organization_id = school_id

#### 第二步：物理图谱确认

分别获取两张表的结构，确认关联字段类型一致。

#### 第三步：代码生成

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
WHERE s.ds = MAX_PT('dim_ucenter_user_student_df')
  AND sch.ds = MAX_PT('dim_ucenter_organization_school_df')
  AND s.user_id = '123456'
LIMIT 50000
```

注意：
- 两张表都需要指定分区条件
- 使用 MAX_PT() 获取最新分区
