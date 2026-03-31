## Design Context

### Users
CUBIC3 的核心使用者是数据建模工程师、BI 开发和数据产品经理。它们通常在企业数据平台的工作台场景中使用语义中心，目标不是浏览页面，而是高频完成语义建模、指标治理、对象排查和定义确认。

语义中心承载的核心任务包括：
- 开发和治理 Cube
- 搭建和维护领域模型
- 查询和确认指标定义

### Brand Personality
品牌气质应体现为：专业、分析、清晰。

界面需要传递的情绪不是“炫技”或“营销感”，而是可信、克制、现代、可判断。用户进入页面后应快速理解当前对象、当前状态和下一步动作，感受到这是一套面向现代数据栈的数据工作台。

### Aesthetic Direction
整体视觉方向参考 Cube.js 和 dbt Cloud，但不直接复制它们的界面模式。平台整体统一采用浅色、专业、分析型的工作台基线；语义中心是这套基线里最完整的工作台场景，但不代表全平台都必须套用相同的双栏或三栏布局。平台默认应保持单主区，只有在语义建模、关系编辑、调试分析这类任务明确需要对象检查与上下文时，才引入 Inspector。

明确的反方向包括：
- 毛玻璃卡片风
- 无谓的卡片堆叠
- 传统 CRUD 式列表预览
- 过度流程图化的工作流设计

### Design Principles
1. 任务优先：优先表达当前对象、当前状态和下一步动作，不用营销文案或装饰性模块分散注意力。
2. 主区优先：平台页面默认保持单主区，列表、详情、结果和动作都应围绕主区组织；只有任务明确需要对象检查、关系编辑或调试上下文时，才允许加入 Inspector。
3. 结构清晰：用稳定的页头、上下文条和主工作区建立一致层级，减少认知切换；不要把语义层的双栏/三栏工作台误用成全平台通用模板。
4. 专业克制：避免无意义渐变、玻璃态和卡片堆叠，用更精确的排版、间距和状态色体现现代感。
5. 分析导向：让列表、建模画布、Inspector 和调试结果都服务于判断、排查和治理，而不是服务于展示。
6. 作用域分离：语义中心基于现有 `Semantic workbench` 组件与路由结构推进，但这套经验只直接约束语义页与明确的工作台页面，不外推为全平台默认布局。

### Page Model Baseline v1.0
平台页面只允许以下 5 类页面模型，并按任务决定布局，不按历史页面习惯决定布局。

1. `Overview`
- 用途：解释模块职责、展示整体状态
- 默认布局：单主区
- 禁止：右侧状态区、推荐路径、入口卡矩阵

2. `Inventory`
- 用途：找对象、筛对象、判断状态、进入处理
- 默认布局：单主区
- 允许：选中后临时出现轻量预览
- 禁止：默认常驻右侧大详情区、卡片矩阵、传统 CRUD 详情布局

3. `Studio`
- 用途：编辑单个对象
- 默认布局：主区 + 可持续摘要区
- 允许：右侧 Inspector

4. `Canvas`
- 用途：关系建模、节点和边编辑
- 默认布局：左资源 + 中画布 + 右 Inspector

5. `Developer Workbench`
- 用途：文件、编译、调试、同步治理
- 默认布局：左资源树 + 中 workspace
- 说明：只有任务明确需要持续调试上下文时，才额外引入 Inspector，不能为了“像 workbench”默认加右栏

### Layout Mapping Guardrail v1.0
后续改页面时先归类页面模型，再决定布局。默认判断规则如下：

- `/login`：单主区
- `/dashboard`：`Overview`，单主区
- `/datasources`：`Inventory`，单主区
- `/datasets`：`Inventory`，单主区
- `/queries/visual-builder`：`Studio`，单主区工作区优先，内联摘要，不默认右栏
- `/data-chat`：`Developer Workbench / Analysis Workspace`，左会话 + 中主区，不默认右栏
- `/semantic/overview`：`Overview`，单主区
- `/semantic/cubes`：`Inventory`，单主区，选中后可出轻预览
- `/semantic/cubes/new`：`Studio`，左步骤 + 中任务 + 右摘要
- `/semantic/cubes/:name/edit`：`Studio`，左步骤 + 中任务 + 右摘要
- `/semantic/domains`：`Inventory`，目录/资源树 + 中主区，可保留轻摘要，但不能压缩主区
- `/semantic/modeling`：`Overview + Entry`，单主区或双区入口，不默认右栏
- `/semantic/domains/:id`：`Canvas`，左资源 + 中画布 + 右 Inspector
- `/semantic/tools`：`Developer Workbench`，左资源树 + 中 workspace，可按任务引入 Inspector

### Anti-Drift Rules
- 不要因为页面属于语义层就默认套双栏或三栏工作台。
- 不要为了复用组件而牺牲页面主任务，布局必须服从任务类型。
- 任何新增页面都必须先明确页面模型，再允许进入视觉与实现阶段。
