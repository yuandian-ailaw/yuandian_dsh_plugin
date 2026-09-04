import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'

const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface PersistedOAuthState {
  readonly version: 1
  readonly clientInformation?: OAuthClientInformationMixed
  readonly tokens?: OAuthTokens
  readonly codeVerifier?: string
  readonly discoveryState?: OAuthDiscoveryState
}

export function asCredentialRef(value: string): CredentialRef {
  if (!CREDENTIAL_REF_PATTERN.test(value)) {
    throw new TypeError(`credentialRef 必须匹配 ${String(CREDENTIAL_REF_PATTERN)}`)
  }
  return value as CredentialRef
}

function parseStoredState(value: string, ref: string): PersistedOAuthState {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`OAuth 凭证引用 ${ref} 的内容不是有效 JSON，请清理后重新授权`, { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || (parsed as { version?: unknown }).version !== 1) {
    throw new Error(`OAuth 凭证引用 ${ref} 的版本不受支持，请清理后重新授权`)
  }
  return parsed as PersistedOAuthState
}

export class OAuthCredentialStore {
  readonly ref: CredentialRef
  private writes: Promise<void> = Promise.resolve()

  constructor(
    private readonly credentials: CredentialProvider,
    ref: string,
  ) {
    this.ref = asCredentialRef(ref)
  }

  async read(): Promise<PersistedOAuthState> {
    await this.writes
    const resolved = await this.credentials.resolve(this.ref)
    return resolved === undefined ? { version: 1 } : parseStoredState(resolved.value, this.ref)
  }

  update(change: (current: PersistedOAuthState) => PersistedOAuthState): Promise<void> {
    const operation = this.writes.then(async () => {
      const resolved = await this.credentials.resolve(this.ref)
      const current = resolved === undefined ? { version: 1 as const } : parseStoredState(resolved.value, this.ref)
      await this.credentials.set(this.ref, JSON.stringify(change(current)))
    })
    this.writes = operation.catch(() => {})
    return operation
  }

  async clear(): Promise<void> {
    await this.writes
    await this.credentials.unset(this.ref)
  }
}

export async function resolveApiKey(credentials: CredentialProvider, refValue: string): Promise<string> {
  const ref = asCredentialRef(refValue)
  const resolved = await credentials.resolve(ref)
  if (resolved === undefined) {
    throw new Error(`API Key 凭证 ${refValue} 未配置，请先在 DSH credentials 中设置该引用`)
  }
  return resolved.value
}
