import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config.js'
import { name } from '../src/index.js'
import { PLUGIN_VERSION } from '../src/version.js'
import packageJson from '../package.json' with { type: 'json' }

describe('插件工程骨架', () => {
  it('公开稳定的插件名称和生产默认入口', () => {
    expect(name).toBe('huayu-yuandian-legal-data')
    expect(PLUGIN_VERSION).toBe(packageJson.version)
    expect(DEFAULT_CONFIG.endpoint).toBe('https://open.chineselaw.com/mcp')
    expect(DEFAULT_CONFIG.auth).toMatchObject({
      mode: 'auto',
      oauthCredentialRef: 'YUANDIAN_MCP_OAUTH',
      apiKeyCredentialRef: 'YUANDIAN_API_KEY',
    })
  })
})
