# 首次公开检查清单

本清单用于从公司内网仓库建立首次公开版本，不会自动执行远端操作。

- [ ] 确认公开托管组织、仓库名和维护者名单。
- [ ] 将公开仓库 URL 写入 `package.json.repository`，并检查 README 安装地址。
- [ ] 决定保留现有历史还是从当前快照建立新历史；确认旧 GPL-3.0 快照和提交邮箱可以公开。
- [ ] 使用 Gitleaks、TruffleHog 或托管平台秘密扫描再次检查完整历史。
- [ ] 由权利人或法务复核 [LICENSES.md](./LICENSES.md) 中 Skill 与品牌素材的公开分发表述。
- [ ] 在托管平台启用私密漏洞报告、Dependabot、分支保护和必需 CI 检查。
- [ ] 添加 `dsh-plugin`、`mcp`、`legal-research` 等仓库 topic。
- [ ] 用 Node.js 22.19.0 在 Linux、macOS、Windows 的首次公开 CI 中验证通过。
- [ ] 首次正式制品按 [RELEASING.md](./RELEASING.md) 完成下载镜像同步后再发布。
