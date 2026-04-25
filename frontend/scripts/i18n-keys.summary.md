<!-- frontend/scripts/i18n-keys.summary.md -->
# i18n 抽取摘要 · T-001a

- 生成时间: 2026-04-24T13:15:27.188Z
- 扫描 root: `src/v2`
- 扫描文件: 165 · 硬编码(bare): **38** · 已 t() 包裹: 2343 · 去重文本: 16

## Top 文件（bare 命中数）

| 文件 | 命中 |
| --- | ---: |
| `src/v2/layout/navigation.ts` | 26 |
| `src/v2/pages/queries/visual/buildSql.ts` | 7 |
| `src/v2/pages/config/channels/ChannelDetail.tsx` | 1 |
| `src/v2/pages/config/subscriptions/SubscriptionDetail.tsx` | 1 |
| `src/v2/pages/data/DatasetDetail.tsx` | 1 |
| `src/v2/pages/semantic/domains/DomainCanvas.tsx` | 1 |
| `src/v2/pages/semantic/relations/RelationCanvas.tsx` | 1 |

## Top 文本（去重高频）

| 文本 | 次数 |
| --- | ---: |
| 数据 | 8 |
| 应用 | 7 |
| 语义 | 6 |
| 系统 | 5 |
| ${channel.name} · ${t('channel.titleSuffix', '渠道')} | 1 |
| ${subscription.name} · ${t('subscriptionDetail.titleSuffix', '订阅')} | 1 |
| · ${t('datasetDetail.profile.rowCount', '共 {n} 行', { n: rowCount.toLocaleString() })} | 1 |
| -- 请选择数据集 | 1 |
| 未选择数据集 | 1 |
| 文件型数据集暂不支持可视化构建；请在 QueryConsole 手工编辑 SQL | 1 |
| -- 数据集 "${dataset.dataset_name}" 未绑定物理表 | 1 |
| 数据集缺少 physical_table | 1 |
| 未勾选任何字段；当前以 SELECT * 生成 | 1 |
| 筛选"${rule.field}"的值不完整，已跳过 | 1 |
| ${t('nav.domain', '数据域')} · ${domain.name} | 1 |

> 候选 key 请在 T-001b 人工评审：按 domain.action.modifier 命名。
