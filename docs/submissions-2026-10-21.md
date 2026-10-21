# 2026-10-21 社区插件收录记录

## 决定

采用 #77–#81 的人工收录。五个仓库已存在于自动发现快照，本次通过 `sources/curated.json` 转为精选来源，并用 `sources/overrides.json` 保存显示名称和 Issue 来源；不新增重复记录，也不将格式检查等同于安全背书。

所有条目固定到申请中的 GitHub Release 安装包，要求 DSH `0.2.1-rc.2` 和 Node.js `22.19+`。Windows/Linux 完整功能、付费模型调用、文件恢复、主题安装及 Electron 桥接均未在本次独立验收。任何一项固定包不可安装、manifest/patch 无效或宿主启动失败，都应暂缓该项收录。

## 固定发布物

| 申请 | 包 | Release | SHA-256 |
| --- | --- | --- | --- |
| [#77](https://github.com/majiayu000/dsh-plugin-registry/issues/77) | `dsh-workflow-plus@0.1.1-dsh.0.2.1-rc.2` | [v0.1.1-dsh.0.2.1-rc.2](https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.1-dsh.0.2.1-rc.2) | `6f1df4f19ae8cd657aa1f0580f60d9fcf8f1105edb88b346933e40582f1b9c96` |
| [#78](https://github.com/majiayu000/dsh-plugin-registry/issues/78) | `@gulagala001/dsh-undo-plugin@0.1.0-dsh.0.2.1-rc.2` | [v0.1.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.0-dsh.0.2.1-rc.2) | `4436c038c9d7798931f7242e25541bab1bb151d357865652f9516afbe4c10d9d` |
| [#79](https://github.com/majiayu000/dsh-plugin-registry/issues/79) | `dsh-deepseek-workbench@0.1.0-dsh.0.2.1-rc.2` | [v0.1.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/dsh-deepseek-workbench/releases/tag/v0.1.0-dsh.0.2.1-rc.2) | `a78a43866891467843803c795e65008a05d88e76e1e99848a290d450963fdcb2` |
| [#80](https://github.com/majiayu000/dsh-plugin-registry/issues/80) | `@gulagala001/dsh-btw@0.1.0-dsh.0.2.1-rc.2` | [v0.1.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/dsh-btw/releases/tag/v0.1.0-dsh.0.2.1-rc.2) | `25a4a9934c7600062bf0ca7a6c26a5855ef8ee4f3c12f778377895ae2d441e1b` |
| [#81](https://github.com/majiayu000/dsh-plugin-registry/issues/81) | `@gulagala001/dsh-theme-plugin@0.2.0-dsh.0.2.1-rc.2` | [v0.2.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/dsh-theme-plugin/releases/tag/v0.2.0-dsh.0.2.1-rc.2) | `a804e3be1dbc1edc11e56be1ba24997e4aa8f5bfc00a92d0b6aacbb99f0c38e1` |

## 本次验证

- 五个 Release 安装包下载后的 SHA-256 均与 GitHub 发布资产记录一致；package.json、入口与 bundle patch 齐全。
- 使用 [dsh-desk #105](https://github.com/majiayu000/dsh-desk/pull/105) 的 macOS arm64 离线 runtime，逐一从上述固定 Release URL 安装到独立临时 Web Profile；五项均通过真实安装、配置组合、宿主启动、launch-token 换取会话 cookie 和首页 boot 文档检查。临时 Profile 已清理。
- 使用 Registry 现有 manifest/patch 契约及归一化逻辑生成五项记录；保留其他记录、验证 SHA、总数和原始发现时间。没有执行一次新的完整 GitHub 发现，也没有更新全站发现时间。
- 本地 `npm test`（231 项）、`npm run validate:registry`、`npm run check:ranking` 和 `npm run build` 通过；端到端页面检查由本 PR 的 CI 执行。
- 公共 `verification.installation` 继续使用现有契约的 `not_tested`：以上有限 smoke 检查不代表完整功能验收或跨平台安装认证。

## 各项边界

- Workflow 使用 0.1.1 包，包含此前缺少的直接构建依赖；本次未调用模型验证预算或续跑语义。
- Rewind & Undo 固定使用 `@gulagala001/dsh-undo-plugin` 的 Release 包，不使用其他维护者的无 scope npm 同名包；外部副作用不能撤销，无文件快照时仅恢复会话。
- DeepSeek Workbench 使用 Web Profile 验证基础安装。标准 CLI 将 `desktop` 保留给 Electron 管理，因此目录提供可安装的 Web 命令；内嵌操作、网页提取及完整桌面行为需要配套桥接。Web/Tauri 提供外部浏览器入口，不承诺 Electron 功能。
- BTW 沿用现有模型提供方的正常计费；不承诺缓存命中，也不将侧聊写入主会话或执行工具的作者声明升级为本次功能测试结果。
- Themes 安装的第三方主题仍具正常 Node/页面能力，预检不是恶意代码沙箱；本次没有安装市场主题或验证其全部组合。
