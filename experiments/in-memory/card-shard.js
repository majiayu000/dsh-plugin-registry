// Small display-card buckets used only by the historical in-memory experiment.
export function searchCardShardFilename(pluginId) {
  let hash = 2166136261
  for (const character of String(pluginId).trim().toLowerCase()) {
    hash = Math.imul(hash ^ character.codePointAt(0), 16777619)
  }
  return (hash & 4095).toString(16).padStart(3, '0')
}
