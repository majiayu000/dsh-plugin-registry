/*
 * best-effort 行为打点（view / copy / outbound）。
 * 生产环境：打点失败必须对用户完全无感（analytics 是旁路，不是功能路径）。
 * 本地开发（localhost）：改用 fetch 读响应头并把结果打到 console，埋点绝不静默——
 * 一眼能看到 recorded / skipped / failed，方便调试。
 */
var LOCAL_DEV = typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)

export function trackPluginEvent(pluginId, event) {
  try {
    var body = JSON.stringify({ pluginId: pluginId, event: event })
    if (LOCAL_DEV) {
      fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true })
        .then(function (res) { console.debug('[track] ' + event + ' ' + pluginId + ' → ' + (res.headers.get('x-track') || 'no-status')) })
        .catch(function (error) { console.warn('[track] ' + event + ' ' + pluginId + ' → failed: ' + error) })
      return
    }
    if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return
    fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true })
      .catch(function () { /* best-effort analytics; failures must stay invisible */ })
  } catch (error) {
    /* best-effort analytics; failures must stay invisible */
  }
}
