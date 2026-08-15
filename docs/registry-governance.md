# Registry 数据治理

Registry 的公开列表只包含两种可信等级：

- `curated`：来自社区精选源，并满足可安装契约。
- `manifest_verified`：由 GitHub Topic 自动发现，根目录 `package.json` 声明了有效的 `dsh.bundle`，且引用的 Patch 文件存在。

另外两种状态保存在 `public/data/registry-audit.json`，不会进入可安装插件列表：

- `pending_review`：候选仓库存在，但尚未通过 manifest 契约；仓库名称、简介或额外 Topic 还需提供至少一个 DSH 关联信号，网页才会展示仓库并链接 GitHub，且不会提供安装命令。
- `quarantined`：被维护者明确隔离，或仅命中发现 Topic、没有其他 DSH 关联信号。

仅有用于发现的 `dsh-plugin` Topic、没有有效 bundle，也没有其他 DSH 关联信号的仓库会被排除。有效 `dsh.bundle` 不受这条候选相关性规则影响。

## 人工治理

- 在 `sources/blocklist.json` 中按 `owner/repo` 排除恶意仓库、误收录、教程或重复项目，并记录原因。
- 在 `sources/overrides.json` 中按小写 `owner/repo` 修正 `name`、`description`、`category`、`icon`、`install` 或 `special` 标记。来源、可信等级和仓库身份不能被覆盖。

## 写入门禁

同步在写文件之前先执行注册表契约校验。若上一份快照是完整发现，未认证的局部发现不能覆盖它；完整同步的插件总数下降超过 20%，或精选数下降超过 15%，也会停止写入。

只有确认需要重建基线时，才可临时设置 `DSH_SYNC_ALLOW_UNSAFE=1`。阈值可用 `DSH_MIN_PUBLISHED_RATIO` 与 `DSH_MIN_CURATED_RATIO` 调整。

```bash
npm run sync:plugins
npm run validate:registry
npm test
```
