// frontend/src/v2/i18n/index.ts
// 极简 i18n 实现。
//
// 设计约束（§03 §6.2）：
// - 本期不做完整翻译，但所有用户可见字符串走 t(key, fallback?)
// - 默认查 zh.json，找不到回退到 fallback，再回退到 key 本身
// - vars 支持 {name} 模板替换
// - 时间/数字格式化用 Intl，不在此处处理
//
// TODO(round-2): 接入完整 i18n（react-i18next 或等价方案），当前仅为 ADR 占位
import zhDict from './zh.json'

type Dict = Record<string, string>

const dict: Dict = zhDict as Dict

/**
 * 获取国际化文案。
 * @param key - i18n key
 * @param fallback - key 不存在时的兜底文案
 * @param vars - 模板变量 { name: '张三' } 替换 {name}
 */
export function t(key: string, fallback?: string, vars?: Record<string, string | number>): string {
  let text = dict[key] ?? fallback ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}
