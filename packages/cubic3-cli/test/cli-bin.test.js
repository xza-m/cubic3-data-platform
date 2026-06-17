import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binPath = resolve(packageRoot, 'bin', 'cubic3-dp')

test('cubic3-dp bin delegates to the Python CLI', () => {
  const result = spawnSync(process.execPath, [binPath, 'describe'], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CUBIC3_DP_CONFIG: resolve(packageRoot, '.tmp-test-config.json'),
    },
  })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.cli, 'cubic3-dp')
  assert.equal(payload.agent_first.self_describe_command, 'cubic3-dp describe')
})
