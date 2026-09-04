import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { CredentialInfo as CredentialView } from '@deepseek-ai/dsh-credentials/types'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  DEFAULT_API_KEY_CREDENTIAL_REF,
  DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
  DEFAULT_OAUTH_START_CREDENTIAL_REF,
} from '../auth/constants.js'
import {
  cancelOAuthAuthorization,
  oauthAuthorizationView,
  oauthCancellationAvailability,
} from './authentication.js'
import type { CredentialsApi } from './authentication.js'
import logoUrl from '../../assets/logo.svg'
import { PLUGIN_VERSION } from '../version.js'

export const DISPLAY_NAME = '华宇元典法律数据'
export const CLIENT_PLUGIN_VERSION = PLUGIN_VERSION

export const RESOURCE_GROUPS = [
  {
    title: '产品功能',
    description: '开放平台接入、开发与账户服务',
    links: [
      { label: 'API 广场', href: 'https://open.chineselaw.com/api-square' },
      { label: 'MCP Server', href: 'https://open.chineselaw.com/mcp-config' },
      { label: '接口文档', href: 'https://open.chineselaw.com/docs' },
      { label: '充值中心', href: 'https://open.chineselaw.com/shop' },
    ],
  },
  {
    title: '公司',
    description: '了解元典并获取商务与产品支持',
    links: [
      { label: '关于我们', href: 'https://yuandian.ailaw.cn/' },
      { label: '联系我们', href: 'https://yuandian.feishu.cn/share/base/form/shrcnX8MRiwL8DAksin7t85XjUd' },
    ],
  },
  {
    title: '元典生态',
    description: '覆盖法律知识、智能协作、数据安全与生产力工具',
    links: [
      { label: '元典智库', href: 'https://www.chineselaw.com/' },
      { label: '元典 Amicus', href: 'https://ami.ailaw.cn/' },
      { label: '元典脱敏', href: 'https://tuomin.ailaw.cn/' },
      { label: '法律元力', href: 'https://yuanli.ailaw.cn/' },
    ],
  },
] as const

export const LEGAL_CAPABILITIES = ['法规检索', '案例检索', '企业查询', '证券合规'] as const

export const inject = ['slots', 'remote', 'remote.credentials']

export function apply(ctx: ClientContext): void {
  const api = ctx.remote
  ctx.effect(installSettingsNavIcon, 'yuandian: settings navigation icon')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'yuandian-legal-data',
    order: 30,
    label: DISPLAY_NAME,
  }, () => <YuandianSettingsSection api={api} />))
}

interface AuthenticationState {
  readonly loading: boolean
  readonly apiKey: CredentialView
  readonly oauth: CredentialView
  readonly oauthPending: boolean
}

const EMPTY_CREDENTIAL: CredentialView = { configured: false, writable: true }

const NAV_ICON_ATTRIBUTE = 'data-yuandian-settings-nav-icon'

/** Replace the shell's unknown-section fallback gear with the legal-data glyph. */
export function installSettingsNavIcon(): () => void {
  const replacements = new Map<HTMLElement, { fallback: SVGElement, fallbackDisplay: string, icon: HTMLSpanElement }>()

  const scan = (): void => {
    for (const [button] of replacements) {
      if (!button.isConnected) replacements.delete(button)
    }
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('nav button'))) {
      if (button.textContent?.trim() !== DISPLAY_NAME || replacements.has(button)) continue
      const fallback = button.querySelector(':scope > svg') as SVGElement | null
      const label = button.querySelector(':scope > span') as HTMLElement | null
      if (fallback === null || label === null) continue

      const icon = document.createElement('span')
      icon.setAttribute(NAV_ICON_ATTRIBUTE, '')
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = '⚖'
      Object.assign(icon.style, {
        display: 'grid',
        width: '16px',
        height: '16px',
        flex: '0 0 16px',
        placeItems: 'center',
        color: 'currentColor',
        fontSize: '15px',
        lineHeight: '16px',
      })
      const fallbackDisplay = fallback.style.display
      fallback.style.display = 'none'
      button.insertBefore(icon, label)
      replacements.set(button, { fallback, fallbackDisplay, icon })
    }
  }

  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true })
  scan()

  return () => {
    observer.disconnect()
    for (const { fallback, fallbackDisplay, icon } of replacements.values()) {
      fallback.style.display = fallbackDisplay
      icon.remove()
    }
    replacements.clear()
  }
}

