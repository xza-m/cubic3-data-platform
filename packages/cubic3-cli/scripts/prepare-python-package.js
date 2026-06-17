#!/usr/bin/env node
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceCli = resolve(packageRoot, '..', '..', 'cli')
const target = join(packageRoot, 'python')

if (!existsSync(join(sourceCli, 'pyproject.toml'))) {
  console.error(`[cubic3-dp] 未找到 Python CLI 源码: ${sourceCli}`)
  process.exit(1)
}

rmSync(target, { force: true, recursive: true })
cpSync(sourceCli, target, {
  recursive: true,
  filter: (source) => {
    const relative = source.slice(sourceCli.length + 1)
    if (!relative) return true
    return !relative.split(/[\\/]/).some((part) => (
      part === '__pycache__'
      || part === '.pytest_cache'
      || part === 'build'
      || part.endsWith('.egg-info')
    ))
  },
})
