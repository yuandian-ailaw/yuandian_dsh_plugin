import type { Context } from '@deepseek-ai/cordis'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { AuthenticationRequiredError, McpAuthentication, createTimedFetch } from '../src/mcp/authentication.js'

function context(values: ReadonlyMap<string, string> = new Map()): Context {
  return {
    credentials: {
      resolve: vi.fn(async (ref: string) => {
        const value = values.get(ref)
        return value === undefined ? undefined : { value, source: 'test' }
      }),
      set: vi.fn(),
      unset: vi.fn(),
    },
    logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Context
}

describe('MCP 认证选择', () => {
  it('自动模式无凭证时不自动启动 OAuth', async () => {
    const authentication = new McpAuthentication(context(), resolveConfig({
      auth: { mode: 'auto', openBrowser: false },
    }))

    await expect(authentication.createTransport()).rejects.toBeInstanceOf(AuthenticationRequiredError)
    await authentication.close()
  })

  it('用户主动选择 OAuth 后才创建 OAuth transport', async () => {
    const authentication = new McpAuthentication(context(), resolveConfig({
      auth: { mode: 'auto', openBrowser: false },
    }))

    authentication.requestOAuth()

    await expect(authentication.createTransport()).resolves.toBeDefined()
    await expect(authentication.createTransport()).rejects.toBeInstanceOf(AuthenticationRequiredError)
    await authentication.close()
  })

  it('已有 OAuth 凭证时后续加载可自动复用', async () => {
    const authentication = new McpAuthentication(context(new Map([
      ['YUANDIAN_MCP_OAUTH', JSON.stringify({
        version: 1,
        tokens: { access_token: 'existing-access', refresh_token: 'existing-refresh', token_type: 'Bearer' },
      })],
    ])), resolveConfig({ auth: { mode: 'auto', openBrowser: false } }))

    await expect(authentication.createTransport()).resolves.toBeDefined()
    await authentication.close()
  })

  it('仅有遗留 OAuth 中间状态时不自动启动授权', async () => {
    const authentication = new McpAuthentication(context(new Map([
      ['YUANDIAN_MCP_OAUTH', JSON.stringify({ version: 1, clientInformation: { client_id: 'legacy-client' } })],
    ])), resolveConfig({ auth: { mode: 'auto', openBrowser: false } }))

    await expect(authentication.createTransport()).rejects.toBeInstanceOf(AuthenticationRequiredError)
    await authentication.close()
  })

  it('限制 SSE 握手等待时间但不限制已建立的长连接', async () => {
    let pendingSignal: AbortSignal | undefined
    const pendingFetch: FetchLike = async (_input, init) => new Promise((_resolve, reject) => {
      pendingSignal = init?.signal ?? undefined
      pendingSignal?.addEventListener('abort', () => reject(pendingSignal?.reason), { once: true })
    })
    const headers = { accept: 'text/event-stream' }

    await expect(createTimedFetch(10, pendingFetch)('https://example.com/mcp', { method: 'GET', headers }))
      .rejects.toThrow('SSE 握手超过')
    expect(pendingSignal?.aborted).toBe(true)

    let establishedSignal: AbortSignal | undefined
    const establishedFetch: FetchLike = async (_input, init) => {
      establishedSignal = init?.signal ?? undefined
      return new Response(null, { status: 200 })
    }
    await createTimedFetch(10, establishedFetch)('https://example.com/mcp', { method: 'GET', headers })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(establishedSignal?.aborted).toBe(false)
  })
})
