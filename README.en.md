# Huayu Yuandian Legal Data

[中文](./README.md)

Source repository：[yuandian-ailaw/yuandian_dsh_plugin](https://github.com/yuandian-ailaw/yuandian_dsh_plugin) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

`huayu-yuandian-legal-data` connects the aggregated [Yuandian Open Platform](https://open.chineselaw.com/) MCP endpoint to DeepSeek Harness. It also bundles four official skills for PRC legislation, court cases, company data, and securities compliance.

Current version: `0.1.5`. It supports DeepSeek Harness `>=0.1.2-rc.1 <0.2.0` and requires Node.js `>=22.19.0`.

The original project code is MIT-licensed. The bundled skills and brand logo are separately licensed and are not covered by MIT. See [LICENSES.md](./LICENSES.md) before redistributing or modifying package contents.

## Capabilities and boundaries

- Connects to `https://open.chineselaw.com/mcp` by default.
- Supports OAuth Authorization Code with PKCE S256 and API keys stored by the Harness credential service.
- Requires HTTPS for every non-loopback MCP endpoint.
- Registers tools as `mcp__yuandian__<original-name>`.
- Handles bounded tool pagination, list-change notifications, generation recovery, bounded reconnects, timeouts, and cancellation.
- Bridges MCP tools only; resources and prompts are not currently exposed.
- Does not replay a tool call that failed during reauthorization.

## Install from source

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
dsh plugin --profile web add /absolute/path/to/this-repository
```

Install a maintainer-provided tarball with:

```sh
dsh plugin --profile web add /absolute/path/to/huayu-yuandian-legal-data-0.1.5.tgz
```

## Authentication

The settings page lets a user start OAuth authorization or save an API key. Secrets are never echoed back into the UI and are not written to plugin configuration or logs.

The default bundle configuration is:

```yaml
endpoint: https://open.chineselaw.com/mcp
serverName: yuandian
auth:
  mode: auto
  callbackPort: 1455
  openBrowser: true
  timeoutMs: 300000
httpTimeoutMs: 60000
toolCallTimeoutMs: 60000
failOnStartupError: true
reconnect:
  enabled: true
  initialDelayMs: 500
  maxDelayMs: 30000
  maxAttempts: 10
```

The OAuth callback listener binds only to `127.0.0.1`, validates the exact path and state, and adds restrictive browser security headers. Removing local authorization does not revoke a remote token when the provider does not advertise a revocation endpoint.

## Data, billing, and privacy

- Tool calls send search parameters to the configured Yuandian Open Platform endpoint. Do not include unrelated secrets or sensitive personal data in a query.
- Accounts, subscriptions, quotas, billing, and server-side data processing remain subject to the platform's own terms.
- The plugin adds no independent telemetry. DeepSeek Harness and the surrounding runtime may have their own logging and telemetry policies.
- Legal data should be checked for source, currency, and scope before reliance; tool output is not an unreviewed legal opinion.

## Development

```sh
pnpm check
pnpm test:coverage
pnpm build
pnpm verify:artifact
pnpm pack --dry-run
```

Tests use in-memory credentials, fake OAuth services, and local fake MCP servers. Do not use real accounts in automated tests.

See [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), and [CHANGELOG.md](./CHANGELOG.md) for project policies.
