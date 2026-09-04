# 发布流程

正式发布只由维护者执行。普通 PR 和公开 CI 只运行 `pnpm pack --dry-run`，不会生成或上传正式安装包。

## 发布前

1. 确认 Git 工作区干净，版本号和 [CHANGELOG.md](./CHANGELOG.md) 已更新。
2. 确认 Skill 来源、摘要和公开分发授权没有变化。
3. 运行完整质量门禁：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm build
pnpm verify:artifact
pnpm pack --dry-run
```

4. 检查 dry-run 清单只包含预期的 `assets`、`dist`、`skills`、许可、说明和插件配置文件。

## 正式制品

只有在下载镜像同步条件已满足时才生成正式包：

```sh
pnpm pack
node scripts/artifact-checksum.mjs huayu-yuandian-legal-data-<version>.tgz
```

正式 `.tgz` 与 `.sha256` 必须同步到维护者控制的下载镜像，并验证摘要、下载配置和包内容完全一致。镜像仓库的提交应只包含安装包、摘要和对应下载配置，不得混入其他改动。

完成镜像校验后再创建公开 tag 或 Release。不得把凭证、回调地址、用户数据、缓存或本机路径放入制品、证明或发布说明。
