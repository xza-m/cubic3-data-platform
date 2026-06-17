#!/usr/bin/env node
// frontend/scripts/i18n-extract.mjs
//
// Round 4 · T-001a — 从 src/v2/**/*.{ts,tsx} 抽取中文字面量，产出候选 i18n keys。
//
// 设计：
//  - 纯正则、零外依赖（不想为了 AST 再引一个 @babel/parser）
//  - 两类命中：
//      1. 字符串字面（单引号 / 双引号 / 反引号 / JSX 属性 / JSX children 文本）
//      2. 已被 t('key', 'fallback', ...) 包裹的 fallback 中文 —— 视为已覆盖
//  - 输出：
//      frontend/scripts/i18n-keys.json       候选清单（未被 t() 覆盖的）
//      frontend/scripts/i18n-keys.summary.md 人类可读摘要（总数、Top 文件、样例）
//  - 退出码：0 成功；>0 参数/IO 错误
//
// 用法：
//   node frontend/scripts/i18n-extract.mjs
//   node frontend/scripts/i18n-extract.mjs --json-only       只写 json
//   node frontend/scripts/i18n-extract.mjs --root src/v2/pages  仅扫子目录
//   node frontend/scripts/i18n-extract.mjs --fail-over 800   硬编码 > 阈值则 exit 1（为后续 T-001e 预留）
//
// 局限：
//  - 不支持多行反引号中的复杂 ${} 拼接（命中但不拆模板）
//  - Generic 泛型参数内的字符串误判极少（无 JSX 标签），保留以便人工过滤
//  - 行号基于 LF 计数；MSYS 上请先以 LF 保存

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const DEFAULT_ROOT = 'src/v2'
const OUT_JSON = join(__dirname, 'i18n-keys.json')
const OUT_SUMMARY = join(__dirname, 'i18n-keys.summary.md')

const SOURCE_EXTS = new Set(['.ts', '.tsx'])
const SKIP_DIR = new Set(['node_modules', 'dist', 'dist-v2', 'coverage', '.lighthouseci'])
// 专门跳过 i18n 自身与类型声明 / 测试（testkit 是测试共享 fixture，不计入 i18n 债务）
const SKIP_PATH_RE = [
  /\/i18n\//,
  /\.test\.[cm]?[jt]sx?$/,
  /\.testkit\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
]

// 中文区段（Basic Multilingual）+ 常见全角符号，避免把 "，" "。" 当次要噪音排除
const CJK = /[\u4e00-\u9fff]/

// 去掉行内 // 行注释与 /* */ 块注释（简化版：按文件剥离一次，足够做字面抽取）
function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  let inS = null // 'S'|'D'|'B'
  let inBlock = false
  let inLine = false
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (inLine) {
      if (c === '\n') { inLine = false; out += c }
      i++
      continue
    }
    if (inBlock) {
      if (c === '*' && c2 === '/') { inBlock = false; i += 2 } else { if (c === '\n') out += '\n'; i++ }
      continue
    }
    if (inS) {
      out += c
      if (c === '\\') { out += c2 ?? ''; i += 2; continue }
      if ((inS === 'S' && c === "'") || (inS === 'D' && c === '"') || (inS === 'B' && c === '`')) inS = null
      i++
      continue
    }
    if (c === '/' && c2 === '/') { inLine = true; i += 2; continue }
    if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue }
    if (c === "'") { inS = 'S'; out += c; i++; continue }
    if (c === '"') { inS = 'D'; out += c; i++; continue }
    if (c === '`') { inS = 'B'; out += c; i++; continue }
    out += c
    i++
  }
  return out
}

// 粗略行号：以 '\n' 计
function lineOf(src, offset) {
  let n = 1
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === '\n') n++
  return n
}

