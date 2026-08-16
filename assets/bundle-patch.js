const NAME_PATTERN = /(?:^|\n)[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\n#]+?)['"]?[ \t]*(?:#.*)?$/gm
const ID_PATTERN = /(?:^|\n)[ \t]*-?[ \t]*id:[ \t]*\S+/

function stripCommentsAndBlanks(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.replace(/(^|\s)#.*$/, '').trimEnd())
    .filter(line => line.trim())
}

export function patchPluginNames(text) {
  const names = []
  const source = String(text || '')
  for (const match of source.matchAll(NAME_PATTERN)) {
    const name = match[1].trim()
    if (name) names.push(name)
  }
  return names
}

export function validateBundlePatch(text, { packageName } = {}) {
  const lines = stripCommentsAndBlanks(text)
  if (!lines.length) {
    return { valid: false, reason_code: 'patch_empty', reason: 'The patch file is empty.' }
  }
  if (!lines.some(line => line.trimStart().startsWith('-'))) {
    return { valid: false, reason_code: 'patch_not_array', reason: 'The patch file must be a YAML array of plugin rows.' }
  }

  const names = patchPluginNames(text)
  if (!names.length || !ID_PATTERN.test(text)) {
    return { valid: false, reason_code: 'patch_no_plugin_row', reason: 'The patch file must declare at least one plugin row with id and name.' }
  }

  if (packageName) {
    const matchesPackage = names.some(name => name === packageName || name.startsWith(`${packageName}/`))
    if (!matchesPackage) {
      return {
        valid: false,
        reason_code: 'patch_name_mismatch',
        reason: `The patch name must match package.json name "${packageName}".`,
      }
    }
  }

  return { valid: true, names }
}
