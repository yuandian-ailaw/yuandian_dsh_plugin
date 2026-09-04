import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_OAUTH_START_CREDENTIAL_REF } from '../auth/constants.js'
import { asCredentialRef } from '../auth/store.js'
import type { ResolvedConfig } from '../config.js'
import { safeErrorMessage } from '../logging.js'
import { startConnection } from './connection.js'

export async function registerMcpBridge(ctx: Context, config: ResolvedConfig): Promise<void> {
  const connection = startConnection(ctx, config)
  ctx.effect(() => () => connection.dispose(), 'yuandian.mcp')
  if (config.auth.mode === 'auto') {
    const apiKeyRef = asCredentialRef(config.auth.apiKeyCredentialRef)
    const oauthRef = asCredentialRef(config.auth.oauthCredentialRef)
    const oauthStartRef = asCredentialRef(DEFAULT_OAUTH_START_CREDENTIAL_REF)
    let consumedOAuthStart: string | undefined
    ctx.effect(
      () => ctx.on('credentials/reference-updated', (ref) => {
        if (ref === apiKeyRef) {
          ctx.logger.debug('华宇元典法律数据：API Key 状态已变化，重新选择认证方式')
          void connection.restart()
          return
        }
        if (ref === oauthStartRef) {
          void ctx.credentials.resolve(oauthStartRef).then((resolved) => {
            if (resolved === undefined) return
            const attempt = resolved.value
            if (attempt === consumedOAuthStart) return
            consumedOAuthStart = attempt
            ctx.logger.debug('华宇元典法律数据：用户已主动发起 OAuth 认证')
            void connection.requestOAuth().catch((error: unknown) => {
              ctx.logger.warn('华宇元典法律数据：OAuth 认证未完成：%s', safeErrorMessage(error))
            }).finally(async () => {
              try {
                const current = await ctx.credentials.resolve(oauthStartRef)
                if (current?.value === attempt) await ctx.credentials.unset(oauthStartRef)
              } catch (error) {
                ctx.logger.warn('华宇元典法律数据：清理 OAuth 授权状态失败：%s', safeErrorMessage(error))
              }
            })
          }).catch((error: unknown) => {
            ctx.logger.warn('华宇元典法律数据：读取 OAuth 启动状态失败：%s', safeErrorMessage(error))
          })
          return
        }
        if (ref !== oauthRef) return
        void ctx.credentials.resolve(oauthRef).then((resolved) => {
          if (resolved !== undefined) return
          ctx.logger.debug('华宇元典法律数据：OAuth 凭证已清理，进入未认证待机状态')
          return connection.restart()
        }).catch((error: unknown) => {
          ctx.logger.warn('华宇元典法律数据：检查 OAuth 凭证状态失败：%s', safeErrorMessage(error))
        })
      }),
      'yuandian.mcp.credentials',
    )
  }
  const outcome = await connection.ready
  if (outcome.error !== undefined && config.failOnStartupError) {
    throw new Error(`元典 MCP 初始连接或工具同步失败：${safeErrorMessage(outcome.error)}`)
  }
}

export { startConnection } from './connection.js'
export type { ConnectionDependencies, ConnectionHandle, ConnectionOutcome } from './connection.js'
export { publicToolName, syncTools } from './tools.js'
export type { McpResult, ToolBridgeOptions, ToolDisposers, ToolRegistration, ToolRegistrations } from './tools.js'
