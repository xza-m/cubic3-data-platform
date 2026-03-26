# Phase 2: 语义对象生命周期与领域目录 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 2-语义对象生命周期与领域目录
**Areas discussed:** 对象定位与正式度, 生命周期状态心智, 领域归属真相, 领域目录角色, View 并入力度, Recipe 最低可用

---

## 对象定位与正式度

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 只把 `Cube / Domain` 做成正式建模对象，`View / Recipe` 保持资源浏览和 YAML 维护。 | |
| `B` | `View` 做成正式对象，`Recipe` 做成轻量消费对象。 | |
| `Other` | `Cube` 和 `Domain` 做成正式建模对象，`View` 定位为特殊 `Cube`，`Recipe` 作为轻量消费对象。 | ✓ |

**User's choice:** `Cube` 和 `Domain` 做成正式建模对象，`View` 的定位是一种特殊的 `Cube`，也可以直接集成自 `Cube`；`Recipe` 作为轻量消费对象即可。  
**Notes:** 不接受四类对象完全同级推进，Phase 2 的重心必须放在 `Cube / Domain` 的正式建模与治理上。

---

## 生命周期状态心智

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | `Cube / View / Domain / Recipe` 尽量强统一成一套底层状态。 | |
| `B` | 统一展示心智，底层状态允许分化。 | ✓ |
| `C` | 各对象各自一套，只要页面里能看懂即可。 | |

**User's choice:** `B`  
**Notes:** 用户接受 `Domain` 保留治理语义，`Recipe` 只要最小状态表达，但展示层最好能让人感知成一套统一生命周期心智。

---

## 领域归属真相

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | `Cube.domain_id` 是主真相，`Domain.cubes[]` 主要是推导结果。 | |
| `B` | `Domain.cubes[]` / 领域画布是主真相，`Cube.domain_id` 只是投影字段。 | |
| `Other` | 领域画布是真相，`Cube` 和 `Domain` 是多对多关系，没有主领域。 | ✓ |

**User's choice:** `Domain.cubes[]` / 领域画布是主真相，`Cube.domain_id` 只是投影字段；`Cube` 和领域是多对多关系，没有主次之分。  
**Notes:** 用户特别指出一个 `Cube` 可以被多个领域引用；同一领域也可能基于不同 join 语义多次引用同一个 `Cube`，但不要求本阶段立即支持后者的数据模型。

---

## 同一领域重复引用同一 Cube

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | Phase 2 只支持跨领域多对多；同一领域内重复实例化同一个 `Cube` 先不做。 | ✓ |
| `B` | Phase 2 就支持同一领域内重复实例化同一个 `Cube`。 | |
| `C` | 先允许多个 join 指向同一个 `Cube`，但不做真正的重复实例。 | |

**User's choice:** `A`  
**Notes:** 用户认可这是后续 join 建模增强问题，不让它拖宽 Phase 2 范围。

---

## 领域目录角色

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 目录主要做治理看板，操作入口适度下沉到详情/画布。 | ✓ |
| `B` | 目录既是治理看板，也是主要操作入口。 | |
| `C` | 目录偏资源发现页，治理和状态感放弱。 | |

**User's choice:** `A`  
**Notes:** 不希望把所有生命周期动作都堆在目录页上，目录应主要承担治理、搜索、发现和状态概览角色。

---

## View 并入力度

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 只在信息架构和展示层并入 `Cube` 体系，底层对象模型与 API 暂不大动。 | ✓ |
| `B` | 连接口和维护入口也开始统一，用户侧更多看到一个统一语义对象体系。 | |
| `C` | 先不做并入，只保留方向判断。 | |

**User's choice:** `1A`  
**Notes:** 用户接受 Phase 2 先做展示层整合，不在本阶段强推底层对象模型统一。

---

## Recipe 最低可用

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 有列表、详情或定义入口、关联 `Cube` 展示、基础状态或标签即可。 | ✓ |
| `B` | 在 `A` 基础上，再补创建/编辑入口。 | |
| `C` | 继续只保留资源树和 YAML 视图，不单独补齐。 | |

**User's choice:** `2A`  
**Notes:** `Recipe` 继续维持轻量消费对象定位，不扩成重型建模器。

---

## the agent's Discretion

- `domain_id` 投影字段如何在列表、详情和 API 中兼容呈现。
- `View` 在工作台导航、列表分组和详情卡片中的具体整合方式。
- `Recipe` 的最小状态标签和详情信息密度。
- 领域目录 lens、排序和健康摘要的具体表达。

## Deferred Ideas

- 同一领域内重复实例化同一个 `Cube` 并支持不同 join 条件，延后到后续 join 建模增强阶段。
- 把 `View` 在底层对象模型和 API 层完全并入 `Cube`，当前只作为方向保留。
- `Recipe` 的复杂编辑器、审批流和版本治理不纳入 Phase 2。

---

*Phase: 02-semantic-object-lifecycle-and-domain-directory*
*Discussion log generated: 2026-03-25*
