# 站内插件审核提交

发布页通过 Cloudflare Pages Function 把站内表单转换为 GitHub Issue。访问者留在站内完成仓库预检、作者确认和提交；服务端重新检查公开仓库信息，创建带 `plugin-submission` 标签的 Issue，并指派维护者。

## 流程

1. 浏览器检查公开仓库、`dsh-plugin` Topic、根目录 `package.json` 和仓库状态。
2. 作者填写 GitHub 用户名、插件简介和可选说明。
3. Cloudflare Turnstile 生成人机验证令牌。
4. `POST /api/submissions` 在服务端再次验证输入、Turnstile 和 GitHub 仓库。
5. Function 在 `majiayu000/dsh-plugin-registry` 创建并指派公开审核 Issue。
6. 页面显示 Issue 编号和可追踪链接；重复提交返回现有审核记录。

GitHub Issue 是审核记录，不改变当前每两小时一次的目录自动发现规则。

## Cloudflare 配置

在 Pages 项目 `dsh-plugin-registry` 的 **Settings → Variables and Secrets** 中配置：

- `GITHUB_SUBMISSIONS_TOKEN`：加密 Secret。使用仅授权本仓库、仅有 `Issues: Read and write` 权限的 fine-grained token。
- `TURNSTILE_SECRET_KEY`：加密 Secret。
- `TURNSTILE_SITE_KEY`：Turnstile 公共 site key。
- `GITHUB_REGISTRY_REPOSITORY`：可选，默认 `majiayu000/dsh-plugin-registry`。
- `GITHUB_REVIEWER`：可选，默认 `majiayu000`。
- `TRACK_SALT`：加密 Secret。给 `/api/track` 的访问者摘要加盐。未配置时埋点直接跳过，不会回退到公共盐。

Turnstile Widget 需要允许 `plugin.dshdesk.com`。生产环境不要使用测试密钥。

本地联调时复制 `.env.example` 为 `.dev.vars` 并填写测试凭据，然后运行：

```sh
npm run dev:cloudflare
```

普通的 `npm run dev` 只启动 Vite 静态前端，因此站内通道会显示“尚未配置”，GitHub 备用提交仍然可用。

## 安全边界

- GitHub Token 和 Turnstile Secret 只存在于 Cloudflare 服务端绑定中。
- POST 只接受同源 JSON 请求，并限制请求和字段长度。
- Turnstile 必须经过服务端 Siteverify，且校验 action 和 hostname。
- 服务端不信任浏览器预检，会独立读取仓库和 Manifest。
- Issue 内容是公开信息，表单不会收集邮箱或其他私密联系方式。
