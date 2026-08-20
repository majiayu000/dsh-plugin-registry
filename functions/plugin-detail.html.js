import { handleLegacyPluginDetail } from './lib/legacy-plugin-detail.js'

export function onRequest(context) {
  return handleLegacyPluginDetail(context)
}
