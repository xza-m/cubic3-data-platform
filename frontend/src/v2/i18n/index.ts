// frontend/src/v2/i18n/index.ts
// 极简 i18n 实现 —— 中文单语言。
//
// 设计约束：
// - 产品收敛为中文单语言；不维护 en.json，也没有运行时语言切换
// - 所有用户可见字符串仍走 t(key, fallback?)，保留键值层以统一文案治理
// - 默认查 zh.json，找不到回退到 fallback，再回退到 key 本身
// - 静态 key 必须存在于 zh.json（scripts/i18n-keys-check.mjs 在 make lint 中校验）
// - vars 支持 {name} 模板替换；时间/数字格式化用 Intl，不在此处处理
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
