const NAME_PATTERN = /(?:^|\n)[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\n#]+?)['"]?[ \t]*(?:#.*)?$/gm

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

function isTopLevelYamlArray(lines) {
  const body = lines.join('\n').trim()
  if (body.startsWith('[')) return true
  return lines.some(line => line.trimStart().startsWith('-'))
}

export function validateBundlePatch(text) {
  const lines = stripCommentsAndBlanks(text)
  if (!lines.length) {
    return { valid: false, reason_code: 'patch_empty', reason: 'The patch file is empty.' }
  }
  if (!isTopLevelYamlArray(lines)) {
    return { valid: false, reason_code: 'patch_not_array', reason: 'The patch file must be a top-level YAML array.' }
  }

  return { valid: true, names: patchPluginNames(text) }
}
