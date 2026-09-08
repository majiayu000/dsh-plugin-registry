import { handlePluginDetail } from '../lib/plugin-detail.js'

export const onRequest = context => handlePluginDetail(context, 'html')
