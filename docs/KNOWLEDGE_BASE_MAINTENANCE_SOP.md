---
doc_type: sop
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-03-24
---

# 知识库日常维护 SOP

本 SOP 用于规范 `docs/` 作为项目级知识库的日常清洗、校验和更新流程。
目标不是“每天重写文档”，而是保证知识库持续满足以下要求：

- 当前基线文档能描述当前仓库
- PRD、设计稿、实施记录各自归位
- 主要入口和链接长期可用
- 历史文档不会继续污染当前知识入口

## 1. 适用范围

本 SOP 适用于以下内容：

- 根 `README.md`
- `AGENTS.md`
- `frontend/README.md`
- `docs/` 下所有 Markdown 文档
- `.github/workflows/docs-health.yml`
- `scripts/check_docs_health.py`

## 2. 触发方式

### 自动触发

- GitHub Actions 每天执行一次文档健康检查
- 触发文件：`.github/workflows/docs-health.yml`

### 手动触发

适用于以下场景：

- 大范围文档整理后
- 架构、路由、脚本、端口发生变化后
- 默认命令、验证入口或工作流变化后
- 新增 PRD、专题文档或归档目录后

命令：

```bash
python scripts/check_docs_health.py --scope all
make docs-impact
```

## 3. 每日执行步骤

### Step 1：运行健康检查

执行：

```bash
python scripts/check_docs_health.py --scope all
```

通过标准：

- 返回码为 `0`
- 输出包含“结果：通过”

### Step 2：问题分类

如果检查失败，先分类，不要直接到处改文档。

按下面顺序处理：

1. **基线文档错误**
   - 例如启动命令、端口、路由、目录、技术栈已经与代码不一致
   - 优先级最高，必须当天修复
2. **链接失效**
   - 相对路径错误
   - 已删除文件的遗留引用
   - 锚点不存在
3. **入口索引缺失**
   - 新增目录没有 `README.md`
   - 新增高价值文档未出现在 `docs/readme.md`、`docs/prd/README.md`、`docs/archive/README.md` 等索引页
4. **历史文档污染入口**
   - 旧迁移文档被放进当前基线推荐阅读
   - 设计草稿混入首页
5. **低价值归档膨胀**
   - 重复 summary / report / fix 文档过多
   - 需要降权、合并或移出导航
6. **替代关系未处理**
   - 旧文档已被新入口取代，但未归档
   - 旧文档仍保留 `current` 状态，或仍出现在默认导航

### Step 3：修复规则

#### 3.1 修当前基线，不修历史幻想

如果当前代码和文档冲突：

- 先修基线文档
- 不要为了保住旧文档去扭曲当前说明

优先更新：

- `README.md`
- `docs/readme.md`
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
- `docs/QUICK_START.md`
- `docs/STARTUP_GUIDE.md`
- `docs/DOC_ALIGNMENT_REPORT.md`
- `frontend/README.md`

#### 3.2 修历史文档时的规则

- 能修成正确链接的，直接修
- 文档已不存在但有替代入口的，改为替代入口
- 文档已不存在且无替代价值的，去掉链接，保留说明文字
- 旧文档如果已不适合作为现状依据，必须补“状态”说明

#### 3.3 新增文档时必须同步

新增任意高价值文档后，至少同步检查：

- `docs/readme.md`
- 对应目录的 `README.md`
- `docs/KNOWLEDGE_BASE_GOVERNANCE.md`

#### 3.4 按触发器补文档

- 改默认命令、验证入口、开发工作流：至少更新 `docs/quality/testing.md` 或 `docs/runbooks/local-dev.md`
- 改评审规则或拒绝条件：至少更新 `docs/quality/review.md`
- 改行为边界、source of truth、模块职责：至少更新 `docs/architecture/`、ADR 或相关基线文档
- 旧文档被替代：必须归档，或标 `status: superseded` 并移出默认导航

## 4. 决策矩阵

### 文档属于哪一类

- **当前基线**
  - 描述当前系统是什么、怎么跑、怎么验证
- **PRD / 设计输入**
  - 描述为什么做、目标和边界是什么
- **历史归档**
  - 描述过去怎么改、为什么留下这些结构

### 历史文档是否继续保留在导航中

- **保留在导航**
  - 能帮助理解关键架构演进
  - 能解释当前技术债来源
  - 能辅助后续大改造
- **只保留在目录中，不主动推荐**
  - 单次修复总结
  - 阶段性验证报告
  - 重复的 complete / success / summary 文档
- **考虑删除或合并**
  - 无链接价值
  - 内容重复严重
  - 已无法映射到当前仓库，也无法解释历史决策

## 5. 完成标准

每日维护完成后，应满足：

- `python scripts/check_docs_health.py --scope all` 通过
- 高风险工作流或运行入口改动时，`make docs-impact` 通过
- 当前基线文档没有明显过期信息
- 新增高价值文档已经进入对应索引
- 历史文档没有继续混入当前入口
- 被替代的旧文档已归档，或已显式标记 `superseded`

## 6. 周度与月度补充动作

### 每周

- 复核 `docs/readme.md` 的推荐阅读顺序是否仍合理
- 复核 `docs/prd/README.md` 中的状态说明是否需要调整
- 复核 `docs/archive/README.md` 和月度归档 README 是否需要降权新文档

### 每月

- 清理一次归档导航，把低价值 summary / report 降权
- 抽查 3 到 5 篇高价值历史文档，确认仍能解释当前代码来源
- 审核是否有新的“事实”还停留在 PRD 或设计稿里，未沉淀回基线文档
- 抽查关键基线文档的 `owner`、`status`、`last_reviewed` 是否仍有效

### 每次较大流程变更后

- 追加一次轻量文档 review
- 优先复核 `docs/quality/testing.md`、`docs/quality/review.md`、`docs/runbooks/local-dev.md`

## 7. 推荐输出模板

如果当天做了人工维护，建议记录：

```markdown
# 知识库维护记录

- 日期：
- 触发方式：自动 / 手动
- 检查命令：`python scripts/check_docs_health.py --scope all`
- 发现问题：
- 已修复：
- 待后续处理：
```

## 8. 相关文档

- [知识库治理规范](KNOWLEDGE_BASE_GOVERNANCE.md)
- [文档中心](readme.md)
- [PRD 目录](prd/README.md)
- [历史归档目录](archive/README.md)
