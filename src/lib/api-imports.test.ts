import { describe, expect, test } from 'vitest'

/**
 * The serverless functions in `api/` run the TypeScript sources directly in
 * Node, which resolves ES modules only by their full file name. An import
 * like `./base-motifs` works in the Vite build and in Vitest, but crashed
 * every API route on beta with ERR_MODULE_NOT_FOUND (27 Nov). So every
 * relative import reachable from `api/` must name its extension.
 */
const SOURCES = import.meta.glob<string>(['../../api/**/*.ts', '../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const RELATIVE_IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm
const WITH_EXTENSION = /\.(ts|tsx|js|mjs|json)$/

/** A glob key (relative to `src/lib`) as a path from the repo root. */
function fromRoot(globKey: string) {
  return join({ folder: 'src/lib', specifier: globKey })
}

/** Resolves a relative specifier against a folder, POSIX style. */
function join({ folder, specifier }: { folder: string; specifier: string }) {
  const parts = folder.split('/').filter(Boolean)

  for (const part of specifier.split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part !== '.' && part !== '') {
      parts.push(part)
    }
  }

  return parts.join('/')
}

const FILES = new Map(Object.entries(SOURCES).map(([globKey, source]) => [fromRoot(globKey), source]))

function missingExtensions() {
  const seen = new Set<string>()
  const missing: string[] = []

  const visit = (file: string) => {
    if (seen.has(file)) {
      return
    }

    seen.add(file)
    const source = FILES.get(file)

    if (source === undefined) {
      return
    }

    const folder = file.split('/').slice(0, -1).join('/')

    for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
      const target = join({ folder, specifier: specifier! })

      if (WITH_EXTENSION.test(specifier!)) {
        visit(target)
        continue
      }

      missing.push(`${file} imports ${specifier}`)
      const found = ['.ts', '.tsx', '.js'].map((ext) => target + ext).find((path) => FILES.has(path))

      if (found) {
        visit(found)
      }
    }
  }

  for (const file of FILES.keys()) {
    if (file.startsWith('api/')) {
      visit(file)
    }
  }

  return { missing, reached: seen }
}

describe('API imports', () => {
  test('the scan reaches the shared document code the functions use', () => {
    const { reached } = missingExtensions()
    expect(reached.has('api/flp.ts')).toBe(true)
    expect(reached.has('src/lib/canonical-document.ts')).toBe(true)
  })

  test('every relative import the serverless functions reach names its file extension', () => {
    expect(missingExtensions().missing).toEqual([])
  })
})