// 判定该字面是否是 t('...', '...', ...) 的参数（按 offset 反扫 256 字符，看是否形如 `t(`）
function inTCall(src, offset) {
  const start = Math.max(0, offset - 256)
  const slice = src.slice(start, offset)
  // 最后一次出现的标识符调用
  const m = /\bt\s*\(\s*(['"`])[^'"`]*?\1\s*,\s*$/s.exec(slice)
  return !!m
}

// JSX 纯文本节点：> ... < （非属性、非表达式）
const JSX_TEXT_RE = />([^<{}]+?)</g
// 引号字符串字面（单/双/反引号）
const STR_LIT_RE = /(['"`])((?:\\.|(?!\1).)*?)\1/g

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      files.push(...(await walk(full)))
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.')
      if (dot < 0) continue
      const ext = e.name.slice(dot)
      if (!SOURCE_EXTS.has(ext)) continue
      const rel = relative(FRONTEND_ROOT, full).replace(/\\/g, '/')
      if (SKIP_PATH_RE.some(re => re.test(rel))) continue
      files.push(full)
    }
  }
  return files
}

async function extractFromFile(file) {
  const rel = relative(FRONTEND_ROOT, file).replace(/\\/g, '/')
  const raw = await readFile(file, 'utf8')
  const src = stripComments(raw)

  const bareItems = []
  const wrappedItems = []

  // 1) 字符串字面
  STR_LIT_RE.lastIndex = 0
  let m
  while ((m = STR_LIT_RE.exec(src))) {
    const body = m[2]
    if (!CJK.test(body)) continue
    const offset = m.index
    const clean = body.replace(/\s+/g, ' ').trim()
    if (!clean) continue
    const entry = {
      file: rel,
      line: lineOf(src, offset),
      text: clean,
      kind: m[1] === '`' ? 'tmpl' : 'str',
    }
    if (inTCall(src, offset)) wrappedItems.push(entry)
    else bareItems.push(entry)
  }

  // 2) JSX 文本节点 — 只在 .tsx 扫
  if (rel.endsWith('.tsx')) {
    JSX_TEXT_RE.lastIndex = 0
    while ((m = JSX_TEXT_RE.exec(src))) {
      const body = m[1]
      if (!CJK.test(body)) continue
      const clean = body.replace(/\s+/g, ' ').trim()
      if (!clean) continue
      bareItems.push({
        file: rel,
        line: lineOf(src, m.index),
        text: clean,
        kind: 'jsx',
      })
    }
  }

  return { bare: bareItems, wrapped: wrappedItems }
}

function slugHint(text) {
  // 仅作候选「短句摘要」，不作 key；人工在 T-001b 复核
  const t = text.replace(/[\s。，！？、：；（）【】《》"'\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return t.slice(0, 20)
}

function summarize(all) {
  const byFile = new Map()
  const byText = new Map()
  for (const it of all.bare) {
    byFile.set(it.file, (byFile.get(it.file) ?? 0) + 1)
    byText.set(it.text, (byText.get(it.text) ?? 0) + 1)
  }
  const topFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  const topTexts = [...byText.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  return { topFiles, topTexts }
}

async function main() {
  const args = process.argv.slice(2)
  const getOpt = (k) => {
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : undefined
  }
  const jsonOnly = args.includes('--json-only')
  const rootArg = getOpt('--root') ?? DEFAULT_ROOT
  const failOver = Number(getOpt('--fail-over') ?? '0')

  const rootAbs = join(FRONTEND_ROOT, rootArg)
  try { await stat(rootAbs) } catch { console.error(`root not found: ${rootAbs}`); process.exit(2) }

  const files = await walk(rootAbs)
  const agg = { bare: [], wrapped: [] }
  for (const f of files) {
    const { bare, wrapped } = await extractFromFile(f)
    agg.bare.push(...bare)
    agg.wrapped.push(...wrapped)
  }

  // 候选 key hint
  for (const it of agg.bare) it.hint = slugHint(it.text)

  const summary = summarize(agg)
  const out = {
    generatedAt: new Date().toISOString(),
    root: rootArg,
    totals: {
      files: files.length,
      bare: agg.bare.length,
      wrapped: agg.wrapped.length,
      uniqueTexts: new Set(agg.bare.map(x => x.text)).size,
    },
    topFiles: summary.topFiles,
    topTexts: summary.topTexts,
    items: agg.bare,
  }

  await writeFile(OUT_JSON, JSON.stringify(out, null, 2), 'utf8')

  if (!jsonOnly) {
    const lines = []
    lines.push('<!-- frontend/scripts/i18n-keys.summary.md -->')
    lines.push(`# i18n 抽取摘要 · T-001a`)
    lines.push('')
    lines.push(`- 生成时间: ${out.generatedAt}`)
    lines.push(`- 扫描 root: \`${rootArg}\``)
    lines.push(`- 扫描文件: ${out.totals.files} · 硬编码(bare): **${out.totals.bare}** · 已 t() 包裹: ${out.totals.wrapped} · 去重文本: ${out.totals.uniqueTexts}`)
    lines.push('')
    lines.push('## Top 文件（bare 命中数）')
    lines.push('')
    lines.push('| 文件 | 命中 |')
    lines.push('| --- | ---: |')
    for (const [f, c] of summary.topFiles) lines.push(`| \`${f}\` | ${c} |`)
    lines.push('')
    lines.push('## Top 文本（去重高频）')
    lines.push('')
    lines.push('| 文本 | 次数 |')
    lines.push('| --- | ---: |')
    for (const [txt, c] of summary.topTexts) lines.push(`| ${txt.replace(/\|/g, '\\|')} | ${c} |`)
    lines.push('')
    lines.push('> 候选 key 请在 T-001b 人工评审：按 domain.action.modifier 命名。')
    lines.push('')
    await writeFile(OUT_SUMMARY, lines.join('\n'), 'utf8')
  }

  console.log(`[i18n-extract] files=${out.totals.files} bare=${out.totals.bare} wrapped=${out.totals.wrapped} uniq=${out.totals.uniqueTexts}`)
  console.log(`[i18n-extract] wrote ${relative(FRONTEND_ROOT, OUT_JSON)}${jsonOnly ? '' : ` & ${relative(FRONTEND_ROOT, OUT_SUMMARY)}`}`)

  if (failOver && out.totals.bare > failOver) {
    console.error(`[i18n-extract] bare (${out.totals.bare}) > fail-over (${failOver}); exit 1`)
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
