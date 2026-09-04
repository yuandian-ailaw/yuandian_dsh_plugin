import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { asCredentialRef } from '../src/auth/store.js'
import { registerMcpBridge } from '../src/mcp/index.js'
import { registerBundledSkills } from '../src/skills.js'
import { startConnection } from '../src/mcp/connection.js'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

async function fakeMcpHttpServer() {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID })
  const server = new Server(
    { name: 'fake-yuandian', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'yuandian_fake_search',
      description: '假服务检索',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    }],
  }))
  server.setRequestHandler(CallToolRequestSchema, async request => ({
    content: [{ type: 'text', text: `命中：${String(request.params.arguments?.query ?? '')}` }],
    structuredContent: { source: 'fake' },
  }))
  await server.connect(transport as never)

  const http = createServer((request, response) => {
    if (request.url !== '/mcp') {
      response.writeHead(404).end()
      return
    }
    if (request.headers.authorization !== 'Bearer valid-test-key') {
      response.writeHead(401, {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer',
      }).end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    void transport.handleRequest(request, response)
  })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`
  const cleanup = async (): Promise<void> => {
    await server.close()
    await new Promise<void>(resolve => http.close(() => resolve()))
  }
  cleanups.push(cleanup)
  return { endpoint }
}

function harness(apiKey?: string) {
  const definitions = new Map<string, ToolDefinition>()
  const register = (definition: ToolDefinition): (() => void) => {
    definitions.set(definition.name, definition)
    return () => { definitions.delete(definition.name) }
  }
  const credentials = {
    resolve: vi.fn(async () => apiKey === undefined ? undefined : { value: apiKey, source: 'test' }),
    set: vi.fn(),
    unset: vi.fn(),
  }
  return {
    definitions,
    ctx: {
      tools: { register },
      credentials,
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as Context,
  }
}

describe('Streamable HTTP 假服务集成', () => {
  it('新版 Cordis 事件驱动无凭据待机、Key 连接、移除及插件卸载', async () => {
    const fake = await fakeMcpHttpServer()
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    const values = new Map<string, string>()
    const definitions = new Map<string, ToolDefinition>()
    const skills = new Set<string>()
    ctx.provide('credentials', {
      resolve: async (ref: string) => {
        const value = values.get(ref)
        return value === undefined ? undefined : { value, source: 'test' }
      },
    } as never)
    ctx.provide('tools', { register: (tool: ToolDefinition) => {
      definitions.set(tool.name, tool)
      return () => { definitions.delete(tool.name) }
    } } as never)
    ctx.provide('skills', { register: (skill: { name: string }) => {
      skills.add(skill.name)
      return () => { skills.delete(skill.name) }
    } } as never)
    await registerBundledSkills(ctx)
    await registerMcpBridge(ctx, resolveConfig({
      endpoint: fake.endpoint,
      auth: { mode: 'auto', openBrowser: false },
      reconnect: { enabled: false },
    }))
    expect(skills.size).toBe(4)
    expect(definitions.size).toBe(0)

    const ref = asCredentialRef('YUANDIAN_API_KEY')
    values.set(ref, 'valid-test-key')
    ctx.emit('credentials/reference-updated', ref)
    await vi.waitFor(() => expect(definitions.size).toBe(1))
    const tool = definitions.get('mcp__yuandian__yuandian_fake_search')!
    await expect(tool.execute({ query: '兼容验证' }, { signal: new AbortController().signal } as never))
      .resolves.toMatchObject({ content: [{ type: 'text', text: '命中：兼容验证' }] })

    values.delete(ref)
    ctx.emit('credentials/reference-updated', ref)
    await vi.waitFor(() => expect(definitions.size).toBe(0))
    await ctx.fiber.dispose()
    expect(skills.size).toBe(0)
    values.set(ref, 'valid-test-key')
    ctx.emit('credentials/reference-updated', ref)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(definitions.size).toBe(0)
  })

  it('使用 credential 引用注入 API Key，发现并调用 MCP 工具', async () => {
    const fake = await fakeMcpHttpServer()
    const app = harness('valid-test-key')
    const handle = startConnection(app.ctx, resolveConfig({
      endpoint: fake.endpoint,
      auth: { mode: 'api-key', credentialRef: 'YUANDIAN_API_KEY' },
      reconnect: { enabled: false },
    }))
    cleanups.push(() => handle.dispose())

    await expect(handle.ready).resolves.toEqual({})
    const tool = app.definitions.get('mcp__yuandian__yuandian_fake_search')
    if (tool === undefined) throw new Error('fake tool missing')
    await expect(tool.execute({ query: '民法典' }, { signal: new AbortController().signal } as never))
      .resolves.toEqual({
        content: [{ type: 'text', text: '命中：民法典' }],
        structuredContent: { source: 'fake' },
      })
  })

  it('自动认证模式优先使用已配置的 API Key', async () => {
    const fake = await fakeMcpHttpServer()
    const app = harness('valid-test-key')
    const handle = startConnection(app.ctx, resolveConfig({
      endpoint: fake.endpoint,
      auth: { mode: 'auto', openBrowser: false },
      reconnect: { enabled: false },
    }))
    cleanups.push(() => handle.dispose())

    await expect(handle.ready).resolves.toEqual({})
    expect(app.ctx.credentials.resolve).toHaveBeenCalledWith('YUANDIAN_API_KEY')
    expect(app.definitions.has('mcp__yuandian__yuandian_fake_search')).toBe(true)
  })

  it('API Key 缺失或 401 时失败且错误不包含凭证', async () => {
    const fake = await fakeMcpHttpServer()
    const missing = harness()
    const missingHandle = startConnection(missing.ctx, resolveConfig({
      endpoint: fake.endpoint,
      auth: { mode: 'api-key', credentialRef: 'YUANDIAN_API_KEY' },
      reconnect: { enabled: false },
    }))
    cleanups.push(() => missingHandle.dispose())
    const missingOutcome = await missingHandle.ready
    expect(String(missingOutcome.error)).toContain('YUANDIAN_API_KEY 未配置')

    const invalid = harness('invalid-secret-key')
    const invalidHandle = startConnection(invalid.ctx, resolveConfig({
      endpoint: fake.endpoint,
      auth: { mode: 'api-key' },
      reconnect: { enabled: false },
    }))
    cleanups.push(() => invalidHandle.dispose())
    const invalidOutcome = await invalidHandle.ready
    expect((invalidOutcome.error as { code?: number }).code).toBe(401)
    expect(String(invalidOutcome.error)).not.toContain('invalid-secret-key')
  })
})
