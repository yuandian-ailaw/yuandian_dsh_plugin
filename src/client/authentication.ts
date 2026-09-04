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

export async function cancelOAuthAuthorization(api: CredentialsApi): Promise<void> {
  for (const ref of [
    DEFAULT_OAUTH_CREDENTIAL_REF,
    DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
    DEFAULT_OAUTH_START_CREDENTIAL_REF,
  ]) {
    const response = await api.credentials.unset(ref)
    if (!response.ok) throw new Error(response.error.message)
  }
}
