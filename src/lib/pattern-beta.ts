/**
 * Pattern (beta): the Workflow 1 editor, off unless the build sets
 * `VITE_PATTERN_BETA=true` (the owner turns it on; docs/deploy.md). With it
 * off, the editor's chunk isn't built and nothing writes a pattern, though
 * every build reads one (docs/release.md).
 */
export const PATTERN_BETA = import.meta.env.VITE_PATTERN_BETA === 'true'

/**
 * Garment template versions with a pattern template, as `id@version`. Kept
 * here, light, for the switch; `templates.test.ts` checks it matches the
 * templates themselves.
 */
export const PATTERN_TEMPLATE_VERSIONS: readonly string[] = [
  'tee-crew-short@4',
  'tee-crew-short@5',
  'hoodie@1',
  'coat@1',
  'suit@1',
  'tailored@1',
  'mixed@1',
  'slip@1',
  'overall@1',
  'gown@1',
  'vest@1',
  'crop@1',
  'dress@1',
  'trousers@1',
]

export function patternAvailable({ template }: { template: { id: string; version: number } }) {
  return PATTERN_BETA && PATTERN_TEMPLATE_VERSIONS.includes(`${template.id}@${template.version}`)
}
