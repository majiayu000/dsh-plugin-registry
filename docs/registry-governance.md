# Registry 数据治理

Registry 的公开列表只包含两种可信等级：

- `curated`：来自仓库内精选目录 [`sources/curated.json`](../sources/curated.json)，并在能够检查时满足与自动发现相同的可安装契约。精选目录 vendor 进本仓库（可用 `npm run export:curated` 从快照再生），同步不再依赖外部域名。
- `manifest_verified`：由 GitHub Topic 自动发现，`package.json` 声明了有效的 `dsh.bundle`。`patch` 可为单个安全相对路径或非空路径列表，每个引用的 Patch 文件都必须存在且是顶层 YAML 数组（允许空数组，与 DSH loader 一致）。任一文件缺失、无效或未能验证，都不能据此获得新的验证通过状态。

元数据批量查询保留成功解析的仓库。无法从 GitHub 解析元数据的精选条目保留在待确认记录中，说明原因并停止提供安装条目；原始 `sources/curated.json` 记录不删除，后续同步可重新确认。部分响应仍受下述 GraphQL 比例门禁和快照健康门禁约束。

另外两种状态保存在 `public/data/registry-audit.json`，不会进入可安装插件列表：

- `pending_review`：候选仓库存在，但尚未通过 manifest 契约；仓库名称、简介或额外 Topic 还需提供至少一个 DSH 关联信号，网页才会在「缺少有效 dsh.bundle」筛选中展示仓库并链接 GitHub，且不会提供安装命令。默认浏览列表只包含可安装插件。
- `quarantined`：被维护者明确隔离，或仅命中发现 Topic、没有其他 DSH 关联信号。

仅有用于发现的 `dsh-plugin` Topic、没有有效 bundle，也没有其他 DSH 关联信号的仓库会被排除。有效 `dsh.bundle` 不受这条候选相关性规则影响。

## 默认列表与低信号条目

可安装列表中的所有条目都保留在快照、详情页和公开 API 中。网站默认浏览列表与首页统计只计「默认列表」，隐藏下列低信号条目；筛选「全部条目（含低信号）」或「仅低信号条目」可随时查看，首页统计下方写明总数与隐藏数。判定在浏览端和构建端由 [`assets/listing-quality.js`](../assets/listing-quality.js) 用快照已有字段计算，不改变快照结构，也不增加部署文件体积。

- `bulk_publisher`：同一 owner（不区分大小写）在可安装列表中有至少 `bulkPublisherMinListings` 个条目，且该条目自身 Stars、Forks 均为 0、没有 Release。获得任一信号即回到默认列表。
- `duplicate`：与另一条目的 `verifiedCommit` 相同（同一仓库改名或镜像），或仓库名与非空简介都相同（副本）。组内保留豁免条目优先、Stars、Release、Forks 依次更高的一条，其余标记。

社区目录、issue 申请通过（`origin: issue`）和特别收录（`special` / `recommendationSource`）条目不参与自动降级。低信号不是隔离：不写入 `sources/blocklist.json`，也不影响安装命令。屏蔽整个账号仍需要具体的恶意、误收录或重复理由。

阈值只在 `LISTING_QUALITY_CONFIG` 中维护。`bulkPublisherMinListings = 50` 的依据（2026-11-12 快照，24,926 个可安装条目、15,346 个 owner）：owner 条目数 P99 = 8、P99.9 = 27，达到 50 的只有 7 个 owner，却占 1,918 个条目（7.7%）；取 P99.9 的约两倍，避免误伤 20–30 个条目的活跃作者。按此阈值共有 1,547 个低信号条目（批量 1,498、重复 49），默认列表为 23,379 个。调整阈值时需在 PR 中给出新快照的同类分布。

仓库体积或「无代码」暂不作为信号：快照没有仓库大小字段，补充需要额外 GitHub API 请求；`language` 为空的仅 124 条，且纯 YAML Patch 插件本身合法。

## 人工治理

人工收录记录：[2026-10-21 社区插件申请 #77–#81](submissions-2026-10-21.md)，包含固定发布物、安装 smoke 检查与兼容边界。

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
