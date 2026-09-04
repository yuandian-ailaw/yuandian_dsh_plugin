# 贡献指南

感谢参与华宇元典法律数据插件。

## 开发准备

- Node.js `>=22.19.0`
- pnpm `11.7.0`

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm build
pnpm verify:artifact
pnpm pack --dry-run
```

## 提交范围

- 一个 PR 解决一个清晰问题，避免无关重构和批量格式化。
- 新增业务逻辑必须覆盖成功路径与关键失败路径。
- 外部请求必须有超时、失败处理和不泄密的诊断信息。
- 不要提交真实凭证、用户数据、构建包、缓存或本机配置。
- `skills/` 和 `assets/logo.svg` 不适用 MIT License。未经维护者确认权利来源，不要修改、替换或新增这些内容。

提交原创代码即表示你有权按本项目对应文件的 MIT License 提供该贡献。第三方代码必须注明来源、版本和许可证，并保留必要声明。

## PR 说明

请说明问题、解决方案、兼容性影响、验证命令和仍未覆盖的限制。安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告，不要直接创建公开 PR。
