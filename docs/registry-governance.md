# Registry 数据治理

Registry 的公开列表只包含两种可信等级：

- `curated`：来自仓库内精选目录 [`sources/curated.json`](../sources/curated.json)，并在能够检查时满足与自动发现相同的可安装契约。精选目录 vendor 进本仓库（可用 `npm run export:curated` 从快照再生），同步不再依赖外部域名。
- `manifest_verified`：由 GitHub Topic 自动发现，`package.json` 声明了有效的 `dsh.bundle`，引用的 Patch 文件存在且至少包含一行带 `id` 和 `name` 的插件。

另外两种状态保存在 `public/data/registry-audit.json`，不会进入可安装插件列表：

- `pending_review`：候选仓库存在，但尚未通过 manifest 契约；仓库名称、简介或额外 Topic 还需提供至少一个 DSH 关联信号，网页才会在「缺少有效 dsh.bundle」筛选中展示仓库并链接 GitHub，且不会提供安装命令。默认浏览列表只包含可安装插件。
- `quarantined`：被维护者明确隔离，或仅命中发现 Topic、没有其他 DSH 关联信号。

仅有用于发现的 `dsh-plugin` Topic、没有有效 bundle，也没有其他 DSH 关联信号的仓库会被排除。有效 `dsh.bundle` 不受这条候选相关性规则影响。

## 人工治理

- 在 `sources/blocklist.json` 中按 `owner/repo` 排除恶意仓库、误收录、教程或重复项目，并记录原因。
- 在 `sources/overrides.json` 中按小写 `owner/repo` 修正 `name`、`description`、`category`、`icon`、`install`、`special` 或展示用的 `recommendationSource` 标记。底层来源、可信等级和仓库身份不能被覆盖。

## 写入门禁

同步在写文件之前先执行注册表契约校验。若上一份快照是完整发现，未认证的局部发现不能覆盖它；完整同步的插件总数下降超过 20%，或精选源（`curatedSource`，含因契约失败降级的条目）下降超过 15%，也会停止写入。GitHub GraphQL 批量校验返回部分数据的比例超过 5% 时同样中止（可用 `DSH_MAX_PARTIAL_RATIO` 调整），避免静默发布不完整的验证结果。

只有确认需要重建基线时，才可临时设置 `DSH_SYNC_ALLOW_UNSAFE=1`；此时快照 `stats` 会记录 `healthGateOverridden: true` 留痕。阈值可用 `DSH_MIN_PUBLISHED_RATIO` 与 `DSH_MIN_CURATED_RATIO` 调整。

定时同步失败时，工作流会自动开启（或追加评论到）标题为 `[registry-sync] Scheduled sync failed` 的 GitHub Issue，恢复成功后自动关闭；站点顶栏也会展示"数据更新于 X 小时前"，超过 24 小时转为警示色。

```bash
npm run sync:plugins
npm run validate:registry
npm test
```
