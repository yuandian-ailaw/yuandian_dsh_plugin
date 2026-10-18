import type { CredentialInfo as CredentialView } from '@deepseek-ai/dsh-credentials/types'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import {
  DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
  DEFAULT_OAUTH_START_CREDENTIAL_REF,
} from '../auth/constants.js'

export type CredentialsApi = Pick<ClientRemote, 'credentials'>

export type OAuthCancellationAvailability = 'hidden' | 'enabled' | 'readonly'

export function oauthAuthorizationView(
  credential: CredentialView,
  authorized: CredentialView,
): CredentialView {
  return {
    configured: authorized.configured,
    writable: credential.writable && authorized.writable,
    ...(authorized.source !== undefined ? { source: authorized.source } : {}),
  }
}

export function oauthCancellationAvailability(credential: CredentialView): OAuthCancellationAvailability {
  if (!credential.configured) return 'hidden'
  return credential.writable === false ? 'readonly' : 'enabled'
}

/** Verify removal against the effective value, including DSH ambient fallbacks. */
export async function removeCredentials(api: CredentialsApi, refs: string[]): Promise<void> {
  for (const ref of refs) {
    const response = await api.credentials.unset(ref)
    if (!response.ok) throw new Error(response.error.message)
  }
  const response = await api.credentials.describe(refs)
  if (!response.ok) throw new Error(response.error.message)
  for (const ref of refs) {
    const view = response.value[ref]
    if (view === undefined) throw new Error('无法确认凭据清除结果，请刷新后重试。')
    if (view.configured) {
      throw new Error('存储的凭据已清除，但环境变量或其他来源仍提供有效凭据。请清理对应来源并刷新后重试。')
    }
  }
}

export async function cancelOAuthAuthorization(api: CredentialsApi): Promise<void> {
  await removeCredentials(api, [
    DEFAULT_OAUTH_CREDENTIAL_REF,
    DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
    DEFAULT_OAUTH_START_CREDENTIAL_REF,
  ])
}
