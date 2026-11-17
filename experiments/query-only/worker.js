// Eager entry: parse the bundled query document during Worker startup, so
// requests only run the query. Local measurement only; see README in docs.
import text from '../../.generated/query-only/query-document.txt'
import { createWorker } from './handler.js'

const document = JSON.parse(text)
export default createWorker(() => document)
