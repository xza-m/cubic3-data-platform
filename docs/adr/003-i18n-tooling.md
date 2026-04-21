<!-- docs/adr/003-i18n-tooling.md -->

# ADR-003: i18n 工具选型

- **状态**：proposed
- **决策日期**：TBD（W2 完成）
- **决策人**：FE Lead
- **关联 plan**：[03 §6.2](../superpowers/plans/2026-04-20-platform-redesign/03-cross-cutting-concerns.md)

## 背景

本期不做完整翻译，但要求所有用户可见字符串通过 `t('key', 'fallback')` 包装，
便于未来插入翻译。需选定支撑这个 t() 的实现。

## 选项

  | 选项 | 优 | 劣 |
  | --- | --- | --- |
  | react-i18next | 业界标准，未来若全量翻译切换平滑 | 包大小（~30KB），本期暂不需要复杂特性 |
  | 自建轻量 t() | 极小（<1KB），完全可控 | 切换 react-i18next 时 API 需迁移 |
  | format-message | 标准化（ICU MessageFormat） | 学习成本 |

## 决策

倾向自建轻量 t()，签名贴近 react-i18next，未来可平滑切换。
本期 API：

```ts
t(key: string, fallback?: string, vars?: Record<string, string | number>): string
```

待 FE Lead W2 末定。

## 影响

- 代码：`frontend/src/v2/i18n/`
- 后续：若全量翻译，再做正式选型

## 参考资料

- [react-i18next](https://react.i18next.com/)
- [format-message](https://github.com/format-message/format-message)
