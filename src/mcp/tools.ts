/**
 * MCP tool bridge adapted from DeepSeek Harness's MIT-licensed mcp-client.
 * See THIRD_PARTY_NOTICES.md for source attribution.
 */
import { createHash } from 'node:crypto'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Context } from '@deepseek-ai/cordis'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode, ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { safeErrorMessage } from '../logging.js'

const MAX_PUBLIC_NAME_LENGTH = 64
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12
const MAX_TOOL_LIST_PAGES = 100
const MAX_DISCOVERED_TOOLS = 1_000

export interface ToolBridgeOptions {
  readonly registrationFailure: 'contain' | 'throw'
  readonly serverName: string
  readonly httpTimeoutMs: number
  readonly toolCallTimeoutMs: number
  readonly onUnauthorized?: () => void
}

export interface ToolRegistration {
  readonly definition: ToolDefinition
  readonly dispose: () => void
}

export type ToolRegistrations = Map<string, ToolRegistration>
export type McpResult<Structured extends JsonValue = JsonValue> = {
  content: JsonValue[]
  structuredContent?: Structured
}

interface McpContentBlock {
  readonly type: string
  readonly text?: string
  readonly mimeType?: string
}

export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

function supportedOutputSchema(candidate: unknown): JsonSchemaNode | undefined {
  if (candidate === undefined) return undefined
  try {
    assertSupportedJsonSchema(candidate)
    return candidate
  } catch {
    return undefined
  }
}

function extractText(content: JsonValue[], rawName: string): string {
  const parts: string[] = []
  for (const value of content) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      parts.push('[unsupported content type: unknown]')
      continue
    }
    const block = value as unknown as McpContentBlock
    if (block.type === 'text' && block.text !== undefined) parts.push(block.text)
    else if (block.type === 'image') parts.push(`[image: ${block.mimeType ?? 'unknown'}, content discarded]`)
    else if (block.type === 'audio') parts.push(`[audio: ${block.mimeType ?? 'unknown'}, content discarded]`)
    else if (block.type === 'resource' || block.type === 'resource_link') parts.push('[resource: content discarded]')
    else parts.push(`[unsupported content type: ${block.type}]`)
  }
  return parts.join('\n') || `(${rawName} returned no text content)`
}

function outputDefinition(rawName: string, structuredSchema: JsonSchemaNode | undefined): ToolDefinition['output'] {
  return {
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: {} },
        structuredContent: structuredSchema ?? {},
      },
      required: structuredSchema === undefined ? ['content'] : ['content', 'structuredContent'],
      additionalProperties: false,
    },
    render(_args, value) {
      const result = value as unknown as McpResult
      return [{ type: 'text', text: extractText(result.content, rawName) }]
    },
  }
}

function executor(client: Client, rawName: string, taskRequired: boolean, options: ToolBridgeOptions): ToolDefinition['execute'] {
  return async (args, execution) => {
    if (taskRequired) throw new Error(`MCP 工具 ${rawName} 要求 task execution，当前插件尚不支持`)
    const argumentsValue = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {}
    let result
    try {
      result = await client.request(
        { method: 'tools/call', params: { name: rawName, arguments: argumentsValue } },
        CallToolResultSchema,
        { signal: execution.signal, timeout: options.toolCallTimeoutMs },
      )
    } catch (error) {
      if (error instanceof UnauthorizedError) options.onUnauthorized?.()
      throw error
    }
    const content = Array.isArray(result.content)
      ? result.content as unknown as JsonValue[]
      : [{ type: 'text', text: '(no output)' }] as JsonValue[]
    const text = extractText(content, rawName)
    if (result.isError === true) throw new Error(text)
    return {
      content,
      ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent as JsonValue } : {}),
    }
  }
}

export async function syncTools(
  client: Client,
  ctx: Context,
  options: ToolBridgeOptions,
  previous: ToolRegistrations,
): Promise<ToolRegistrations> {
  const definitions = new Map<string, ToolDefinition>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  let pages = 0
  do {
    pages += 1
    if (pages > MAX_TOOL_LIST_PAGES) throw new Error(`元典 MCP 工具列表超过 ${MAX_TOOL_LIST_PAGES} 页上限`)
    const result = await client.request(
      { method: 'tools/list', ...(cursor === undefined ? {} : { params: { cursor } }) },
      ListToolsResultSchema,
      { timeout: options.httpTimeoutMs },
    )
    for (const tool of result.tools) {
      const publicName = publicToolName(options.serverName, tool.name)
      if (definitions.has(publicName)) throw new Error(`元典 MCP 重复返回工具：${tool.name}`)
      definitions.set(publicName, {
        name: publicName,
        description: tool.description ?? '',
        parameters: tool.inputSchema,
        output: outputDefinition(tool.name, supportedOutputSchema(tool.outputSchema)),
        execute: executor(client, tool.name, tool.execution?.taskSupport === 'required', options),
        timeoutMs: options.toolCallTimeoutMs,
      })
      if (definitions.size > MAX_DISCOVERED_TOOLS) {
        throw new Error(`元典 MCP 工具数量超过 ${MAX_DISCOVERED_TOOLS} 个上限`)
      }
    }
    const nextCursor = result.nextCursor
    if (nextCursor !== undefined && nextCursor !== '') {
      if (cursors.has(nextCursor)) throw new Error(`元典 MCP 工具列表返回重复 cursor：${nextCursor}`)
      cursors.add(nextCursor)
    }
    cursor = nextCursor
  } while (cursor !== undefined && cursor !== '')

  for (const registration of previous.values()) registration.dispose()
  const next: ToolRegistrations = new Map()
  try {
    for (const [publicName, definition] of definitions) {
      next.set(publicName, { definition, dispose: ctx.tools.register(definition) })
    }
  } catch (error) {
    for (const registration of next.values()) registration.dispose()

    const restored: ToolRegistrations = new Map()
    const restoreErrors: unknown[] = []
    for (const [publicName, registration] of previous) {
      try {
        restored.set(publicName, {
          definition: registration.definition,
          dispose: ctx.tools.register(registration.definition),
        })
      } catch (restoreError) {
        restoreErrors.push(restoreError)
      }
    }

    const outcome = previous.size === 0
      ? '已回滚本次注册'
      : restoreErrors.length === 0
        ? '已恢复上一代工具'
        : `上一代工具恢复不完整（${restored.size}/${previous.size}）`
    ctx.logger.error('华宇元典法律数据：工具整代注册失败，%s：%s', outcome, safeErrorMessage(error))

    if (options.registrationFailure === 'throw' && previous.size === 0) throw error
    return restored
  }
  return next
}

/** @deprecated 使用 ToolRegistrations。 */
export type ToolDisposers = ToolRegistrations
