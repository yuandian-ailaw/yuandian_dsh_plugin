import { EventEmitter } from 'node:events'
import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExternalUrlCommand, openExternalUrl } from '../src/auth/browser.js'

function fakeChild(): ChildProcess {
  const child = new EventEmitter()
  let killed = false
  const kill = vi.fn(() => {
    killed = true
    return true
  })
  Object.defineProperties(child, {
    kill: { value: kill },
    killed: { get: () => killed },
  })
  return child as ChildProcess
}

afterEach(() => {
  vi.useRealTimers()
})

describe('OAuth 授权页打开器', () => {
  it('Windows 不经 cmd.exe 打开且保留完整查询参数', async () => {
    const url = new URL('https://auth.example/oauth/authorize?response_type=code&client_id=client-id&state=state-value')
    const command = createExternalUrlCommand(url, 'win32')
    const child = fakeChild()
    const spawn = vi.fn(() => child) as unknown as typeof nodeSpawn

    expect(command).toEqual({
      file: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', url.toString()],
    })

    const opened = openExternalUrl(url, { platform: 'win32', spawn })
    child.emit('close', 0, null)

    await expect(opened).resolves.toBe(true)
    expect(spawn).toHaveBeenCalledWith(command.file, command.args, {
      stdio: 'ignore',
      windowsHide: true,
    })
  })

  it('启动器退出失败时返回 false', async () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child) as unknown as typeof nodeSpawn
    const opened = openExternalUrl(new URL('https://auth.example/oauth/authorize'), { spawn })

    child.emit('close', 1, null)

    await expect(opened).resolves.toBe(false)
  })

  it('启动器超时时返回 false 并终止启动进程', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    const spawn = vi.fn(() => child) as unknown as typeof nodeSpawn
    const opened = openExternalUrl(new URL('https://auth.example/oauth/authorize'), {
      spawn,
      timeoutMs: 100,
    })

    await vi.advanceTimersByTimeAsync(100)

    await expect(opened).resolves.toBe(false)
    expect(child.kill).toHaveBeenCalledOnce()
  })
})
