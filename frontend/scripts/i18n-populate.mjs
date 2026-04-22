#!/usr/bin/env node
// frontend/scripts/i18n-populate.mjs
//
// Round 4 · T-001d — 把仓库内现存的 `t(key, fallback)` 对扫出来写进 zh.json，
// 并生成相同 key 的 en.json 占位。
//
// 设计：
//   - 只扫 `src/v2/**/*.{ts,tsx}`
//   - 命中 `t('key')` / `t("key")` / `t(\`key\`)`，若存在 fallback（字符串
//     字面 / 模板字符串），把 fallback 作为 zh.json 的值
//   - key 校验：正则 ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$
//   - zh.json 已有 key 不覆盖（以现存值为准，避免脚本覆盖人工调整）
//   - en.json：同 key，值留空串 `""`（CI 会把它当作"待翻译"）
//   - 冲突时（同 key 多处 fallback 不一致）记日志，以第一次出现为准
//   - 输出：
//       frontend/src/v2/i18n/zh.json  （覆盖写入）
//       frontend/src/v2/i18n/en.json  （覆盖写入）
//       frontend/scripts/i18n-populate.report.md  （人类可读摘要）
//
// 退出码：0 成功；>0 参数/IO 错误

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const SRC = path.join(ROOT, 'src/v2')
const ZH = path.join(SRC, 'i18n/zh.json')
const EN = path.join(SRC, 'i18n/en.json')
const REPORT = path.join(__dirname, 'i18n-populate.report.md')

const KEY_RE = /^[a-z0-9][A-Za-z0-9_]*(\.[a-z0-9][A-Za-z0-9_]*){1,3}$/

// ── helpers ──────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__snapshots__') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

function stripCommentsAndStrings(src) {
  // 先去注释；字符串保留（我们要匹配 t('...', '...')）
  let out = ''
  let i = 0
  let inLine = false
  let inBlock = false
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (inLine) {
      if (c === '\n') {
        inLine = false
        out += c
      }
      i++
    } else if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false
        i += 2
      } else {
        i++
      }
    } else if (c === '/' && n === '/') {
      inLine = true
      i += 2
    } else if (c === '/' && n === '*') {
      inBlock = true
      i += 2
    } else {
      out += c
      i++
    }
  }
  return out
}

// 匹配 t('key', 'fallback') / t("key", "fallback") / t(`key`, `fallback`)
// fallback 可省略；第三参数不关心
const T_RE =
  /\bt\s*\(\s*(['"`])([^'"`\n\r]+?)\1\s*(?:,\s*(['"`])([^'"`\n\r]*?)\3)?\s*(?:,[^)]*)?\)/g

// ── main ─────────────────────────────────────────────────────────────────────

const files = walk(SRC)

const keyFirstFallback = new Map()
const keyConflicts = new Map()
const badKeys = new Set()
let totalHits = 0

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8')
  const clean = stripCommentsAndStrings(raw)
  let m
  T_RE.lastIndex = 0
  while ((m = T_RE.exec(clean))) {
    const key = m[2]
    const fallback = m[4]
    totalHits++
    if (key.includes('${')) {
      // 动态 key（模板字面值）—— 跳过 populate，运行时自然按 key 文本查字典
      continue
    }
    if (!KEY_RE.test(key)) {
      badKeys.add(key)
      continue
    }
    if (!keyFirstFallback.has(key)) {
      keyFirstFallback.set(key, fallback ?? '')
    } else if (fallback && keyFirstFallback.get(key) && keyFirstFallback.get(key) !== fallback) {
      if (!keyConflicts.has(key)) keyConflicts.set(key, new Set([keyFirstFallback.get(key)]))
      keyConflicts.get(key).add(fallback)
    }
  }
}

// merge 现有 zh.json（人工调整优先）
let existing = {}
try {
  existing = JSON.parse(fs.readFileSync(ZH, 'utf8'))
} catch {
  existing = {}
}

const zhNext = { ...existing }
let added = 0
let kept = 0
for (const [key, fb] of keyFirstFallback.entries()) {
  if (key in zhNext && zhNext[key] !== '') {
    kept++
    continue
  }
  if (fb) {
    zhNext[key] = fb
    added++
  }
}

const sortedKeys = Object.keys(zhNext).sort()
const zhSorted = {}
for (const k of sortedKeys) zhSorted[k] = zhNext[k]
fs.writeFileSync(ZH, JSON.stringify(zhSorted, null, 2) + '\n')

// en.json：相同 key，值空串
let enExisting = {}
try {
  enExisting = JSON.parse(fs.readFileSync(EN, 'utf8'))
} catch {
  enExisting = {}
}
const enNext = {}
for (const k of sortedKeys) enNext[k] = enExisting[k] ?? ''
fs.writeFileSync(EN, JSON.stringify(enNext, null, 2) + '\n')

// coverage 计算：有值的 key / 全部 key
const haveValue = Object.values(zhSorted).filter((v) => typeof v === 'string' && v.length > 0)
  .length
const coverage = sortedKeys.length === 0 ? 0 : Math.round((haveValue / sortedKeys.length) * 1000) / 10

const lines = [
  '<!-- frontend/scripts/i18n-populate.report.md -->',
  '# i18n populate 报告 · T-001d',
  '',
  `- 生成时间: ${new Date().toISOString()}`,
  `- 扫描文件: ${files.length}`,
  `- 命中 t() 调用: ${totalHits}`,
  `- 去重 key: ${sortedKeys.length}`,
  `- 本次新增: ${added} · 保留旧值: ${kept}`,
  `- zh.json coverage: ${coverage}%（有值 key / 全部 key）`,
  `- en.json 占位 key: ${sortedKeys.length}（值均为空串，待翻译）`,
  '',
  '## 非法 key（不符合 NAMING.md 正则）',
  '',
  badKeys.size === 0
    ? '无。'
    : Array.from(badKeys).map((k) => `- \`${k}\``).join('\n'),
  '',
  '## Fallback 冲突（同 key 多处字面不一致，以首次为准）',
  '',
  keyConflicts.size === 0
    ? '无。'
    : Array.from(keyConflicts.entries())
        .map(([k, set]) => `- \`${k}\`: ${Array.from(set).map((x) => JSON.stringify(x)).join(' / ')}`)
        .join('\n'),
  '',
  '> 规则见 `frontend/src/v2/i18n/NAMING.md`；T-001e CI gate 会以 NAMING.md 正则做 lint。',
  '',
]
fs.writeFileSync(REPORT, lines.join('\n'))

console.log(`[i18n-populate] files=${files.length} hits=${totalHits} keys=${sortedKeys.length} added=${added} kept=${kept} coverage=${coverage}%`)
if (badKeys.size) console.error(`[i18n-populate] bad keys: ${badKeys.size}（详见 report.md）`)
