// Lazy entry: parse on the first request. Used only to measure the parse
// cost inside workerd; it is not a deployable design for Workers Free.
import text from '../../.generated/query-only/query-document.txt'
import { createWorker } from './handler.js'

let document
export default createWorker(() => (document ??= JSON.parse(text)))
