/*
 * /api/track — 插件行为打点（view / copy / outbound）。
 * 数据写入 Cloudflare Workers Analytics Engine：运行时只发数据点、无服务器存储，
 * 聚合在 sync 时通过 SQL API 查询。每个数据点只含插件 ID、事件类型和
 * 加盐 SHA-256 的访问者摘要（查询侧 COUNT DISTINCT 去重用）；不设 Cookie，不存明文 IP。
 */

const EVENTS = new Set(['view', 'copy', 'outbound'])
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:#[A-Za-z0-9._-]+)?$/
const MAX_BODY_BYTES = 512

function noContent(headers = {}) {
  return new Response(null, { status: 204, headers })
}

export function validateTrackPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'invalid payload' }
  const pluginId = String(input.pluginId || '').trim()
  const event = String(input.event || '').trim()
  if (!EVENTS.has(event)) return { error: 'unknown event' }
  if (pluginId.length > 200 || !PLUGIN_ID_PATTERN.test(pluginId)) return { error: 'invalid plugin id' }
  return { value: { pluginId, event } }
}

export async function visitorDigest(ip, salt) {
  const address = String(ip || 'unknown')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${address}`))
  return [...new Uint8Array(digest)].slice(0, 8).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function handleTrack(context) {
  const requestUrl = new URL(context.request.url)
  const origin = context.request.headers.get('origin')
  if (origin && origin !== requestUrl.origin) return noContent({ 'x-track': 'rejected' })

  const contentLength = Number(context.request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) return noContent({ 'x-track': 'too-large' })
  const contentType = String(context.request.headers.get('content-type') || '').toLowerCase()
  if (!contentType.startsWith('application/json')) return noContent({ 'x-track': 'unsupported' })

  let payload
  try {
    payload = await context.request.json()
  } catch {
    return noContent({ 'x-track': 'unreadable' })
  }
  if (JSON.stringify(payload).length > MAX_BODY_BYTES) return noContent({ 'x-track': 'too-large' })
  const validation = validateTrackPayload(payload)
  if (validation.error) return noContent({ 'x-track': 'invalid' })

  const dataset = context.env?.TRACKING
  if (!dataset?.writeDataPoint) return noContent({ 'x-track': 'skipped' })

  // 缺少 TRACK_SALT 时跳过而不是回退到某个公共盐：公共盐会让存储的摘要可被离线暴力枚举，
  // 静默降级等于放弃"匿名访问者摘要"的承诺。
  const salt = context.env.TRACK_SALT
  if (!salt) return noContent({ 'x-track': 'skipped' })

  const visitor = await visitorDigest(context.request.headers.get('CF-Connecting-IP'), salt)
  dataset.writeDataPoint({
    blobs: [validation.value.event, validation.value.pluginId, visitor],
    indexes: [validation.value.pluginId],
  })
  return noContent({ 'x-track': 'recorded' })
}

export function onRequestPost(context) {
  return handleTrack(context)
}
