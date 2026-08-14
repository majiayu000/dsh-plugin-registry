# Registry 数据治理

Registry 的公开列表只包含两种可信等级：

- `curated`：来自社区精选源，并满足可安装契约。
- `manifest_verified`：由 GitHub Topic 自动发现，且根目录 `package.json` 声明了有效的 `dsh.bundle`。

另外两种状态保存在 `public/data/registry-audit.json`，不会进入公开安装列表：

- `pending_review`：候选仓库存在，但尚未通过 manifest 契约。
- `quarantined`：被维护者明确隔离。

## 人工治理

- 在 `sources/blocklist.json` 中按 `owner/repo` 排除恶意仓库、误收录、教程或重复项目，并记录原因。
- 在 `sources/overrides.json` 中按小写 `owner/repo` 修正 `name`、`description`、`category`、`icon` 或 `install`。来源、可信等级和仓库身份不能被覆盖。

## 写入门禁

同步在写文件之前先执行注册表契约校验。若上一份快照是完整发现，未认证的局部发现不能覆盖它；完整同步的插件总数下降超过 20%，或精选数下降超过 15%，也会停止写入。

只有确认需要重建基线时，才可临时设置 `DSH_SYNC_ALLOW_UNSAFE=1`。阈值可用 `DSH_MIN_PUBLISHED_RATIO` 与 `DSH_MIN_CURATED_RATIO` 调整。

```bash
npm run sync:plugins
npm run validate:registry
npm test
```
