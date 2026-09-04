import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'
import type { Config as PluginConfig } from './config.js'
import { resolveConfig } from './config.js'
import { registerBundledSkills } from './skills.js'
import { registerMcpBridge } from './mcp/index.js'

type Config = PluginConfig

export const name = 'huayu-yuandian-legal-data'
export const inject = ['tools', 'skills', 'credentials']

const Auth = z.union([
  z.object({
    mode: z.const('auto'),
    callbackPort: z.number().min(1).max(65_535).default(1455),
    openBrowser: z.boolean().default(true),
    timeoutMs: z.number().min(1).default(300_000),
  }),
  z.object({
    mode: z.const('oauth'),
    credentialRef: z.string().default('YUANDIAN_MCP_OAUTH'),
    callbackPort: z.number().min(1).max(65_535).default(1455),
    openBrowser: z.boolean().default(true),
    timeoutMs: z.number().min(1).default(300_000),
  }),
  z.object({
    mode: z.const('api-key'),
    credentialRef: z.string().default('YUANDIAN_API_KEY'),
  }),
])

export const Config = z.object({
  endpoint: z.string().default('https://open.chineselaw.com/mcp'),
  serverName: z.string().pattern(/^[A-Za-z0-9_-]{1,32}$/).default('yuandian'),
  auth: Auth,
  httpTimeoutMs: z.number().min(1).default(60_000),
  toolCallTimeoutMs: z.number().min(1).default(60_000),
  failOnStartupError: z.boolean().default(true),
  reconnect: z.object({
    enabled: z.boolean().default(true),
    initialDelayMs: z.number().min(1).default(500),
    maxDelayMs: z.number().min(1).default(30_000),
    maxAttempts: z.number().min(1).step(1).default(10),
  }),
}) as unknown as z<Config>

export async function apply(ctx: Context, _config: Config): Promise<void> {
  await registerBundledSkills(ctx)
  await registerMcpBridge(ctx, resolveConfig(_config))
}
