---
name: dw-query
description: 使用自然语言查询 GIL 数仓数据。支持学生学习行为分析、答题效果分析、能量发放分析等场景。当用户询问学生、答题、学习进度、能量、知识点掌握度等数据时使用。
---

# GIL 数仓自然语言查询

## 前置能力

本 Skill 需要运行环境提供以下能力：

- **读取文件**：能读取 knowledge/ 目录下的 Markdown 文档
- **查询表结构**：能获取 MaxCompute 表的字段名、数据类型、分区信息
- **搜索表列表**：能按前缀搜索 MaxCompute 表
- **执行 SQL**：能执行只读 SQL 查询并同步等待结果返回
- **导出结果**：能将查询结果导出为 CSV 文件

## 五步工作流

### 第一步：意图解析与业务寻址

根据用户查询定位业务知识文档：

| 查询类型 | 文档路径 |
|---------|----------|
| 学生基础信息 | knowledge/dimensions/dim-student.md |
| 学校信息 | knowledge/dimensions/dim-school.md |
| 题目信息 | knowledge/dimensions/dim-question.md |
| 知识点信息 | knowledge/dimensions/dim-knowledge.md |
| 课程信息 | knowledge/dimensions/dim-course.md |
| 学生能力分层 | knowledge/dimensions/dim-student-ability.md |
| 学习会话 | knowledge/domains/study/dwd-study-sessions.md |
| AI课学习进度 | knowledge/domains/study/dwd-lesson-progress.md |
| 答题分析 | knowledge/domains/study/dwd-answer-records.md |
| 推题效果 | knowledge/domains/study/dwd-kt-recommend.md |
| 问一问分析 | knowledge/domains/study/dwd-lesson-qa.md |
| 能量分析 | knowledge/domains/study/dwd-energy-detail.md |
| AI课组件学习进度 | knowledge/domains/study/dwd-lesson-widget.md |
| 枚举值/字典翻译 | knowledge/dimensions/dim-meta-dict.md |
| 查询规范 | knowledge/guides/query-rules.md |
| 查询模板 | knowledge/guides/query-templates.md |
| 表关联关系 | knowledge/guides/table-relationships.md |

**输出**：业务含义、关联关系、查询模板

### 第二步：物理图谱确认

获取目标表的技术元数据，确认字段名、数据类型、分区字段与知识文档一致。
如果用户未指定具体表名，可按前缀搜索表列表来定位。

**输出**：确认后的字段清单和分区信息

### 第三步：代码生成（必须展示，等待确认）

结合业务知识 + 技术元数据生成 SQL。**必须将 SQL 和规范检查结果展示给用户，获得确认后才能进入第四步。**

展示格式：
1. 完整 SQL 代码块
2. 逐项勾选的规范检查清单
3. 询问用户确认或修改

**规范检查清单**:
- [ ] 禁止 SELECT *（必须明确列出字段）
- [ ] 分区表必须添加分区条件
- [ ] 分区范围不超过 90 天
- [ ] 未指定 LIMIT 时添加 LIMIT 50000
- [ ] 禁止 DROP/DELETE/TRUNCATE/ALTER/INSERT/UPDATE

### 第四步：安全执行

用户确认 SQL 无误后，执行查询并同步等待结果返回。

### 第五步：结果呈现

- 小数据量（20 行以内）：格式化为 Markdown 表格直接展示
- 大数据量或导出需求：导出为 CSV 文件，存放在 output/ 目录下

## 查询规范与模板

分区表清单、豁免表、查询规范详见 [knowledge/guides/query-rules.md](knowledge/guides/query-rules.md)

查询模板详见 [knowledge/guides/query-templates.md](knowledge/guides/query-templates.md)

## 详细参考

- [工作流详解](references/workflows.md) - 完整五步流程示例
