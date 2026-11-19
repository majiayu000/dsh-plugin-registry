# 2026-11-17 社区插件收录

接受 [#114](https://github.com/majiayu000/dsh-plugin-registry/issues/114) Deep Research Agent 和 [#117](https://github.com/majiayu000/dsh-plugin-registry/issues/117) Project Bookshelf。两者已存在于自动发现快照，本次通过 `sources/curated.json` 转为精选来源，并用 `sources/overrides.json` 保存显示名称和 Issue 来源；不新增重复记录，也不将格式检查等同于安全背书。

## 固定发布物

| 申请 | 安装来源 | 已核对源码 | SHA-256 |
| --- | --- | --- | --- |
| #114 | [`archive/c85cfb8….tar.gz`](https://github.com/champeil/deep_search_agent/archive/c85cfb869048f1ae3b214685fd48c738d5e2dfc5.tar.gz) | `c85cfb869048f1ae3b214685fd48c738d5e2dfc5` | 不记录（GitHub 源码归档按需生成，字节不保证稳定；内容由提交决定） |
| #117 | [`v1.1.4` Release 包](https://github.com/zhishengplus/dsh-project-bookshelf/releases/download/v1.1.4/dsh-project-bookshelf-1.1.4.tgz) | `c0761571a8aa3e3fd8c628598ffb36697bda4748` | `d0aa5242e4f81d5f54434a1915f21d335fec5b71799de5c6720b4ded10c7ed18` |

#114 没有 GitHub Release。精选条目的 `github:` 安装源会在每次同步时改钉到仓库 HEAD，因此改用审核提交的源码归档，使安装内容停在已审核的代码上。作者发布 Release 后可换成固定包。

#117 申请人在评论中指定 v1.1.4 取代 v1.1.3。仓库其后发布了 v1.1.5，未经本次审核，目录仍固定 v1.1.4。

## 本次验证

- 两个仓库公开、非 Fork、未归档，MIT 许可证，带 `dsh-plugin` Topic；本仓库 `npm run check:plugin` 对两份固定源码均通过 manifest 与 patch 检查。
- #117：Release 包大小 28,386 字节，SHA-256 与申请及 GitHub 资产摘要一致。包内 13 个文件中 10 个与 `c076157` 逐字节一致，`package.json` 和两份 README 仅换行符不同（CRLF）。用 esbuild 0.25.12 按仓库脚本重新构建的 `client.js` 与包内文件逐字节一致；上游 10 项测试通过。
- #114：上游 Node 测试 6 项通过、Python 测试 106 项中 105 项通过（唯一失败是独立 Python 安装器测试的 macOS `/private` 路径比较，与 DSH 包无关）。`Install_Deep_Research_Agent.py` 内嵌负载解码后与仓库 skill 文件一致。从源码归档安装得到的文件与审核提交一致。
- 使用 Node.js 25.9.0、精确版本 DSH 0.2.2-rc.3（npm `@deepseek-ai/dsh`），以独立 `DSH_HOME` 从上述固定来源分别安装到临时 Web Profile。`--dump-config` 组合包含插件挂载行，`--no-open` 绑定 127.0.0.1 启动后无加载错误。#114 启动时创建了 `~/.local/share/deep-research-agent/research.env` 与 `runs/research.sqlite3`，说明 Python MCP 服务已运行；该测试目录已删除。
- 用现有 `normalizeCurated`、覆盖与契约校验函数检查两条新记录，替换快照中对应条目后契约无错误。生成快照未改动，由常规同步应用。

## 各项边界

- Deep Research Agent 在 DSH 宿主内启动本机 Python 3.11+ stdio MCP 服务，提供 23 个研究工具，使用当前宿主模型，不另要模型 Key。配置与研究记录写在 DSH Profile 之外的 `~/.local/share/deep-research-agent`。检索时联网访问 NCBI、Europe PMC、Crossref、DOI 等学术接口，以及配置了 Key 的搜索服务（Tavily、Exa、SerpAPI、Perplexity、Firecrawl 等）和来源网页；网页读取会拒绝非公网地址。`peerDependencies` 精确声明 0.2.2-rc.1，在 0.2.2-rc.3 上 pnpm 报缺少 peer 警告，但宿主提供的版本可以正常加载。本次没有调用模型或外部检索服务，也没有核对研究质量与引用准确性。仓库 `SHA256SUMS` 列出的部分文件不在仓库中，`README.md` 校验和已过期；它不是安装依据。
- Project Bookshelf 只调用宿主的工作区、会话、右键菜单与目录选择接口，没有网络请求。它默认替换工作区视图，可以切回原版；封面设置保存在浏览器 localStorage。移除项目需要确认，调用宿主 `workspaces.delete`。本次没有在界面中操作重命名、移除或封面编辑，作者只报告过 Windows 测试，macOS/Linux 界面行为未验证。

`verification.installation` 保持 `not_tested`：此次检查覆盖固定来源、安装、配置组合与启动，不代表完整界面、全部业务行为或跨平台验收，也不是安全认证。
