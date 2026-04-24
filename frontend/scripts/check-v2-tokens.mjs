// frontend/scripts/check-v2-tokens.mjs
// Guards against undeclared CSS custom properties referenced from v2 .ts/.tsx
// inline styles. Parses the canonical token registry and asserts every
// `var(--token)` reference inside frontend/src/v2/**/*.{ts,tsx} resolves to a
// declared token.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { readdir, stat } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const TOKENS_FILE = join(FRONTEND_ROOT, 'src/v2/styles/tokens.css')
const SOURCE_ROOT = join(FRONTEND_ROOT, 'src/v2')

const SOURCE_EXTS = new Set(['.ts', '.tsx'])
const VAR_REFERENCE_RE = /var\(\s*(--[a-zA-Z0-9_-]+)/g
const TOKEN_DECL_RE = /^\s*(--[a-zA-Z0-9_-]+)\s*:/gm
// 识别在同一 TS/TSX 文件里局部声明的 CSS 自定义属性（仅用于该文件内 var() 解析），
// 匹配以下两种模式：
//   { '--brand-sem': '#abc' }                  —— 直接字面 key
//   { ['--brand-sem' as string]: '#abc' }     —— computed key + as 断言
// 不把这些加进全局 declared 集合，避免污染其它文件的校验。
const LOCAL_DECL_RE = /\[\s*['"](--[a-zA-Z0-9_-]+)['"](?:\s+as\s+\w+)?\s*\]\s*:|['"](--[a-zA-Z0-9_-]+)['"]\s*:/g

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-v2') continue
      files.push(...(await walk(full)))
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.')
      if (dot < 0) continue
      const ext = entry.name.slice(dot)
      if (SOURCE_EXTS.has(ext)) files.push(full)
    }
  }
  return files
}

async function main() {
  let tokensCss
  try {
    tokensCss = await readFile(TOKENS_FILE, 'utf8')
  } catch (err) {
    console.error(`[check-v2-tokens] cannot read ${TOKENS_FILE}: ${err.message}`)
    process.exit(2)
  }

  const declared = new Set()
  for (const match of tokensCss.matchAll(TOKEN_DECL_RE)) {
    declared.add(match[1])
  }
  if (declared.size === 0) {
    console.error('[check-v2-tokens] no tokens parsed from tokens.css; aborting')
    process.exit(2)
  }

  const files = await walk(SOURCE_ROOT)
  const violations = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const localDeclared = new Set()
    for (const match of text.matchAll(LOCAL_DECL_RE)) {
      localDeclared.add(match[1] || match[2])
    }
    for (const match of text.matchAll(VAR_REFERENCE_RE)) {
      const name = match[1]
      if (!declared.has(name) && !localDeclared.has(name)) {
        const before = text.slice(0, match.index)
        const line = before.split('\n').length
        violations.push({
          file: relative(FRONTEND_ROOT, file),
          line,
          name,
        })
      }
    }
  }

  if (violations.length > 0) {
    console.error(`[check-v2-tokens] ${violations.length} undeclared CSS custom property references:`)
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.name}`)
    }
    console.error('\nFix: either add the token to src/v2/styles/tokens.css, or use an existing token.')
    console.error(`Declared tokens (${declared.size}): ${[...declared].sort().join(', ')}`)
    process.exit(1)
  }

  console.log(`[check-v2-tokens] OK — ${files.length} files scanned, ${declared.size} tokens declared, 0 violations.`)
}

await main()
