#!/usr/bin/env node
// frontend/scripts/i18n-coverage.mjs
//
// Round 4 · T-001e — i18n CI gate.
//
// 计算口径（与 i18n-extract 对齐）：
//   • bare     = 扫出但未走 t() 的中文字面（硬编码，需要整改）
//   • wrapped  = 已走 t('key','中文',...) 的字面（视为已覆盖）
//   • coverage = wrapped / (wrapped + bare)
//
// 同时校验字典健康度（中文单语言；en.json 已删除）：
//   1. zh.json 的 key 必须符合 NAMING.md 正则
//   2. t() 静态 key 必须存在于 zh.json —— 由 scripts/i18n-keys-check.mjs 负责（npm run i18n:keys）
//
// 退出码：
//   0  全部检查通过
//   1  coverage 低于阈值 / bare 超过 baseline / key 不合法 / 字典不对齐
//   2  参数或 IO 错误
//
// 用法：
//   node frontend/scripts/i18n-coverage.mjs                 （默认：bare 基线 1145，coverage ≥ 48%）
//   node frontend/scripts/i18n-coverage.mjs --baseline 1100 （收紧 bare 基线）
//   node frontend/scripts/i18n-coverage.mjs --min 0.60      （收紧 coverage 阈值）
//   node frontend/scripts/i18n-coverage.mjs --json          （machine-readable）
//
// 基线推进节奏（TL 约定）：
//   每合并一批 t() 改造后，在 PR 里更新 --baseline / --min；CI 永远保证不回退。

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const EXTRACT_OUT = join(__dirname, 'i18n-keys.json')
const ZH = join(FRONTEND_ROOT, 'src/v2/i18n/zh.json')
const REPORT = join(__dirname, 'i18n-coverage.report.md')

// 与 NAMING.md / i18n-keys-check.mjs 对齐
const KEY_RE = /^[a-z0-9][A-Za-z0-9_]*(\.[a-z0-9][A-Za-z0-9_]*){1,3}$/

// ── args ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { baseline: 1145, min: 0.48, json: false, skipExtract: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--baseline') out.baseline = Number(argv[++i])
    else if (a === '--min') out.min = Number(argv[++i])
    else if (a === '--json') out.json = true
    else if (a === '--skip-extract') out.skipExtract = true
    else if (a === '-h' || a === '--help') {
      console.log('usage: node scripts/i18n-coverage.mjs [--baseline N] [--min 0..1] [--json] [--skip-extract]')
      process.exit(0)
    } else {
      console.error(`unknown arg: ${a}`); process.exit(2)
    }
  }
  return out
}

// ── helpers ──────────────────────────────────────────────────────────────────
async function readJson(path) {
  const raw = await readFile(path, 'utf8')
  try { return JSON.parse(raw) }
  catch (e) { console.error(`parse fail: ${path}: ${e.message}`); process.exit(2) }
}

function runExtract() {
  const r = spawnSync('node', ['scripts/i18n-extract.mjs', '--json-only'], {
    cwd: FRONTEND_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (r.status !== 0) {
    console.error(`i18n-extract exited ${r.status}`)
    process.exit(r.status ?? 2)
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.skipExtract) runExtract()

  const extract = await readJson(EXTRACT_OUT)
  const zh = await readJson(ZH)

  const bare = extract.totals?.bare ?? -1
  const wrapped = extract.totals?.wrapped ?? -1
  if (bare < 0 || wrapped < 0) {
    console.error('extract json missing totals')
    process.exit(2)
  }
  const coverage = wrapped / Math.max(1, bare + wrapped)

  // dict health ──────────────────────────────────────────────────────────────
  const zhKeys = Object.keys(zh)
  const badZhKeys = zhKeys.filter((k) => !KEY_RE.test(k))

  // gates ────────────────────────────────────────────────────────────────────
  const failures = []
  if (bare > args.baseline) {
    failures.push(`bare(${bare}) > baseline(${args.baseline})；新增了硬编码中文，请走 t()。`)
  }
  if (coverage < args.min) {
    failures.push(`coverage(${(coverage * 100).toFixed(1)}%) < min(${(args.min * 100).toFixed(1)}%)`)
  }
  if (badZhKeys.length > 0) {
    failures.push(`zh.json 有 ${badZhKeys.length} 个 key 不符合 NAMING.md 正则: ${badZhKeys.slice(0, 5).join(', ')}${badZhKeys.length > 5 ? ' …' : ''}`)
  }

  const result = {
    generatedAt: new Date().toISOString(),
    extract: {
      files: extract.totals.files,
      bare,
      wrapped,
      uniqueTexts: extract.totals.uniqueTexts,
      coverage,
    },
    dict: {
      zhKeyCount: zhKeys.length,
      badZhKeys,
    },
    thresholds: { baseline: args.baseline, min: args.min },
    ok: failures.length === 0,
    failures,
  }

  // outputs ──────────────────────────────────────────────────────────────────
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('=== i18n coverage gate · T-001e ===')
    console.log(`files    ${extract.totals.files}`)
    console.log(`bare     ${bare}     (baseline ${args.baseline})`)
    console.log(`wrapped  ${wrapped}`)
    console.log(`coverage ${(coverage * 100).toFixed(2)}%   (min ${(args.min * 100).toFixed(2)}%)`)
    console.log(`zh keys  ${zhKeys.length}`)
    if (failures.length > 0) {
      console.error('')
      console.error('❌ FAIL:')
      for (const f of failures) console.error(`  - ${f}`)
    } else {
      console.log('✓ OK')
    }
  }

  // machine-readable report
  const md = [
    '<!-- frontend/scripts/i18n-coverage.report.md -->',
    '# i18n Coverage Report · T-001e',
    '',
    `- 生成时间: ${result.generatedAt}`,
    `- bare / wrapped: **${bare}** / **${wrapped}**    coverage: **${(coverage * 100).toFixed(2)}%**`,
    `- baseline bare: ${args.baseline}    min coverage: ${(args.min * 100).toFixed(2)}%`,
    `- zh.json keys: ${zhKeys.length}`,
    `- bad zh keys: ${badZhKeys.length}`,
    '',
    result.ok ? '**结果：✅ PASS**' : '**结果：❌ FAIL**',
  ].join('\n')
  await writeFile(REPORT, md + '\n', 'utf8')
  if (!args.json) {
    console.log(`wrote ${relative(FRONTEND_ROOT, REPORT)}`)
  }

  if (!result.ok) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
