import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { describe, expect, it, vi } from 'vitest'
import { publicToolName, syncTools } from '../src/mcp/tools.js'

type RequestOptions = { signal?: AbortSignal; timeout?: number }

function fakeClient(handler: (request: Record<string, unknown>, options?: RequestOptions) => unknown): Client {
  return {
    request: vi.fn(async (request: Record<string, unknown>, _schema: unknown, options?: RequestOptions) => handler(request, options)),
  } as unknown as Client
}

function fakeContext(registerImpl?: (definition: ToolDefinition) => () => void) {
  const definitions = new Map<string, ToolDefinition>()
  const register = vi.fn((definition: ToolDefinition) => {
    if (registerImpl !== undefined) return registerImpl(definition)
    if (definitions.has(definition.name)) throw new Error(`duplicate ${definition.name}`)
    definitions.set(definition.name, definition)
    return () => { definitions.delete(definition.name) }
  })
  return {
    definitions,
    register,
    ctx: {
      tools: { register },
      logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    } as unknown as Context,
  }
}

const options = {
  registrationFailure: 'throw' as const,
  serverName: 'yuandian',
  httpTimeoutMs: 15,
  toolCallTimeoutMs: 25,
}

describe('MCP 工具桥接', () => {
  it('分页发现并注册 44 个工具，保留原始名称和 schema', async () => {
    const tools = Array.from({ length: 44 }, (_, index) => ({
      name: `yuandian_tool_${index}`,
      description: `工具 ${index}`,
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    }))
    const client = fakeClient((request) => {
      if (request.method !== 'tools/list') throw new Error('unexpected')
      const cursor = (request.params as { cursor?: string } | undefined)?.cursor
      return cursor === undefined
        ? { tools: tools.slice(0, 20), nextCursor: 'page-2' }
        : { tools: tools.slice(20) }
    })
    const { ctx, definitions } = fakeContext()

    const registered = await syncTools(client, ctx, options, new Map())

    expect(registered).toHaveLength(44)
    expect(definitions).toHaveLength(44)
    expect(definitions.get('mcp__yuandian__yuandian_tool_0')?.parameters).toEqual(tools[0]?.inputSchema)
  })

  it('确定性规范化名称，并传递文本、结构化结果、超时与取消信号', async () => {
    expect(publicToolName('yuandian', 'normal_name')).toBe('mcp__yuandian__normal_name')
    const lossy = publicToolName('yuandian', `名字/${'x'.repeat(80)}`)
    expect(lossy).toHaveLength(64)
    expect(lossy).toMatch(/^mcp__yuandian__/)
    expect(lossy).toBe(publicToolName('yuandian', `名字/${'x'.repeat(80)}`))

    let callOptions: RequestOptions | undefined
    const client = fakeClient((request, requestOptions) => {
      if (request.method === 'tools/list') {
        return {
          tools: [{
            name: 'yuandian_echo',
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
          }],
        }
      }
      callOptions = requestOptions
      expect(request).toMatchObject({
        method: 'tools/call',
        params: { name: 'yuandian_echo', arguments: { value: 'ok' } },
      })
      return {
        content: [{ type: 'text', text: '结果文本' }],
        structuredContent: { count: 1 },
      }
    })
    const { ctx, definitions } = fakeContext()
    await syncTools(client, ctx, options, new Map())
    const definition = definitions.get('mcp__yuandian__yuandian_echo')
    if (definition === undefined) throw new Error('tool missing')
    const abort = new AbortController()

    const result = await definition.execute({ value: 'ok' }, { signal: abort.signal } as never)

    expect(result).toEqual({ content: [{ type: 'text', text: '结果文本' }], structuredContent: { count: 1 } })
    expect(callOptions).toMatchObject({ signal: abort.signal, timeout: 25 })
    expect(definition.output.render({}, result as never)).toEqual([{ type: 'text', text: '结果文本' }])
  })

  it('将远端 isError 转为失败，并传播取消和认证失败且不自动重放', async () => {
    const onUnauthorized = vi.fn()
    let mode: 'remote' | 'cancel' | 'unauthorized' = 'remote'
    let calls = 0
    const client = fakeClient((request, requestOptions) => {
      if (request.method === 'tools/list') return { tools: [{ name: 'dangerous', inputSchema: { type: 'object' } }] }
      calls += 1
      if (mode === 'remote') return { content: [{ type: 'text', text: '远端拒绝' }], isError: true }
      if (mode === 'unauthorized') throw new UnauthorizedError()
      return new Promise((_resolve, reject) => {
        requestOptions?.signal?.addEventListener('abort', () => reject(requestOptions.signal?.reason), { once: true })
      })
    })
    const { ctx, definitions } = fakeContext()
    await syncTools(client, ctx, { ...options, onUnauthorized }, new Map())
    const definition = definitions.get('mcp__yuandian__dangerous')
    if (definition === undefined) throw new Error('tool missing')

    await expect(definition.execute({}, { signal: new AbortController().signal } as never)).rejects.toThrow('远端拒绝')
    mode = 'cancel'
    const abort = new AbortController()
    const cancelled = definition.execute({}, { signal: abort.signal } as never)
    abort.abort(new Error('caller cancelled'))
    await expect(cancelled).rejects.toThrow('caller cancelled')
    mode = 'unauthorized'
    await expect(definition.execute({}, { signal: new AbortController().signal } as never)).rejects.toBeInstanceOf(UnauthorizedError)

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(calls).toBe(3)
  })

  it('列表获取失败保留上一代，注册冲突则整代回滚', async () => {
    const previousDispose = vi.fn()
    const previousDefinition = { name: 'old' } as ToolDefinition
    const previous = new Map([['old', { definition: previousDefinition, dispose: previousDispose }]])
    const failure = fakeClient(() => { throw new Error('list unavailable') })
    const { ctx } = fakeContext()
    await expect(syncTools(failure, ctx, options, previous)).rejects.toThrow('list unavailable')
    expect(previousDispose).not.toHaveBeenCalled()

    const partialDisposers: Array<ReturnType<typeof vi.fn>> = []
    let registrations = 0
    const conflictContext = fakeContext(() => {
      registrations += 1
      if (registrations === 3) throw new Error('foreign conflict')
      const dispose = vi.fn()
      partialDisposers.push(dispose)
      return dispose
    })
    const next = fakeClient(() => ({
      tools: Array.from({ length: 4 }, (_, index) => ({ name: `tool_${index}`, inputSchema: { type: 'object' } })),
    }))
    const restored = await syncTools(next, conflictContext.ctx, options, previous)
    expect(previousDispose).toHaveBeenCalledTimes(1)
    expect(partialDisposers.slice(0, 2).every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(conflictContext.register).toHaveBeenLastCalledWith(previousDefinition)
    expect(restored.get('old')?.definition).toBe(previousDefinition)

    const initialConflict = fakeContext(() => { throw new Error('initial conflict') })
    await expect(syncTools(next, initialConflict.ctx, options, new Map())).rejects.toThrow('initial conflict')
  })

  it('为工具发现设置超时并拒绝重复分页 cursor', async () => {
    const requestOptions: RequestOptions[] = []
    const client = fakeClient((_request, currentOptions) => {
      if (currentOptions !== undefined) requestOptions.push(currentOptions)
      return { tools: [], nextCursor: 'same-page' }
    })
    const { ctx } = fakeContext()

    await expect(syncTools(client, ctx, options, new Map())).rejects.toThrow('重复 cursor')
    expect(requestOptions).toHaveLength(2)
    expect(requestOptions.every(value => value.timeout === options.httpTimeoutMs)).toBe(true)
  })
})
