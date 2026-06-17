#!/usr/bin/env node
// frontend/scripts/i18n-keys-check.mjs
//
// i18n key 存在性 gate（中文单语言收敛后的词典健康检查）：
//   1. 扫描 src/v2 内所有静态 key 的 t() 调用（跳过测试与 i18n 目录）
//   2. 静态 key 必须存在于 zh.json；缺失即 FAIL
//   3. fallback 不允许使用反引号模板字面量（变量必须走 vars 参数，见 NAMING.md §6）
//
// 用法：
//   node scripts/i18n-keys-check.mjs          校验（CI / make lint）
//   node scripts/i18n-keys-check.mjs --fix    把缺失 key 以 fallback 为值回填 zh.json（按 key 排序）
//
// 退出码：0 通过；1 存在缺失 key 或模板字面量 fallback；2 IO 错误

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const SRC_ROOT = join(FRONTEND_ROOT, 'src/v2')
const ZH = join(FRONTEND_ROOT, 'src/v2/i18n/zh.json')

const SKIP_DIR = new Set(['node_modules', 'dist', 'dist-v2', 'coverage', 'i18n'])
const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/

// t('key') / t("key") —— 捕获 key；随后窥探 fallback 形态
const T_CALL_RE = /\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1\s*(,)?/g

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      out.push(...(await walk(full)))
    } else if (/\.(ts|tsx)$/.test(e.name) && !TEST_RE.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

function unescape(raw) {
  return raw.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

async function main() {
  const fix = process.argv.includes('--fix')
  const zh = JSON.parse(await readFile(ZH, 'utf8'))

  /** key -> { fallback: string|null, files: Set<string> } */
  const used = new Map()
  const templateFallbacks = []

  for (const file of await walk(SRC_ROOT)) {
    const src = await readFile(file, 'utf8')
    const rel = relative(FRONTEND_ROOT, file).replace(/\\/g, '/')
    T_CALL_RE.lastIndex = 0
    let m
    while ((m = T_CALL_RE.exec(src))) {
      const key = m[2]
      const entry = used.get(key) ?? { fallback: null, files: new Set() }
      entry.files.add(rel)
      if (m[3] === ',') {
        const rest = src.slice(T_CALL_RE.lastIndex)
        const fb = /^\s*(['"])((?:\\.|(?!\1).)*?)\1/.exec(rest)
        if (fb) {
          if (entry.fallback == null) entry.fallback = unescape(fb[2])
        } else if (/^\s*`/.test(rest)) {
          templateFallbacks.push({ key, file: rel })
        }
      }
      used.set(key, entry)
    }
  }

  const missing = [...used.entries()].filter(([k]) => !(k in zh))
  const failures = []

  if (templateFallbacks.length > 0) {
    failures.push(
      `发现 ${templateFallbacks.length} 处反引号模板 fallback（变量应走 vars 参数）: ` +
        templateFallbacks.slice(0, 5).map((it) => `${it.key} @ ${it.file}`).join('; '),
    )
  }

  if (missing.length > 0 && fix) {
    const unfixable = missing.filter(([, v]) => v.fallback == null)
    for (const [key, v] of missing) {
      if (v.fallback != null) zh[key] = v.fallback
    }
    const sorted = Object.fromEntries(Object.entries(zh).sort(([a], [b]) => a.localeCompare(b)))
    await writeFile(ZH, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
    console.log(`[i18n-keys] 已回填 ${missing.length - unfixable.length} 个缺失 key 到 zh.json`)
    if (unfixable.length > 0) {
      failures.push(
        `有 ${unfixable.length} 个缺失 key 没有静态 fallback，无法自动回填: ` +
          unfixable.slice(0, 5).map(([k]) => k).join(', '),
      )
    }
  } else if (missing.length > 0) {
    failures.push(
      `有 ${missing.length} 个 t() key 不存在于 zh.json（可运行 npm run i18n:keys -- --fix 回填）: ` +
        missing.slice(0, 8).map(([k]) => k).join(', ') + (missing.length > 8 ? ' …' : ''),
    )
  }

  console.log(`[i18n-keys] 静态 key ${used.size} 个 · zh.json ${Object.keys(zh).length} 条 · 缺失 ${missing.length}`)
  if (failures.length > 0) {
    console.error('❌ FAIL:')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('✓ OK')
}

main().catch((e) => { console.error(e); process.exit(2) })
