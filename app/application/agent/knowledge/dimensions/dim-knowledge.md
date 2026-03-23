# 知识点维度表

## 基础信息

| 项目 | 说明 |
|------|------|
| 表名 | dim_question_all_tree_info_df |
| 实体对象 | 知识点节点 |
| 表类型 | 每日全量快照 |
| 分区字段 | ds（业务日期） |

## 业务定义

基础树与业务树结构关系。

## 使用说明

查询对应树类型即可：
- 如果要查节点，使用 `node_id` 关联知识点 ID
- 如果要查根节点，需要添加 `node_level = 0` 限制

```sql
-- 查询某个知识点的详情
SELECT node_id, node_name, node_path, subject_name
FROM dim_question_all_tree_info_df
WHERE ds = MAX_PT('dim_question_all_tree_info_df')
  AND node_id = '123456'

-- 查询所有根节点
SELECT tree_id, node_name, subject_name
FROM dim_question_all_tree_info_df
WHERE ds = MAX_PT('dim_question_all_tree_info_df')
  AND node_level = 0
```

## 关联关系

| 关联表 | 关联字段 | 说明 |
|--------|----------|------|
| dwd_question_snapshot | node_id IN base_tree_node_ids | 知识点关联的题目 |
| dwd_study_sessions_snap_f | knowledge_id | 学习会话关联的知识点 |
| dwd_study_first_answer_records_snap_di | knowledge_id | 答题记录关联的知识点 |

## 核心字段

| 字段名 | 字段含义 | 说明 |
|--------|----------|------|
| tree_type | 树类型 | base（基础树）/ biz（业务树） |
| tree_id | 树 ID | **主键**，基础树 ID 或业务树 ID |
| node_id | 节点 ID | |
| node_name | 节点名称 | |
| parent_node_id | 父节点 ID | |
| node_level | 节点层级 | 0 为根节点 |
| sibling_order | 兄弟节点排序 | |
| root_node_id | 根节点 ID | |
| node_path | 节点路径 | 从根到当前节点 |
| node_id_path | 节点 ID 路径 | 从根到当前节点 |
| ancestor_node_ids | 所有祖先节点 ID | |
| descendant_count | 子孙节点总数 | |
| direct_child_count | 直接子节点数量 | |
| child_node_ids | 直接子节点 ID 列表 | |
| child_node_names | 直接子节点名称列表 | |
| is_leaf | 是否叶子节点 | |
| base_tree_id | 关联的基础树 ID | |
| base_tree_node_ids | 关联基础树节点 ID 列表 | |
| difficulty | 难度等级 | 业务树特有 |
| base_tree_name | 基础树名称 | |
| base_tree_version | 基础树版本 | |
| phase | 学段 ID | |
| phase_name | 学段名称 | |
| subject | 学科 ID | |
| subject_name | 学科名称 | |
| create_time | 创建时间 | |
| update_time | 更新时间 | |

## 常用过滤条件

```sql
-- 基础树
WHERE tree_type = 'base'

-- 业务树
WHERE tree_type = 'biz'

-- 叶子节点
WHERE is_leaf = true

-- 指定学科
WHERE subject_name = '数学'
```
