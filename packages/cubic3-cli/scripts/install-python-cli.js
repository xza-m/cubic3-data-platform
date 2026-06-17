#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pythonSource = resolvePythonSource(packageRoot)
const venvDir = join(packageRoot, '.venv')

if (!pythonSource) {
  console.error('[cubic3-dp] 未找到随 npm 包发布的 Python CLI 源码。请重新安装 @cubic3/dp-cli。')
  process.exit(1)
}

const python = process.env.CUBIC3_DP_PYTHON || process.env.PYTHON || findPython()
if (!python) {
  console.error('[cubic3-dp] 安装需要 Python 3.11+，请安装 Python 后重新执行 npm rebuild @cubic3/dp-cli。')
  process.exit(1)
}

run(python, ['-m', 'venv', venvDir])
const venvPython = process.platform === 'win32'
  ? join(venvDir, 'Scripts', 'python.exe')
  : join(venvDir, 'bin', 'python')
run(venvPython, ['-m', 'pip', 'install', '--upgrade', pythonSource])

function resolvePythonSource(root) {
  const packaged = join(root, 'python')
  if (existsSync(join(packaged, 'pyproject.toml'))) return packaged

  const workspaceCli = resolve(root, '..', '..', 'cli')
  if (existsSync(join(workspaceCli, 'pyproject.toml'))) return workspaceCli

  return null
}

function findPython() {
  for (const candidate of ['python3', 'python']) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (!result.error && result.status === 0) return candidate
  }
  return null
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) {
    console.error(`[cubic3-dp] 执行失败: ${command} ${args.join(' ')}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
