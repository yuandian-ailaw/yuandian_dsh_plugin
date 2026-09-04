# 华宇元典法律数据

[English](./README.en.md)

源码仓库：[yuandian-ailaw/yuandian_dsh_plugin](https://github.com/yuandian-ailaw/yuandian_dsh_plugin) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

`huayu-yuandian-legal-data` 将[元典开放平台](https://open.chineselaw.com/)的聚合 MCP 入口接入 DeepSeek Harness，并随包提供法规、案例、企业和证券合规 4 个官方 Skill。

当前版本：`0.1.5`。兼容 DeepSeek Harness `>=0.1.2-rc.1 <0.2.0`，要求 Node.js `>=22.19.0`。

项目原创代码采用 MIT License；随包 Skill 和品牌 Logo 使用单独授权，不属于 MIT License。完整边界见 [LICENSES.md](./LICENSES.md)。

安装后，DeepSeek Harness 的设置页会出现“华宇元典法律数据”入口，并展示随包分发的品牌 Logo；内部包名继续使用 `huayu-yuandian-legal-data`。

## 能力与边界

- 默认连接 `https://open.chineselaw.com/mcp`，一次授权发现聚合入口的全部工具。
- 设置页提供 OAuth 与 API Key 两种认证方式；安装和首次加载不要求认证，用户选择后才发起连接。
- OAuth 采用 Authorization Code + PKCE S256，支持动态客户端注册、refresh token、RFC 8707 resource indicator 和本机 loopback 回调。
- MCP 工具以 `mcp__yuandian__<原始工具名>` 注册；不合规或超长名称会附加稳定哈希。
- 非本机 MCP endpoint 强制使用 HTTPS；HTTP 仅允许 loopback 开发地址。
- 支持有界工具分页、重复 cursor 检查、`notifications/tools/list_changed`、整代恢复、有界指数退避重连、调用超时和取消。
- 当前只桥接 MCP tools，不桥接 resources 和 prompts。
- 运行中需要重新授权时，已经失败的工具调用不会自动重放，避免重复执行有副作用的操作；连接恢复后由用户重试。

## 安装

### 从本地目录安装

```sh
dsh plugin --profile web add /absolute/path/to/huayu-yuandian-legal-data
dsh --profile web --dump-config
```

### 从 tarball 安装

作者侧生成包：

```sh
pnpm install
pnpm pack
```

用户侧安装：

```sh
dsh plugin --profile web add /absolute/path/to/huayu-yuandian-legal-data-0.1.5.tgz
```

公开仓库 CI 会在 Linux、macOS 和 Windows 上执行质量门禁，并用 `pnpm pack --dry-run` 校验包内容；CI 不会自动发布 npm 包或创建正式制品。正式制品只由维护者按 [RELEASING.md](./RELEASING.md) 发布。

获得维护者发布的 `.tgz` 与 `.sha256` 后，先在两者所在目录验证摘要：

```sh
# macOS
shasum -a 256 -c huayu-yuandian-legal-data-0.1.5.tgz.sha256

# Linux
sha256sum -c huayu-yuandian-legal-data-0.1.5.tgz.sha256
```

从源码安装时应固定公开仓库的 commit SHA，并只对可信源码授权构建。tarball 已包含构建产物，不需要安装时构建授权。

卸载：

```sh
dsh plugin --profile web remove huayu-yuandian-legal-data
```

## 认证配置

设置页右上角的“认证配置”入口支持：

- **OAuth 认证**：开始授权、从 API Key 切换至 OAuth、清理现有状态后重新授权，或经二次确认取消本机授权。
- **API Key**：保存、替换或移除 Key；已保存的明文永不回显，也不会进入插件配置和日志。

默认 bundle 使用自动认证模式：

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

自动模式下，插件安装和首次加载时若没有任何凭证，会保持未认证待机状态：不打开浏览器、不请求 MCP，也不影响 Harness 启动。用户在设置页点击“开始 OAuth 授权”或保存 API Key 后，插件才会立即建立 MCP 连接，无需重启 Harness。已有 API Key 或可静默复用的 OAuth Token 时，后续加载会自动连接；OAuth Token 失效且无法刷新时会回到未认证待机，不会在 `dsh web` 启动阶段自动打开授权页。

已授权时可在 OAuth 页签选择“取消授权”。确认后插件会删除 Harness 本机凭证服务中的 `YUANDIAN_MCP_OAUTH`、授权完成标记和进行中的授权尝试：若另有 API Key 则切换到 API Key，否则断开 MCP、注销已发现的工具并回到未认证待机。当前元典 OAuth metadata 未公布 Token 撤销端点，因此该操作不表示服务端 Token 已立即吊销，远端 Token 可能继续有效至自身过期。

设置页会用 `YUANDIAN_MCP_OAUTH_START` 标识当前 OAuth 尝试；该引用不包含 Token 或其他秘密。授权完成、拒绝、失败或超时后，后端会清除它；重新发起授权会覆盖并终止旧尝试。`YUANDIAN_MCP_OAUTH_AUTHORIZED` 只表示 Token 已成功写入，设置页不会再把 discovery、动态客户端注册或 PKCE 中间状态误报为已授权。

OAuth 首次授权时会：

1. 发现元典 OAuth metadata 并动态注册 public client。
2. 仅在 `127.0.0.1` 的配置端口监听 `/oauth/callback`。
3. 打开系统浏览器；打开失败时在日志中输出可复制的授权地址。
4. 严格校验回调 method、path、state、OAuth error 和超时。
5. 将 client information、Token、PKCE verifier 和 discovery state 序列化到 `YUANDIAN_MCP_OAUTH` 凭证引用。

DSH 本地凭证提供方通常把该引用存入 `$DSH_HOME/.credentials.yaml`，并负责 0600 权限和原子写入。不要把该文件、Token 或浏览器回调地址提交到仓库。

修改回调端口时，端口必须为 `1..65535`；插件始终使用精确 redirect URI `http://127.0.0.1:<port>/oauth/callback`。默认授权等待 300 秒。

### 固定认证模式（高级配置）

如需在服务器或 CI 中强制只使用 API Key，可在 profile 的 `cordis.patch.yml` 中覆盖插件行。DSH patch 会整体替换该行的 `config`，因此需要重述完整配置：

```yaml
- id: huayu-yuandian-legal-data
  config:
    endpoint: https://open.chineselaw.com/mcp
    serverName: yuandian
    auth:
      mode: api-key
      credentialRef: YUANDIAN_API_KEY
    httpTimeoutMs: 60000
    toolCallTimeoutMs: 60000
    failOnStartupError: true
    reconnect:
      enabled: true
      initialDelayMs: 500
      maxDelayMs: 30000
      maxAttempts: 10
```

凭证值不要写进 patch。可在启动 DSH 的环境中提供：

```sh
export YUANDIAN_API_KEY='你的元典 API Key'
dsh --profile web
```

插件解析该 credential 引用，并仅在 MCP HTTP 请求中发送 `Authorization: Bearer <API Key>`。固定 `oauth` 模式仍受支持，其字段与自动模式中的 OAuth 字段相同，只需将 `oauthCredentialRef` 改为 `credentialRef`。

## 数据、费用与隐私

- MCP 工具调用会把检索参数发送到配置的元典开放平台 endpoint；不要在查询中放入与法律检索无关的秘密或个人敏感信息。
- 元典开放平台账号、订阅、调用额度、计费和服务端数据处理受平台自身条款约束，本插件不改变这些约束。
- 插件自身不增加独立遥测；DeepSeek Harness 和运行环境的日志、网络与遥测策略仍由对应组件控制。
- 工具返回的法律数据应结合来源、时效和适用范围复核，不构成未经专业人员复核的法律意见。

## 内置 Skill

| Skill | 用途 |
|---|---|
| `prc-legal-research-law-search` | 中国大陆法规、法条与效力状态检索 |
| `prc-legal-research-case-search` | 中国大陆裁判文书、权威案例与相似案例检索 |
| `prc-legal-research-company-search` | 中国大陆企业工商、风险、涉诉、股权与知识产权查询 |
| `prc-legal-research-securities-compliance` | 中国大陆证券法规、监管案例与上市公司公告检索 |

Skill 保留官方正文，只修复上游 ZIP 中非法 YAML frontmatter，并增加 DSH 聚合入口和工具名映射说明。同步日期、ZIP 路径和 SHA-256 记录在 `skills/upstream.json`。

### Skill 交付边界

DeepSeek Harness 必须读取完整 Skill 正文才能发现并执行这些能力，因此 4 份 `SKILL.md` 会以明文进入安装包。构建转换或在客户端运行时解密都不能阻止已获得安装包的用户读取正文，本项目不把这些措施表述为 Skill 保密。

当前交付策略明确接受这一边界：经权利人确认，4 份 Skill 允许随安装包公开分发并发布到公开制品渠道。如果未来要求 Skill 正文对终端用户保密，必须停止随插件分发 Skill，并把相应流程迁移到受控服务端。

## 故障排查

- **回调端口已占用**：修改 `auth.callbackPort`，重新启动后再次授权。
- **浏览器没有打开**：复制日志中的授权 URL；不要把 URL 分享给他人。
- **授权被拒绝或 state 不匹配**：关闭回调页并在设置页重新发起授权，无需重启插件。
- **授权等待超时**：默认 300 秒；重新启动授权，必要时增加 `auth.timeoutMs`。
- **OAuth 凭证损坏或服务端拒绝 refresh token**：插件会清理失效分区并重新授权；仍失败时移除 `YUANDIAN_MCP_OAUTH` 凭证引用后重试。
- **取消授权后仍需使用**：重新打开“认证配置”，再次发起 OAuth 授权或保存 API Key；取消授权仅清理本机 OAuth 凭据。
- **API Key 未配置**：在设置页保存 Key；固定 API Key 模式则确认启动环境包含与 `auth.credentialRef` 同名的非空值。
- **设置页显示未认证**：这是首次安装的正常待机状态；选择 OAuth 或保存 API Key 即可启用数据能力。
- **401**：OAuth 模式先刷新 Token，refresh 失效则重新授权；API Key 模式请检查 Key 是否有效、启用且有 MCP 权限。
- **工具列表更新失败**：列表请求失败时保留上一代；注册冲突时回滚新一代并尝试恢复上一代工具。
- **连续断线**：按配置有界退避重连；预算耗尽后注销工具，重启 Host 或热重载插件可重新开始。

日志使用中文诊断信息，不输出 API Key、access token、refresh token、authorization code 或 PKCE verifier。

## 开发与验收

```sh
pnpm install
pnpm check
pnpm test:coverage
pnpm build
pnpm verify:artifact
pnpm pack --dry-run
```

测试默认使用内存凭证、假 OAuth 服务和本地假 MCP HTTP 服务，不依赖真实账号。真实 OAuth 冒烟测试需要用户在浏览器登录元典并确认授权。

## 许可与第三方内容

- 本项目有权许可的原创代码采用 [MIT License](./LICENSE)。安装包包含单独授权内容，因此 `package.json` 使用 `SEE LICENSE IN LICENSES.md`，不把整个包误标为 MIT。
- MCP 服务与 Skill 来源：元典开放平台及本地 `api/frontend/public/downloads`。
- MCP 工具桥接的命名、同步和连接监督语义参考 DeepSeek Harness 的 MIT 实现。
- `skills/` 中的元典官方 Skill 及其他第三方内容不因本项目采用 MIT License 而自动变更许可；其权利仍归各自权利人所有。
- 完整适用边界见 [LICENSES.md](./LICENSES.md)，详细来源与第三方许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
- 本包当前保留 `private: true`，不执行 npm 发布；经权利人确认，4 份元典官方 Skill 允许随本项目公开分发。
