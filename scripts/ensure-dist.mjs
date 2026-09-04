import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const outputs = [
  new URL('../dist/index.mjs', import.meta.url),
  new URL('../dist/index.mjs.map', import.meta.url),
  new URL('../dist/client.js', import.meta.url),
  new URL('../dist/client.js.map', import.meta.url),
]

const available = await Promise.all(outputs.map(async (path) => {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}))

if (available.every(Boolean)) {
  process.stdout.write('dist 已存在，跳过 prepare 重复构建\n')
} else {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(command, ['run', 'build'], { stdio: 'inherit', windowsHide: true })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (exitCode !== 0) throw new Error(`prepare 构建失败，退出码：${String(exitCode)}`)
}
