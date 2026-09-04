import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { startConnection } from '../src/mcp/connection.js'

class FakeClient {
  onclose?: () => void
  onerror?: (error: Error) => void
  notificationHandler?: () => Promise<void>
  readonly close = vi.fn(async () => { this.onclose?.() })
  readonly connect = vi.fn(async () => {})
  readonly request = vi.fn(async (request: { method: string }) => {
    if (request.method === 'tools/list') return { tools: [{ name: 'yuandian_echo', inputSchema: { type: 'object' } }] }
    return { content: [{ type: 'text', text: 'ok' }] }
  })

  setNotificationHandler(_schema: unknown, handler: () => Promise<void>): void {
    this.notificationHandler = handler
  }
}

function harness() {
  const definitions = new Map<string, ToolDefinition>()
  const disposals: string[] = []
  const register = vi.fn((definition: ToolDefinition) => {
    definitions.set(definition.name, definition)
    return () => {
      disposals.push(definition.name)
      definitions.delete(definition.name)
    }
  })
  const credentials = {
    resolve: vi.fn(async () => ({ value: 'test-api-key', source: 'test' })),
    set: vi.fn(),
    unset: vi.fn(),
  }
  const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return {
    ctx: { tools: { register }, credentials, logger } as unknown as Context,
    definitions,
    disposals,
    logger,
  }
}

function transport(): StreamableHTTPClientTransport {
  return { finishAuth: vi.fn(), close: vi.fn() } as unknown as StreamableHTTPClientTransport
}

function config(mode: 'oauth' | 'api-key' = 'api-key') {
  return resolveConfig({
    auth: mode === 'oauth'
      ? { mode: 'oauth', openBrowser: false, timeoutMs: 100, callbackPort: 1455 }
      : { mode: 'api-key' },
    reconnect: { initialDelayMs: 1, maxDelayMs: 4, maxAttempts: 3 },
  })
}

async function eventually(check: () => boolean, timeoutMs = 200): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('condition timed out')
    await new Promise(resolve => setTimeout(resolve, 2))
  }
}