const styles = {
  section: {
    display: 'flex',
    maxWidth: 720,
    flexDirection: 'column',
    gap: 11,
    color: 'var(--dsw-alias-label-primary)',
  },
  hero: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  heroCopy: {
    minWidth: 0,
  },
  authLaunch: {
    display: 'flex',
    marginLeft: 'auto',
    flex: '0 0 auto',
    alignItems: 'flex-end',
    flexDirection: 'column',
    gap: 4,
  },
  authStatus: {
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 10,
    lineHeight: '16px',
  },
  authButton: {
    minWidth: 104,
    padding: '7px 12px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10,
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-layer-2)',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '18px',
    cursor: 'pointer',
  },
  logoFrame: {
    boxSizing: 'border-box',
    display: 'grid',
    width: 72,
    height: 72,
    flex: '0 0 72px',
    placeItems: 'center',
    overflow: 'hidden',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 16,
    background: 'var(--dsw-alias-bg-module-platform)',
  },
  logo: {
    display: 'block',
    width: 56,
    height: 56,
    objectFit: 'contain',
  },
  eyebrow: {
    margin: '0 0 2.2px',
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.08em',
    lineHeight: '18px',
  },
  title: {
    margin: 0,
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 20,
    fontWeight: 600,
    lineHeight: '30px',
  },
  packageName: {
    margin: '2.2px 0 0',
    color: 'var(--dsw-alias-label-secondary)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: '18px',
    overflowWrap: 'anywhere',
  },
  intro: {
    margin: 0,
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 14,
    lineHeight: '22px',
  },
  card: {
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 0,
    overflow: 'hidden',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
  },
  fact: {
    display: 'flex',
    minHeight: 64,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 3.3,
    padding: '8.8px 12px',
    borderRight: '1px solid var(--dsw-alias-border-l2)',
  },
  factLabel: {
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 12,
    lineHeight: '18px',
  },
  factValue: {
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 14,
    fontWeight: 500,
    lineHeight: '22px',
  },
  footer: {
    alignSelf: 'flex-end',
    margin: '0 2px',
    padding: '2.2px 6px',
    borderRadius: 999,
    color: 'var(--dsw-alias-label-tertiary)',
    background: 'var(--dsw-alias-bg-layer-2)',
    fontSize: 12,
    lineHeight: '18px',
  },
  resourceHub: {
    display: 'flex',
    flexDirection: 'column',
    gap: 11,
    padding: '13.2px 12px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderTop: '3px solid #289a8f',
    borderRadius: 12,
  },
  capabilityTags: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    columnGap: 4,
    rowGap: 4.4,
    flexWrap: 'wrap',
  },
  capabilityTag: {
    padding: '2.2px 7px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 999,
    color: 'var(--dsw-alias-label-secondary)',
    background: 'var(--dsw-alias-bg-layer-2)',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '16px',
  },
  resourceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    columnGap: 8,
    rowGap: 8.8,
  },
  resourceGroup: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: 6.6,
    padding: '11px 10px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-module-platform)',
  },
  resourceGroupWide: {
    gridColumn: '1 / -1',
  },
  resourceGroupHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2.2,
  },
  resourceGroupTitle: {
    margin: 0,
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: '20px',
  },
  resourceGroupDescription: {
    margin: 0,
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 11,
    lineHeight: '17px',
  },
  resourceLinks: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2.2,
  },
  resourceLinksWide: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    columnGap: 4,
    rowGap: 4.4,
  },
  resourceLink: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '5.5px 8px',
    border: '1px solid transparent',
    borderRadius: 8,
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-layer-2)',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: '18px',
    textDecoration: 'none',
  },
  resourceLinkLabel: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resourceLinkDomain: {
    flex: '0 1 auto',
    overflow: 'hidden',
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 10,
    fontWeight: 400,
    lineHeight: '16px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dialogBackdrop: {
    position: 'fixed',
    zIndex: 1000,
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    background: 'rgba(15, 23, 42, 0.32)',
  },
  dialog: {
    boxSizing: 'border-box',
    width: 'min(440px, 100%)',
    overflow: 'hidden',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 16,
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-module-platform)',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.22)',
  },
  dialogHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    padding: '20px 20px 14px',
  },
  dialogTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    lineHeight: '26px',
  },
  dialogDescription: {
    margin: '4px 0 0',
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 12,
    lineHeight: '19px',
  },
  closeButton: {
    padding: '5px 8px',
    border: '1px solid transparent',
    borderRadius: 8,
    color: 'var(--dsw-alias-label-secondary)',
    background: 'transparent',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  },
  tabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4,
    margin: '0 20px',
    padding: 4,
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-2)',
  },
  tab: {
    padding: '7px 10px',
    border: 0,
    borderRadius: 8,
    color: 'var(--dsw-alias-label-secondary)',
    background: 'transparent',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabActive: {
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-module-platform)',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.10)',
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 20,
  },
  methodState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-2)',
    fontSize: 12,
    lineHeight: '18px',
  },
  methodStateValue: {
    color: '#21877d',
    fontWeight: 600,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
  },
  secretInput: {
    boxSizing: 'border-box',
    width: '100%',
    padding: '9px 11px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 9,
    color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-module-platform)',
    font: 'inherit',
    fontSize: 12,
    lineHeight: '18px',
    outline: 'none',
  },
  helpText: {
    margin: 0,
    color: 'var(--dsw-alias-label-tertiary)',
    fontSize: 11,
    lineHeight: '18px',
  },
  notice: {
    margin: 0,
    padding: '8px 10px',
    borderRadius: 8,
    color: '#176f67',
    background: 'rgba(40, 154, 143, 0.10)',
    fontSize: 11,
    lineHeight: '18px',
  },
  error: {
    margin: 0,
    padding: '8px 10px',
    borderRadius: 8,
    color: '#b42318',
    background: 'rgba(180, 35, 24, 0.08)',
    fontSize: 11,
    lineHeight: '18px',
  },
  confirmation: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid rgba(180, 35, 24, 0.24)',
    borderRadius: 9,
    background: 'rgba(180, 35, 24, 0.06)',
  },
  confirmationText: {
    margin: 0,
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 11,
    lineHeight: '18px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  secondaryButton: {
    padding: '7px 11px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 9,
    color: 'var(--dsw-alias-label-secondary)',
    background: 'transparent',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '8px 12px',
    border: 0,
    borderRadius: 9,
    color: '#ffffff',
    background: '#21877d',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '7px 11px',
    border: '1px solid rgba(180, 35, 24, 0.42)',
    borderRadius: 9,
    color: '#b42318',
    background: 'transparent',
    font: 'inherit',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>

const RESOURCE_INTERACTION_STYLES = `
  [data-yuandian-resource-link] {
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  [data-yuandian-resource-link]:hover {
    border-color: rgba(40, 154, 143, 0.55) !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }
  [data-yuandian-resource-link]:focus-visible {
    border-color: #289a8f !important;
    outline: 2px solid rgba(40, 154, 143, 0.32);
    outline-offset: 2px;
  }
  [data-yuandian-auth-button]:hover:not(:disabled) {
    border-color: rgba(40, 154, 143, 0.60) !important;
  }
  [data-yuandian-danger-button]:hover:not(:disabled) {
    border-color: rgba(180, 35, 24, 0.72) !important;
    background: rgba(180, 35, 24, 0.06) !important;
  }
  [data-yuandian-auth-button]:focus-visible,
  [data-yuandian-auth-input]:focus-visible {
    outline: 2px solid rgba(40, 154, 143, 0.32);
    outline-offset: 2px;
  }
  [data-yuandian-auth-button]:disabled {
    cursor: not-allowed !important;
    opacity: 0.52;
  }
`

function resourceDomain(href: string): string {
  return new URL(href).hostname.replace(/^www\./, '')
}

function rpcError(response: Awaited<ReturnType<CredentialsApi['credentials']['set']>>): string | undefined {
  return response.ok ? undefined : response.error.message
}

let oauthStartSequence = 0

export async function requestOAuthStart(api: CredentialsApi): Promise<void> {
  oauthStartSequence += 1
  const response = await api.credentials.set(DEFAULT_OAUTH_START_CREDENTIAL_REF, `${Date.now()}-${oauthStartSequence}`)
  const failure = rpcError(response)
  if (failure !== undefined) throw new Error(failure)
}

export async function describeAuthentication(api: CredentialsApi): Promise<AuthenticationState> {
  const response = await api.credentials.describe([
    DEFAULT_OAUTH_CREDENTIAL_REF,
    DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF,
    DEFAULT_OAUTH_START_CREDENTIAL_REF,
    DEFAULT_API_KEY_CREDENTIAL_REF,
  ])
  if (!response.ok) throw new Error(response.error.message)
  const credentials = response.value
  return {
    loading: false,
    oauth: oauthAuthorizationView(
      credentials[DEFAULT_OAUTH_CREDENTIAL_REF] ?? EMPTY_CREDENTIAL,
      credentials[DEFAULT_OAUTH_AUTHORIZED_CREDENTIAL_REF] ?? EMPTY_CREDENTIAL,
    ),
    oauthPending: credentials[DEFAULT_OAUTH_START_CREDENTIAL_REF]?.configured === true,
    apiKey: credentials[DEFAULT_API_KEY_CREDENTIAL_REF] ?? EMPTY_CREDENTIAL,
  }
}

function AuthenticationDialog(props: {
  readonly api: CredentialsApi
  readonly initialTab: 'oauth' | 'api-key'
  readonly onClose: () => void
  readonly onState: (state: AuthenticationState) => void
}): ReactNode {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const cancelAuthorizationButtonRef = useRef<HTMLButtonElement>(null)
  const confirmCancellationButtonRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState(props.initialTab)
  const [state, setState] = useState<AuthenticationState>({ loading: true, apiKey: EMPTY_CREDENTIAL, oauth: EMPTY_CREDENTIAL, oauthPending: false })
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingOAuthCancellation, setConfirmingOAuthCancellation] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async (): Promise<AuthenticationState | undefined> => {
    try {
      const next = await describeAuthentication(props.api)
      setState(next)
      props.onState(next)
      return next
    } catch (cause) {
      setState(current => ({ ...current, loading: false }))
      setError(cause instanceof Error ? cause.message : '无法读取认证状态')
      return undefined
    }
  }, [props.api, props.onState])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { closeButtonRef.current?.focus() }, [])
  useEffect(() => {
    if (confirmingOAuthCancellation) confirmCancellationButtonRef.current?.focus()
  }, [confirmingOAuthCancellation])
  useEffect(() => {
    if (!state.oauthPending) return
    const timer = window.setInterval(() => {
      void refresh().then((next) => {
        if (next?.oauth.configured === true) {
          setNotice('OAuth 授权已完成。')
          return
        }
        if (next?.oauthPending === false) setError('OAuth 授权未完成，可以重新发起授权。')
      })
    }, 1000)
    return () => { window.clearInterval(timer) }
  }, [refresh, state.oauthPending])

  const useOAuth = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      if (state.oauth.configured || state.oauthPending) await cancelOAuthAuthorization(props.api)
      if (state.apiKey.configured) {
        const cleared = await props.api.credentials.unset(DEFAULT_API_KEY_CREDENTIAL_REF)
        const failure = rpcError(cleared)
        if (failure !== undefined) throw new Error(failure)
      }
      await requestOAuthStart(props.api)
      await refresh()
      setNotice('已切换到 OAuth，授权页面将由 DeepSeek Harness 自动打开。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法启动 OAuth 授权')
    } finally {
      setBusy(false)
    }
  }

  const cancelOAuth = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await cancelOAuthAuthorization(props.api)
      setConfirmingOAuthCancellation(false)
      await refresh()
      setNotice('OAuth 授权已取消。')
      closeButtonRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OAuth 授权取消失败')
    } finally {
      setBusy(false)
    }
  }

  const saveApiKey = async (): Promise<void> => {
    const value = apiKey.trim()
    if (value.length === 0) {
      setError('请输入 API Key。')
      return
    }
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const response = await props.api.credentials.set(DEFAULT_API_KEY_CREDENTIAL_REF, value)
      const failure = rpcError(response)
      if (failure !== undefined) throw new Error(failure)
      setApiKey('')
      await refresh()
      setNotice('API Key 已安全保存并启用。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'API Key 保存失败')
    } finally {
      setBusy(false)
    }
  }

  const removeApiKey = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const response = await props.api.credentials.unset(DEFAULT_API_KEY_CREDENTIAL_REF)
      const failure = rpcError(response)
      if (failure !== undefined) throw new Error(failure)
      await requestOAuthStart(props.api)
      await refresh()
      setTab('oauth')
      setNotice('API Key 已移除，正在切换到 OAuth。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'API Key 移除失败')
    } finally {
      setBusy(false)
    }
  }

  const cancellationAvailability = oauthCancellationAvailability(state.oauth)
  const dismissOAuthCancellation = (): void => {
    setConfirmingOAuthCancellation(false)
    window.requestAnimationFrame(() => { cancelAuthorizationButtonRef.current?.focus() })
  }

  return (
    <div style={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !busy) props.onClose()
    }}>
      <section
        ref={dialogRef}
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault()
            if (confirmingOAuthCancellation) {
              dismissOAuthCancellation()
              return
            }
            props.onClose()
            return
          }
          if (event.key !== 'Tab') return
          const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? []).filter(element => element.offsetParent !== null)
          const first = focusable[0]
          const last = focusable.at(-1)
          if (first === undefined || last === undefined) return
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <header style={styles.dialogHeader}>
          <div>
            <h3 id={titleId} style={styles.dialogTitle}>认证配置</h3>
            <p style={styles.dialogDescription}>选择元典开放平台 MCP 的认证方式。</p>
          </div>
          <button ref={closeButtonRef} type="button" style={styles.closeButton} onClick={props.onClose} disabled={busy} data-yuandian-auth-button="">关闭</button>
        </header>
        <div style={styles.tabs} role="tablist" aria-label="认证方式">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'oauth'}
            style={{ ...styles.tab, ...(tab === 'oauth' ? styles.tabActive : {}) }}
            onClick={() => { setTab('oauth'); setConfirmingOAuthCancellation(false); setError(undefined); setNotice(undefined) }}
            data-yuandian-auth-button=""
          >OAuth 认证</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'api-key'}
            style={{ ...styles.tab, ...(tab === 'api-key' ? styles.tabActive : {}) }}
            onClick={() => { setTab('api-key'); setConfirmingOAuthCancellation(false); setError(undefined); setNotice(undefined) }}
            data-yuandian-auth-button=""
          >API Key</button>
        </div>
        <div style={styles.dialogBody}>
          {tab === 'oauth' ? (
            <>
              <div style={styles.methodState}>
                <span>OAuth 状态</span>
                <span style={styles.methodStateValue}>{state.loading ? '检查中…' : state.oauth.configured ? '已授权' : state.oauthPending ? '等待授权…' : '未授权'}</span>
              </div>
              <p style={styles.helpText}>将通过浏览器完成授权，Token 由 DeepSeek Harness 凭证服务保存与刷新。</p>
              {confirmingOAuthCancellation ? (
                <div style={styles.confirmation} role="group" aria-label="取消 OAuth 授权确认" aria-live="assertive">
                  <p style={styles.confirmationText}>将清除本机 OAuth 授权；如未配置 API Key，元典 MCP 将断开，重新授权后才能使用。</p>
                  <div style={styles.actions}>
                    <button type="button" style={styles.secondaryButton} onClick={dismissOAuthCancellation} disabled={busy} data-yuandian-auth-button="">保留授权</button>
                    <button ref={confirmCancellationButtonRef} type="button" style={styles.dangerButton} onClick={() => { void cancelOAuth() }} disabled={busy || state.oauth.writable === false} data-yuandian-auth-button="" data-yuandian-danger-button="">{busy ? '取消中…' : '确认取消'}</button>
                  </div>
                </div>
              ) : (
                <div style={styles.actions}>
                  {cancellationAvailability === 'hidden' ? null : (
                    <button
                      ref={cancelAuthorizationButtonRef}
                      type="button"
                      style={styles.dangerButton}
                      onClick={() => { setConfirmingOAuthCancellation(true); setError(undefined); setNotice(undefined) }}
                      disabled={busy || cancellationAvailability === 'readonly'}
                      title={cancellationAvailability === 'readonly' ? 'OAuth 凭据来自只读来源，无法在设置页取消' : undefined}
                      data-yuandian-auth-button=""
                      data-yuandian-danger-button=""
                    >取消授权</button>
                  )}
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => { void useOAuth() }}
                    disabled={busy || state.oauth.writable === false}
                    data-yuandian-auth-button=""
                  >{state.oauthPending ? '重新发起 OAuth 授权' : state.oauth.configured ? '重新授权' : state.apiKey.configured ? '切换至 OAuth' : '开始 OAuth 授权'}</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={styles.methodState}>
                <span>API Key 状态</span>
                <span style={styles.methodStateValue}>{state.loading ? '检查中…' : state.apiKey.configured ? '已配置' : '未配置'}</span>
              </div>
              <label style={styles.fieldLabel}>
                API Key
                <input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder={state.apiKey.configured ? '输入新 Key 可替换现有配置' : '请输入元典开放平台 API Key'}
                  style={styles.secretInput}
                  onChange={event => { setApiKey(event.currentTarget.value); setError(undefined); setNotice(undefined) }}
                  disabled={busy || state.apiKey.writable === false}
                  data-yuandian-auth-input=""
                />
              </label>
              <p style={styles.helpText}>已保存的 Key 不会回显，也不会写入插件配置文件或日志。</p>
              <div style={styles.actions}>
                {state.apiKey.configured ? (
                  <button type="button" style={styles.secondaryButton} onClick={() => { void removeApiKey() }} disabled={busy || state.apiKey.writable === false} data-yuandian-auth-button="">移除并切换 OAuth</button>
                ) : null}
                <button type="button" style={styles.primaryButton} onClick={() => { void saveApiKey() }} disabled={busy || apiKey.trim().length === 0 || state.apiKey.writable === false} data-yuandian-auth-button="">{busy ? '保存中…' : state.apiKey.configured ? '替换 API Key' : '保存并启用'}</button>
              </div>
            </>
          )}
          {notice === undefined ? null : <p style={styles.notice} role="status">{notice}</p>}
          {error === undefined ? null : <p style={styles.error} role="alert">{error}</p>}
        </div>
      </section>
    </div>
  )
}

