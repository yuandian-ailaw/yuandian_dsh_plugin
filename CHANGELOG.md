# 变更记录

本项目按语义化版本记录用户可见变化。

## 0.1.5 - 2026-09-04

- 适配 DeepSeek Harness 0.1.2-rc.1：设置页使用 Remote 凭据接口，移除已下线的 client-runtime 加载依赖。
- 跟随新版 credentials/reference-updated 事件，在保存或移除 API Key、发起或取消 OAuth 后更新连接状态。
- 使用新版 Cordis、UI renderer 和工具类型验证插件，补充 Remote 成功/失败与凭据变化回归测试。
- 最低支持版本调整为 DSH 0.1.2-rc.1；旧版 DSH 请继续使用插件 0.1.4。

## 0.1.4 - 2026-08-25

### 新增

- 公开仓库 CI、依赖更新配置、安全策略、贡献指南和行为准则。
- HTTP 请求超时、工具发现分页边界、重复 cursor 检查和日志脱敏。
- OAuth loopback 回调安全响应头与测试覆盖率门禁。
- 混合许可范围说明、DeepSeek Harness 完整 MIT 声明和英文 README。

### 变更

- 非本机 MCP endpoint 现在强制使用 HTTPS。
- 工具整代注册失败时尝试恢复上一代工具。
- 插件版本从 `package.json` 统一注入服务端和客户端。
- 构建改为生成可审计的 source map，不再混淆服务端代码。
- 升级 `@modelcontextprotocol/sdk` 至 1.30.0、`yaml` 至 2.9.0，并将 Node 类型对齐 22.x。

### 移除

- 移除来源未记录的 `assets/scale.svg`，设置导航使用 Unicode 天平符号。