describe('MCP 连接监督器', () => {
  it('自动模式无凭证时安静待机，不连接也不重试', async () => {
    const app = harness()
    app.ctx.credentials.resolve = vi.fn(async () => undefined)
    const client = new FakeClient()
    const handle = startConnection(app.ctx, resolveConfig({
      auth: { mode: 'auto', openBrowser: false },
      reconnect: { initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 2 },
    }), {
      createClient: () => client as unknown as Client,
    })

    await expect(handle.ready).resolves.toEqual({ authenticationRequired: true })
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(client.connect).not.toHaveBeenCalled()
    expect(app.logger.warn).not.toHaveBeenCalled()
    expect(app.logger.debug).toHaveBeenCalledWith(expect.stringContaining('等待用户'))
    await handle.dispose()
  })

  it('认证配置变化时立即重建连接代', async () => {
    const app = harness()
    const clients: FakeClient[] = []
    const handle = startConnection(app.ctx, config(), {
      createClient: () => {
        const client = new FakeClient()
        clients.push(client)
        return client as unknown as Client
      },
      createTransport: async () => transport(),
    })

    await expect(handle.ready).resolves.toEqual({})
    await handle.restart()

    expect(clients).toHaveLength(2)
    expect(clients[0]?.close).toHaveBeenCalledTimes(1)
    expect(clients[1]?.connect).toHaveBeenCalledTimes(1)
    expect(app.definitions).toHaveLength(1)
    await handle.dispose()
  })

  it('重新发起 OAuth 时先取消旧授权监听再重建连接', async () => {
    const app = harness()
    const events: string[] = []
    const handle = startConnection(app.ctx, config(), {
      createClient: () => {
        events.push('create-client')
        return new FakeClient() as unknown as Client
      },
      createTransport: async () => transport(),
      cancelPendingAuthorization: async () => { events.push('cancel-pending') },
    })
    await handle.ready
    events.length = 0

    await handle.requestOAuth()

    expect(events).toEqual(['cancel-pending', 'create-client'])
    await handle.dispose()
  })

  it('清除最后一种 OAuth 认证后关闭连接并注销工具', async () => {
    const app = harness()
    const values = new Map<string, string>([
      ['YUANDIAN_MCP_OAUTH', JSON.stringify({
        version: 1,
        tokens: { access_token: 'existing-access', refresh_token: 'existing-refresh', token_type: 'Bearer' },
      })],
    ])
    app.ctx.credentials.resolve = vi.fn(async (ref: string) => {
      const value = values.get(ref)
      return value === undefined ? undefined : { value, source: 'test' }
    })
    const clients: FakeClient[] = []
    const handle = startConnection(app.ctx, resolveConfig({
      auth: { mode: 'auto', openBrowser: false },
    }), {
      createClient: () => {
        const client = new FakeClient()
        clients.push(client)
        return client as unknown as Client
      },
    })

    await expect(handle.ready).resolves.toEqual({})
    expect(app.definitions).toHaveLength(1)

    values.delete('YUANDIAN_MCP_OAUTH')
    await handle.restart()

    expect(clients[0]?.close).toHaveBeenCalledTimes(1)
    expect(clients[1]?.connect).not.toHaveBeenCalled()
    expect(app.definitions).toHaveLength(0)
    expect(app.disposals).toContain('mcp__yuandian__yuandian_echo')
    expect(app.logger.debug).toHaveBeenCalledWith(expect.stringContaining('等待用户'))
    await handle.dispose()
  })

  it('清除 OAuth 但存在 API Key 时切换认证并保留工具能力', async () => {
    const app = harness()
    const values = new Map<string, string>([
      ['YUANDIAN_MCP_OAUTH', JSON.stringify({
        version: 1,
        tokens: { access_token: 'existing-access', refresh_token: 'existing-refresh', token_type: 'Bearer' },
      })],
    ])
    app.ctx.credentials.resolve = vi.fn(async (ref: string) => {
      const value = values.get(ref)
      return value === undefined ? undefined : { value, source: 'test' }
    })
    const clients: FakeClient[] = []
    const handle = startConnection(app.ctx, resolveConfig({
      auth: { mode: 'auto', openBrowser: false },
    }), {
      createClient: () => {
        const client = new FakeClient()
        clients.push(client)
        return client as unknown as Client
      },
    })

    await expect(handle.ready).resolves.toEqual({})

    values.delete('YUANDIAN_MCP_OAUTH')
    values.set('YUANDIAN_API_KEY', 'replacement-api-key')
    await handle.restart()

    expect(clients).toHaveLength(2)
    expect(clients[0]?.close).toHaveBeenCalledTimes(1)
    expect(clients[1]?.connect).toHaveBeenCalledTimes(1)
    expect(app.definitions).toHaveLength(1)
    expect(app.disposals).toContain('mcp__yuandian__yuandian_echo')
    await handle.dispose()
  })

  it('处理 list_changed，同步失败时保留上一代', async () => {
    const app = harness()
    const client = new FakeClient()
    const handle = startConnection(app.ctx, config(), {
      createClient: () => client as unknown as Client,
      createTransport: async () => transport(),
    })
    await expect(handle.ready).resolves.toEqual({})
    expect(app.definitions).toHaveLength(1)

    await client.notificationHandler?.()
    expect(app.definitions).toHaveLength(1)
    client.request.mockRejectedValueOnce(new Error('temporary list failure'))
    await client.notificationHandler?.()
    expect(app.definitions).toHaveLength(1)
    expect(app.logger.error).toHaveBeenCalledWith(expect.stringContaining('保留上一代'))
    await handle.dispose()
  })

  it('连接中断后按有界退避重连并替换工具代', async () => {
    const app = harness()
    const clients: FakeClient[] = []
    const handle = startConnection(app.ctx, config(), {
      createClient: () => {
        const client = new FakeClient()
        clients.push(client)
        return client as unknown as Client
      },
      createTransport: async () => transport(),
    })
    await handle.ready
    clients[0]?.onclose?.()
    await eventually(() => clients.length === 2 && app.definitions.size === 1)

    expect(clients).toHaveLength(2)
    expect(app.disposals).toContain('mcp__yuandian__yuandian_echo')
    await handle.dispose()
  })

  it('重连预算耗尽后注销工具并停止重试', async () => {
    const app = harness()
    const first = new FakeClient()
    let created = 0
    const handle = startConnection(app.ctx, resolveConfig({
      auth: { mode: 'api-key' },
      reconnect: { initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 2 },
    }), {
      createClient: () => {
        created += 1
        if (created === 1) return first as unknown as Client
        const failed = new FakeClient()
        failed.connect.mockRejectedValue(new Error('offline'))
        return failed as unknown as Client
      },
      createTransport: async () => transport(),
    })
    await handle.ready
    first.onclose?.()
    await eventually(() => app.definitions.size === 0 && app.logger.error.mock.calls.length > 0)

    expect(created).toBe(3)
    expect(app.logger.error).toHaveBeenCalledWith(expect.stringContaining('连续重连 2 次失败'))
    await handle.dispose()
  })

  it('首次 OAuth 授权完成后用新 generation 连接', async () => {
    const app = harness()
    const first = new FakeClient()
    first.connect.mockRejectedValueOnce(new UnauthorizedError())
    const second = new FakeClient()
    const clients = [first, second]
    const finishAuthorization = vi.fn(async () => true)
    const handle = startConnection(app.ctx, config('oauth'), {
      createClient: () => clients.shift() as unknown as Client,
      createTransport: async () => transport(),
      finishAuthorization,
      closeAuthentication: async () => {},
    })

    await expect(handle.ready).resolves.toEqual({})
    expect(finishAuthorization).toHaveBeenCalledTimes(1)
    expect(second.connect).toHaveBeenCalledTimes(1)
    await handle.dispose()
  })

  it('运行中重新授权不重放原工具调用，连接恢复后允许用户重试', async () => {
    const app = harness()
    const first = new FakeClient()
    first.request.mockImplementation(async (request: { method: string }) => {
      if (request.method === 'tools/list') return { tools: [{ name: 'mutating', inputSchema: { type: 'object' } }] }
      throw new UnauthorizedError()
    })
    const second = new FakeClient()
    const clients = [first, second]
    const finishAuthorization = vi.fn(async () => true)
    const handle = startConnection(app.ctx, config('oauth'), {
      createClient: () => clients.shift() as unknown as Client,
      createTransport: async () => transport(),
      finishAuthorization,
      closeAuthentication: async () => {},
    })
    await handle.ready
    const definition = app.definitions.get('mcp__yuandian__mutating')
    if (definition === undefined) throw new Error('tool missing')

    await expect(definition.execute({}, { signal: new AbortController().signal } as never)).rejects.toBeInstanceOf(UnauthorizedError)
    await eventually(() => finishAuthorization.mock.calls.length === 1 && second.connect.mock.calls.length === 1)

    expect(first.request.mock.calls.filter(call => call[0]?.method === 'tools/call')).toHaveLength(1)
    expect(app.definitions).toHaveLength(1)
    await handle.dispose()
  })
})
