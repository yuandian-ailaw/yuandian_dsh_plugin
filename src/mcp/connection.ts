/** Connection supervision semantics adapted from DeepSeek Harness (MIT). */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Context } from '@deepseek-ai/cordis'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ResolvedConfig } from '../config.js'
import { safeErrorMessage } from '../logging.js'
import { PLUGIN_VERSION } from '../version.js'
import { AuthenticationRequiredError, McpAuthentication, asTransport } from './authentication.js'
import { syncTools } from './tools.js'
import type { ToolBridgeOptions, ToolRegistrations } from './tools.js'

export interface ConnectionOutcome {
  readonly authenticationRequired?: boolean
  readonly error?: unknown
}
export interface ConnectionHandle {
  readonly ready: Promise<ConnectionOutcome>
  requestOAuth(): Promise<void>
  restart(): Promise<void>
  dispose(): Promise<void>
}

export interface ConnectionDependencies {
  readonly createClient?: () => Client
  readonly createTransport?: () => Promise<StreamableHTTPClientTransport>
  readonly finishAuthorization?: (transport: StreamableHTTPClientTransport) => Promise<boolean>
  readonly cancelPendingAuthorization?: () => Promise<void>
  readonly closeAuthentication?: () => Promise<void>
}

export function startConnection(ctx: Context, config: ResolvedConfig, dependencies: ConnectionDependencies = {}): ConnectionHandle {
  const label = `元典 MCP(${config.serverName})`
  const abort = new AbortController()
  const authentication = new McpAuthentication(ctx, config, abort.signal)
  const createClient = dependencies.createClient ?? (() => new Client(
    { name: 'huayu-yuandian-legal-data', version: PLUGIN_VERSION },
    { capabilities: {} },
  ))
  const createTransport = dependencies.createTransport ?? (() => authentication.createTransport())
  const finishAuthorization = dependencies.finishAuthorization ?? (transport => authentication.finishAuthorization(transport))
  const cancelPendingAuthorization = dependencies.cancelPendingAuthorization ?? (() => authentication.cancelPendingAuthorization())
  const closeAuthentication = dependencies.closeAuthentication ?? (() => authentication.close())

  let disposed = false
  let current: { client: Client; transport: StreamableHTTPClientTransport; established: boolean } | undefined
  let tools: ToolRegistrations = new Map()
  let reconnectTimer: NodeJS.Timeout | undefined
  let failedAttempts = 0
  let connectedAt: number | undefined
  let firstError: unknown
  let settling: Promise<void>
  let syncChain = Promise.resolve()
  let runtimeAuthorization: Promise<void> | undefined
  let restartChain = Promise.resolve()

  const bridgeOptions = (registrationFailure: 'contain' | 'throw'): ToolBridgeOptions => ({
    registrationFailure,
    serverName: config.serverName,
    httpTimeoutMs: config.httpTimeoutMs,
    toolCallTimeoutMs: config.toolCallTimeoutMs,
    onUnauthorized: () => requestRuntimeAuthorization(),
  })

  function isCurrent(client: Client): boolean {
    return !disposed && current?.client === client
  }

  function enqueueSync(client: Client, registrationFailure: 'contain' | 'throw'): Promise<void> {
    const run = syncChain.then(async () => {
      if (!isCurrent(client)) return
      tools = await syncTools(client, ctx, bridgeOptions(registrationFailure), tools)
    })
    syncChain = run.catch(() => {})
    return run
  }

  function unregisterTools(): Promise<void> {
    const run = syncChain.then(() => {
      for (const registration of tools.values()) registration.dispose()
      tools = new Map()
    })
    syncChain = run.catch(() => {})
    return run
  }

  async function closeGeneration(generation: { client: Client; transport: StreamableHTTPClientTransport }): Promise<void> {
    try {
      await generation.client.close()
    } catch (error) {
      ctx.logger.debug(`${label}：关闭已失效连接时收到异常：${safeErrorMessage(error)}`)
    }
  }

  function requestRuntimeAuthorization(): void {
    const generation = current
    if (generation === undefined || !generation.established || runtimeAuthorization !== undefined || disposed) return
    runtimeAuthorization = (async () => {
      ctx.logger.warn(`${label}：认证已失效，等待重新授权；当前工具调用不会自动重放`)
      try {
        if (!await finishAuthorization(generation.transport)) {
          throw new Error('当前认证方式不支持交互式重新授权')
        }
        if (!isCurrent(generation.client)) return
        current = undefined
        await closeGeneration(generation)
        failedAttempts = 0
        settling = connectGeneration(false)
        await settling
      } catch (error) {
        if (!disposed) {
          ctx.logger.error(`${label}：重新授权失败：${safeErrorMessage(error)}`)
          if (isCurrent(generation.client)) {
            current = undefined
            await closeGeneration(generation)
            scheduleReconnect(true)
          }
        }
      } finally {
        runtimeAuthorization = undefined
      }
    })()
  }

  function scheduleReconnect(lostConnection: boolean): void {
    if (disposed) return
    if (!config.reconnect.enabled) {
      ctx.logger.error(`${label}：连接已断开且自动重连已禁用`)
      return
    }
    if (connectedAt !== undefined && Date.now() - connectedAt >= config.reconnect.maxDelayMs) failedAttempts = 0
    connectedAt = undefined
    failedAttempts += 1
    if (failedAttempts > config.reconnect.maxAttempts) {
      void unregisterTools()
      ctx.logger.error(`${label}：连续重连 ${config.reconnect.maxAttempts} 次失败，已注销工具`)
      return
    }
    const delay = Math.min(config.reconnect.maxDelayMs, config.reconnect.initialDelayMs * 2 ** (failedAttempts - 1))
    ctx.logger.warn(`${label}：${lostConnection ? '连接中断' : '连接失败'}，${delay}ms 后重试（${failedAttempts}/${config.reconnect.maxAttempts}）`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      settling = connectGeneration(false)
    }, delay)
    reconnectTimer.unref()
  }

  async function connectGeneration(startup: boolean): Promise<void> {
    while (!disposed) {
      let client: Client
      let transport: StreamableHTTPClientTransport
      try {
        client = createClient()
        transport = await createTransport()
      } catch (error) {
        if (firstError === undefined) firstError = error
        if (error instanceof AuthenticationRequiredError) {
          await unregisterTools()
          ctx.logger.debug(`${label}：未配置认证，等待用户在设置页选择 OAuth 或 API Key`)
          return
        }
        if (!disposed) ctx.logger.warn(`${label}：创建连接失败：${safeErrorMessage(error)}`)
        scheduleReconnect(false)
        return
      }
      const generation = { client, transport, established: false }
      current = generation
      client.onclose = () => {
        if (!isCurrent(client) || !generation.established) return
        current = undefined
        scheduleReconnect(true)
      }
      client.onerror = (error) => {
        if (error instanceof UnauthorizedError && generation.established) requestRuntimeAuthorization()
        else if (!disposed) ctx.logger.debug(`${label}：客户端事件：${safeErrorMessage(error)}`)
      }
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        if (!isCurrent(client)) return
        ctx.logger.debug(`${label}：工具列表发生变化，开始同步`)
        try {
          await enqueueSync(client, 'contain')
        } catch (error) {
          if (!disposed) ctx.logger.error(`${label}：工具列表同步失败，保留上一代：${safeErrorMessage(error)}`)
        }
      })
      try {
        await client.connect(asTransport(transport), { timeout: config.httpTimeoutMs })
        await enqueueSync(client, startup && config.failOnStartupError ? 'throw' : 'contain')
        if (!isCurrent(client)) return
        generation.established = true
        connectedAt = Date.now()
        if (failedAttempts > 0) ctx.logger.debug(`${label}：重连并同步成功`)
        return
      } catch (error) {
        if (firstError === undefined) firstError = error
        if (error instanceof AuthenticationRequiredError) {
          await closeGeneration(generation)
          if (isCurrent(client)) current = undefined
          await unregisterTools()
          ctx.logger.debug(`${label}：OAuth 需要用户交互，等待在设置页主动发起`)
          return
        }
        if (error instanceof UnauthorizedError) {
          try {
            if (!await finishAuthorization(transport)) throw error
            await closeGeneration(generation)
            if (isCurrent(client)) current = undefined
            ctx.logger.debug(`${label}：OAuth 授权完成，重新建立连接`)
            continue
          } catch (authError) {
            if (firstError === error) firstError = authError
            await closeGeneration(generation)
            if (isCurrent(client)) current = undefined
            if (!disposed) ctx.logger.warn(`${label}：OAuth 授权失败：${safeErrorMessage(authError)}`)
            scheduleReconnect(false)
            return
          }
        }
        await closeGeneration(generation)
        if (isCurrent(client)) current = undefined
        if (!disposed) ctx.logger.warn(`${label}：连接尝试失败：${safeErrorMessage(error)}`)
        scheduleReconnect(false)
        return
      }
    }
  }

  settling = connectGeneration(true)
  const ready = settling.then(() => {
    if (current?.established === true) return {}
    if (firstError instanceof AuthenticationRequiredError) return { authenticationRequired: true }
    return { error: firstError ?? new Error(`${label}：初始连接失败`) }
  })

  function restart(): Promise<void> {
    const operation = restartChain.then(async () => {
      if (disposed) return
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      await authentication.close()
      const generation = current
      current = undefined
      if (generation !== undefined) await closeGeneration(generation)
      failedAttempts = 0
      connectedAt = undefined
      settling = connectGeneration(false)
      await settling
    })
    restartChain = operation.catch(() => {})
    return operation
  }

  return {
    ready,
    async requestOAuth(): Promise<void> {
      authentication.requestOAuth()
      await cancelPendingAuthorization()
      await restart()
    },
    restart,
    async dispose(): Promise<void> {
      disposed = true
      abort.abort()
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
      await closeAuthentication()
      const generation = current
      current = undefined
      if (generation !== undefined) await closeGeneration(generation)
      await settling
      await runtimeAuthorization
      await restartChain
      await syncChain
      for (const registration of tools.values()) registration.dispose()
      tools = new Map()
    },
  }
}
