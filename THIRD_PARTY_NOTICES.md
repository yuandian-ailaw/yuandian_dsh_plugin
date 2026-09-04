# 第三方声明

根目录 [LICENSE](./LICENSE) 中的 MIT License 仅适用于本项目有权许可的原创代码。下列第三方组件和内容不因被本项目引用、改编或分发而变更其权属或许可条件，仍分别受其原有许可或权利人的授权范围约束。

## DeepSeek Harness MCP client

本插件 `src/mcp/tools.ts` 与 `src/mcp/connection.ts` 的工具命名、分页同步、整代注册和连接监督语义参考并改编自：

- 项目：DeepSeek Harness
- 仓库：https://github.com/deepseek-ai/deepseek-harness
- 上游目录：`packages/mcp/mcp-client`
- 许可：MIT License

Copyright (c) 2026 DeepSeek。MIT 许可允许使用、复制、修改、合并、发布、分发、再许可和销售，但须保留原版权与许可声明。完整许可文本随包保存在 [`LICENSES/DeepSeek-Harness-MIT.txt`](./LICENSES/DeepSeek-Harness-MIT.txt)。

## Model Context Protocol TypeScript SDK

- 包：`@modelcontextprotocol/sdk@1.30.0`
- 项目：https://github.com/modelcontextprotocol/typescript-sdk
- 许可：MIT License

本插件使用其 Streamable HTTP client、OAuth 发现/DCR/PKCE/refresh 实现及 MCP schema。

Copyright (c) 2024 Anthropic, PBC。依赖包自身包含完整 MIT License。

## 元典官方 Skill

4 份 Skill 来自元典开放平台 `api/frontend/public/downloads`，同步清单与上游 ZIP SHA-256 见 `skills/upstream.json`。

这些 Skill 的内容权利归其各自权利人所有，不属于本项目 MIT License 的许可范围。本项目没有为其擅自声明 MIT、Apache-2.0 或其他开源许可；经权利人确认，允许随本项目公开分发及发布到公开制品渠道，其余权利与许可边界仍以权利人的授权范围为准。

## 品牌名称与素材

本项目已获授权使用“华宇元典”名称及 `assets/logo.svg` 品牌素材。该授权不自动授予安装包接收者独立使用或修改品牌素材的权利，具体边界见 [`LICENSES.md`](./LICENSES.md)。

## 其他运行时依赖

- `@deepseek-ai/schemastery`：MIT
- `yaml@2.9.0`：ISC

各依赖仍受其自身许可文件与上游声明约束。
