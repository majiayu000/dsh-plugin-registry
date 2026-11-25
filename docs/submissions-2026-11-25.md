# 2026-11-25 社区插件收录

[#129](https://github.com/majiayu000/dsh-plugin-registry/issues/129) kk-deep-factory 使用 [v0.3.1 Release 包](https://github.com/kbr19930409/kk-deep-factory/releases/tag/v0.3.1)。标签提交为 `e549a5d88d2531927ed79635708851a5b6548772`。包的 SHA-256 为 `3b7cbdd2b7229a42262056d9d7a9740a692c6a6256f827f3af47e0c15bbf4428`，与 GitHub 资产摘要一致。30 个普通文件（含 MIT LICENSE）与标签源码逐字节一致。Release 包与标签源码均通过 `check:plugin` 的 manifest 和 Patch 检查。

- Web 配置档启动带内部令牌的本机 Python 服务，服务绑定 `127.0.0.1`。子进程继承宿主环境，通过 `FACTORY_PYTHON` 可指定解释器，`KK_DEEP_FACTORY_DATA_DIR` 可指定数据目录。默认将聊天和工单保存在 DSH Profile 的 SQLite 中。
- 内置设备管理适配器会在本地生成示例数据并定时补齐。Web 入口禁用旧 IoT 路径。发起 AI 分析时，当前业务案例与相关设备记录由宿主所选模型处理。工单创建走用户确认流程。面板权限依赖当前 DSH 工作区所有者边界。
- 包要求 DSH `>=0.2.2-alpha.2 <0.2.3-0`、Node.js 24.9+ 和 Python 3.11+（带 SQLite）。本次没有运行插件，`verification.installation` 保持 `not_tested`。
