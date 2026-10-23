# 2026-10-23 社区插件收录

接受 [#84](https://github.com/majiayu000/dsh-plugin-registry/issues/84) DSH Extensions 和 [#85](https://github.com/majiayu000/dsh-plugin-registry/issues/85) Persona，更新已有自动发现记录，不新增重复项目。

两者均固定到 `v0.1.1-dsh.0.2.1-rc.2` Release 包，仅适配 DSH `0.2.1-rc.2`、Node.js `22.19+`。Extensions 会管理本地配置和运行用户配置的 Hooks；Persona 保存本地人格设置并影响模型提示。没有调用模型或修改用户日常 Profile。

| 项目 | 已核对源码 | 发布包 SHA-256 |
| --- | --- | --- |
| Extensions | `7fdd403daa817a9f9c574d9497953d0e0bad9870` | `e697e82c3958ab587010cab2eb6dcac17532ef4a41038fcad81722627416a5c9` |
| Persona | `b7f34767069244c38cfba3f86176b4e939542531` | `ba0ee44b521aeba03677fb839b3cbe1eb10d422361c16f9cf668eaafcc6b849d` |

- 发布包校验和与 GitHub Release 资产摘要一致；包内源文件与上述固定源码逐项一致。
- 两个项目的 manifest/patch 检查、源码构建及现有测试通过（Extensions 15 项、Persona 14 项）。重新构建的客户端输出与发布包一致。
- 使用 Node.js 24.17.0、精确版本 DSH 0.2.1-rc.2，从固定 Release URL 安装到独立临时 Web Profile；配置组合包含两个插件且无加载跳过。
- Registry 231 项测试、契约、排名检查和构建通过。
- 用现有归一化函数更新这两条记录，保留其他记录、总数和完整发现时间。未重新执行全量 GitHub 发现。

`verification.installation` 保持 `not_tested`：此次检查覆盖包、安装与配置组合，不代表完整桌面界面、全部业务行为或跨平台验收，也不是安全认证。
