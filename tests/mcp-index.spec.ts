import type { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OAUTH_START_CREDENTIAL_REF } from '../src/auth/constants.js'
import { resolveConfig } from '../src/config.js'

const startConnection = vi.fn()

vi.mock('../src/mcp/connection.js', () => ({ startConnection }))

const { registerMcpBridge } = await import('../src/mcp/index.js')

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('MCP OAuth 启动信号', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('新授权尝试不会被旧尝试锁住，并只清理已完成的当前尝试', async () => {
    const first = deferred()
    const second = deferred()
    const requestOAuth = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    startConnection.mockReturnValue({
      ready: Promise.resolve({}),
      requestOAuth,
      restart: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    })
    const values = new Map<string, string>()
    let updated: ((ref: string) => void) | undefined
    const credentials = {
      resolve: vi.fn(async (ref: string) => {
        const value = values.get(ref)
        return value === undefined ? undefined : { value, source: 'test' }
      }),
      unset: vi.fn(async (ref: string) => { values.delete(ref) }),
    }
    const ctx = {
      credentials,
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      effect(callback: () => unknown) { callback() },
      on(event: string, listener: (ref: string) => void) {
        if (event === 'credentials/reference-updated') updated = listener
        return () => undefined
      },
    } as unknown as Context

    await registerMcpBridge(ctx, resolveConfig({ auth: { mode: 'auto', openBrowser: false } }))

    values.set(DEFAULT_OAUTH_START_CREDENTIAL_REF, 'attempt-1')
    updated?.(DEFAULT_OAUTH_START_CREDENTIAL_REF)
    await flush()
    values.set(DEFAULT_OAUTH_START_CREDENTIAL_REF, 'attempt-2')
    updated?.(DEFAULT_OAUTH_START_CREDENTIAL_REF)
    await flush()

    expect(requestOAuth).toHaveBeenCalledTimes(2)
    first.resolve()
    await flush()
    expect(values.get(DEFAULT_OAUTH_START_CREDENTIAL_REF)).toBe('attempt-2')

    second.resolve()
    await flush()
    expect(values.has(DEFAULT_OAUTH_START_CREDENTIAL_REF)).toBe(false)
  })
})
