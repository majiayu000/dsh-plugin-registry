# 2026-11-23 社区插件收录

接受 [#111](https://github.com/majiayu000/dsh-plugin-registry/issues/111) AI-HUB 移动端插件、[#124](https://github.com/majiayu000/dsh-plugin-registry/issues/124) My Earth 和 [#138](https://github.com/majiayu000/dsh-plugin-registry/issues/138) Muse Frame（#137 是同一申请的早期备用工单，作者已关闭）。三条通过 `sources/curated.json` 转为精选来源，`sources/overrides.json` 记录显示名称和 Issue 来源。格式检查不等同于安全背书。

## 固定发布物

| 申请 | 安装来源 | 已核对源码 |
| --- | --- | --- |
| #111 | npm `dsh-mobile-plugin@0.5.97`（integrity `sha512-tzg0CR6w…NTQ==`） | `d8febe5aef7ae36e1be2238952c94a4614e1c8ed`（npm `gitHead` 与 tag `v0.5.97` 一致） |
| #124 | [`archive/d00c838….tar.gz`](https://github.com/junyisunme/dsh-plugin-my-earth/archive/d00c838876191ae6eb3e33e61104c4c38ed6e95a.tar.gz) | `d00c838876191ae6eb3e33e61104c4c38ed6e95a`（tag `v0.1.2`） |
| #138 | [`archive/7a19047….tar.gz`](https://github.com/KaneGong/muse-frame/archive/7a19047e8c968ada024ff8c8ddc1bbf85ad1ea88.tar.gz) | `7a19047e8c968ada024ff8c8ddc1bbf85ad1ea88`（申请中指定的提交） |

#124 申请时说的是 v0.1.1，作者之后发布了 v0.1.2，只把默认 API 从 Netlify Deploy Preview 换成正式站 `me-interest-globe.netlify.app`，并更新了 README。本次审核并固定的是 v0.1.2。#124 和 #138 都没有可用的插件 Release 包，所以和 #114 一样，固定到审核提交的源码归档。

## 本次验证

- 三个仓库都公开、不是 Fork、没有归档，都带 `dsh-plugin` Topic，仓库里也都有 LICENSE 文件：#111 和 #124 是 MIT，#138 是 AGPL-3.0-only（GitHub 没识别出许可证类型，所以是逐个打开 LICENSE 文件核对的）。
- 在上面的固定版本上运行本仓库的 `check:plugin`，三个都通过了 manifest 和 patch 检查。
- 把三条记录交给 `normalizeCurated` 处理，替换快照里对应的条目后运行 `validateRegistry`，契约没有报错。生成的快照没有改动，留给常规同步去更新。
- 这次没有在隔离的 DSH Profile 里做安装 smoke，所以 `verification.installation` 保持 `not_tested`。

## 各项边界

- **#111**：v0.5.97 上核对过的情况如下。
  - 自动更新仍然默认开启：开关文件不存在时，`autoUpdateEnabled()` 返回 true；`AUTO_INTERVAL_MS` 是 2 分钟；安装时带 `--config.minimum-release-age=0`。
  - Ed25519 签名（`lib/shell/ota-signing.js`）只校验桌面完整包 OTA，从 npm 自动更新插件本身没有签名校验，所以目录里固定的版本约束不了实际运行的版本。维护者确认接受作者“默认开启、可一键关闭”的取舍，相关事实写进了条目简介。
  - 作者回复说已经完成的改动：tailcat/p2p 原生助手改成手动开启后才启动，`tailcat-host/` 公开了源码，README 重写了中转和权限说明，缺少 v2 信封时拒绝返回明文快照。这些只按回复记录在这里，没有逐项复现。
  - 2026-11-19 加的“未通过人工收录”简介覆盖已经删除，改用精选条目自带的简介。
- **#124**：`create_map` 会把地点数据 POST 到作者运营的公开服务，生成的地图公开可访问。草稿只在本地生成 JSON，不联网。本次没有调用这个服务。
- **#138**：根目录的 `dsh.patch.yml` 只加载 `plugins/muse-frame/dsh.mjs`，这个模块只读取自带的 `SKILL.md`，没有网络请求。桌面工作室和生图流程不在插件范围内，本次也没有验证。

## 补记：#136 收录与 #134 安装来源

- **#136 dsh-note-to-learn**：固定为 [`v0.1.3` Release 包](https://github.com/shiyan688/dsh-note-to-learn/releases/download/v0.1.3/dsh-note-to-learn-0.1.3.tgz)，源码提交 `59965e1b07abe6ec3d34cbc9cdb4562232675254`，SHA-256 为 `6c302820342740d669947c5abf2f7eade4833f4009d6cf619f936cc75c6a534f`，与 GitHub 资产摘要一致。仓库是 MIT 许可证，带 `dsh-plugin` Topic，`check:plugin` 检查通过。运行时只有在用户导入在线 PDF 链接时才联网，而且只接受 HTTPS、不带凭据。作者只在 Windows Desktop 上验证过。仓库 HEAD（`b250a15`）晚于 v0.1.3，这次没有审核那部分改动。
- **#134 NextTavern**：申请人就是仓库作者。条目仍然来自自动发现，这次通过 `sources/overrides.json` 把安装命令改成官方 npm 版本 `dsh-nexttavern@0.3.0-rc.1`。这个 npm 包没有记录 `gitHead`，目录暂时无法把它和具体的源码提交对应起来。
- 新记录经过 `normalizeCurated` / `applyGovernance` 处理后，`validateRegistry` 没有报契约错误；`npm test` 307 项通过。安装 smoke 没有做。
