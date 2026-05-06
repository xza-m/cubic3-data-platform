import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendDir = path.resolve(__dirname, '..')
const baseUrl = process.env.DOMAIN_SMOKE_BASE_URL ?? 'http://127.0.0.1:3100'
const url = new URL(baseUrl)
const isManagedLocalServer =
  ['127.0.0.1', 'localhost'].includes(url.hostname) && process.env.SEMANTIC_SMOKE_USE_EXISTING_SERVER !== '1'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pythonCommand = process.env.PYTHON_BIN || 'python'
const smokeTargets = process.argv.slice(2)

if (smokeTargets.length === 0) {
  console.error('缺少 smoke 脚本路径。请至少传入一个 Python smoke 脚本。')
  process.exit(1)
}

async function waitForServer(
  targetUrl,
  timeoutMs = 120_000,
  probePath = '/login',
  requireOk = false,
  serverProcess = null,
) {
  const startedAt = Date.now()
  const probeUrl = new URL(probePath, targetUrl).toString()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(`前端开发服务提前退出，退出码=${serverProcess.exitCode}`)
    }
    try {
      const response = await fetch(probeUrl, { redirect: 'manual' })
      if (requireOk ? response.status === 200 : response.status < 500) {
        return
      }
      lastError = new Error(`服务返回异常状态码: ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(1_000)
  }

  throw new Error(`等待前端测试入口超时: ${probeUrl}${lastError ? `；最后错误: ${String(lastError)}` : ''}`)
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: frontendDir,
      env: { ...process.env, DOMAIN_SMOKE_BASE_URL: baseUrl, ...extraEnv },
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(undefined)
        return
      }
      reject(new Error(`${command} ${args.join(' ')} 失败，退出码=${code ?? 'null'}，signal=${signal ?? 'null'}`))
    })
  })
}

async function main() {
  let devServer = null

  try {
    if (isManagedLocalServer) {
      const port = url.port || '3100'
      devServer = spawn(
        npmCommand,
        ['run', 'dev', '--', '--host', url.hostname, '--port', port, '--strictPort'],
        {
          cwd: frontendDir,
          env: process.env,
          stdio: 'inherit',
        },
      )
      await waitForServer(baseUrl, 120_000, '/@vite/client', true, devServer)
    } else {
      await waitForServer(baseUrl)
    }

    for (const target of smokeTargets) {
      await runCommand(pythonCommand, [target])
    }
  } finally {
    if (devServer && !devServer.killed) {
      devServer.kill('SIGTERM')
      await delay(1_000)
      if (!devServer.killed) {
        devServer.kill('SIGKILL')
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
