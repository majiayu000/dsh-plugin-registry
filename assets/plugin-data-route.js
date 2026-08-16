/* 单插件数据文件的文件名编码，供 scripts/generate-seo.mjs（产出）与详情页（读取）共用。
   GitHub 用户名只含字母数字和连字符，`__` 分隔 owner/repo 无歧义；
   `#qualifier` 是 dsh.bundle 仓库内路径，可含 `/` 等字符，转义成 `~XX` 十六进制以保证
   文件名是单段路径。不用 % 编码：Cloudflare Pages 会把 URL 里的 %2F 解码回路径分隔符，
   与磁盘上字面量命名的静态文件对不上。 */
export function pluginDataFilename(pluginId) {
  const [repository, qualifier] = String(pluginId || '').split('#', 2)
  const [owner, name] = String(repository || '').split('/')
  if (!owner || !name) return ''
  const safe = /[A-Za-z0-9._-]/
  const encodedQualifier = qualifier
    ? '~~' + Array.from(qualifier, ch => (safe.test(ch) ? ch : '~' + ch.charCodeAt(0).toString(16).padStart(2, '0'))).join('')
    : ''
  return owner + '__' + name + encodedQualifier
}
