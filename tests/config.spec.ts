import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'

describe('插件配置安全边界', () => {
  it('要求远端 MCP 使用 HTTPS', () => {
    expect(() => resolveConfig({ endpoint: 'http://example.com/mcp' })).toThrow('必须使用 https')
    expect(resolveConfig({ endpoint: 'http://127.0.0.1:3000/mcp' }).endpoint).toBe('http://127.0.0.1:3000/mcp')
    expect(resolveConfig({ endpoint: 'http://localhost:3000/mcp' }).endpoint).toBe('http://localhost:3000/mcp')
  })

  it('拒绝在 endpoint 中嵌入凭证并解析 HTTP 超时', () => {
    expect(() => resolveConfig({ endpoint: 'https://user:secret@example.com/mcp' })).toThrow('不得包含用户名或密码')
    expect(resolveConfig({ httpTimeoutMs: 12_345 }).httpTimeoutMs).toBe(12_345)
    expect(() => resolveConfig({ httpTimeoutMs: 0 })).toThrow('httpTimeoutMs 必须是正数')
  })
})
