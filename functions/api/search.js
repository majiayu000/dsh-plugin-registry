import { handleSearch } from '../lib/search.js'
import searchDocument from '../../.generated/search.json' with { type: 'json' }

export const onRequest = context => handleSearch(context, searchDocument)
