import { spawn } from 'node:child_process'

export type OpenAuthorizationUrl = (url: URL) => Promise<boolean>

interface OpenExternalUrlDependencies {
  readonly platform?: NodeJS.Platform
  readonly spawn?: typeof spawn
  readonly timeoutMs?: number
}

export interface ExternalUrlCommand {
  readonly file: string
  readonly args: readonly string[]
}

const OPEN_TIMEOUT_MS = 10_000

export function createExternalUrlCommand(url: URL, platform: NodeJS.Platform): ExternalUrlCommand {
  return platform === 'darwin'
    ? { file: 'open', args: [url.toString()] }
    : platform === 'win32'
      ? { file: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url.toString()] }
      : { file: 'xdg-open', args: [url.toString()] }
}

export async function openExternalUrl(url: URL, dependencies: OpenExternalUrlDependencies = {}): Promise<boolean> {
  const command = createExternalUrlCommand(url, dependencies.platform ?? process.platform)
  const spawnProcess = dependencies.spawn ?? spawn
  const timeoutMs = dependencies.timeoutMs ?? OPEN_TIMEOUT_MS

  return new Promise<boolean>((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (opened: boolean): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(opened)
    }

    const child = spawnProcess(command.file, command.args, {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', () => finish(false))
    child.once('close', code => finish(code === 0))
    timer = setTimeout(() => {
      finish(false)
      if (!child.killed) child.kill()
    }, timeoutMs)
    timer.unref()
  })
}