export function YuandianSettingsSection({ api }: { readonly api?: CredentialsApi } = {}): ReactNode {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authState, setAuthState] = useState<AuthenticationState>({ loading: api !== undefined, apiKey: EMPTY_CREDENTIAL, oauth: EMPTY_CREDENTIAL, oauthPending: false })
  useEffect(() => {
    if (api === undefined) return
    let stale = false
    void describeAuthentication(api).then(
      state => { if (!stale) setAuthState(state) },
      () => { if (!stale) setAuthState(current => ({ ...current, loading: false })) },
    )
    return () => { stale = true }
  }, [api])
  const currentMode = authState.apiKey.configured ? 'API Key 已配置' : authState.oauth.configured ? 'OAuth 已授权' : authState.oauthPending ? 'OAuth 授权中' : authState.loading ? '正在检查认证' : '未认证'
  return (
    <section style={styles.section} aria-labelledby="yuandian-legal-data-title">
      <style>{RESOURCE_INTERACTION_STYLES}</style>
      <div style={styles.hero}>
        <div style={styles.logoFrame}>
          <img style={styles.logo} src={logoUrl} width="56" height="56" alt="华宇元典法律数据 Logo" />
        </div>
        <div style={styles.heroCopy}>
          <p style={styles.eyebrow}>DEEPSEEK HARNESS PLUGIN</p>
          <h2 id="yuandian-legal-data-title" style={styles.title}>{DISPLAY_NAME}</h2>
          <p style={styles.packageName}>huayu-yuandian-legal-data</p>
        </div>
        <div style={styles.authLaunch}>
          <span style={styles.authStatus}>{currentMode}</span>
          <button type="button" style={styles.authButton} onClick={() => { setDialogOpen(true) }} disabled={api === undefined} data-yuandian-auth-button="">认证配置</button>
        </div>
      </div>
      <p style={styles.intro}>
        连接元典开放平台 MCP，为 DeepSeek Harness 提供法规、案例、企业与证券合规法律数据能力。
      </p>
      <div style={styles.card} aria-label="插件信息">
        <div style={styles.fact}>
          <span style={styles.factLabel}>数据服务</span>
          <span style={styles.factValue}>元典开放平台 MCP</span>
        </div>
        <div style={{ ...styles.fact, borderRight: 0 }}>
          <span style={styles.factLabel}>内置能力</span>
          <span style={styles.factValue}>4 个官方 Skill</span>
        </div>
      </div>
      <section style={styles.resourceHub} aria-label="元典产品与生态入口">
        <div style={styles.capabilityTags} aria-label="法律数据能力">
          {LEGAL_CAPABILITIES.map(capability => (
            <span key={capability} style={styles.capabilityTag}>{capability}</span>
          ))}
        </div>
        <div style={styles.resourceGrid}>
          {RESOURCE_GROUPS.map(group => (
            <section
              key={group.title}
              style={{ ...styles.resourceGroup, ...(group.title === '元典生态' ? styles.resourceGroupWide : {}) }}
              aria-labelledby={`yuandian-resource-${group.title}`}
            >
              <header style={styles.resourceGroupHeader}>
                <h4 id={`yuandian-resource-${group.title}`} style={styles.resourceGroupTitle}>{group.title}</h4>
                <p style={styles.resourceGroupDescription}>{group.description}</p>
              </header>
              <div style={group.title === '元典生态' ? styles.resourceLinksWide : styles.resourceLinks}>
                {group.links.map(link => (
                  <a
                    key={link.href}
                    style={styles.resourceLink}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    data-yuandian-resource-link=""
                  >
                    <span style={styles.resourceLinkLabel}>{link.label}</span>
                    <span style={styles.resourceLinkDomain}>{resourceDomain(link.href)}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
      <p style={styles.footer}>插件版本 {CLIENT_PLUGIN_VERSION}</p>
      {dialogOpen && api !== undefined ? (
        <AuthenticationDialog
          api={api}
          initialTab={authState.apiKey.configured ? 'api-key' : 'oauth'}
          onClose={() => { setDialogOpen(false) }}
          onState={setAuthState}
        />
      ) : null}
    </section>
  )
}
