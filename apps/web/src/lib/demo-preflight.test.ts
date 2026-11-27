import { describe, expect, test } from 'vitest'

import { type DemoPreflightProbes, formatDemoPreflight, runDemoPreflight } from '../../scripts/demo-preflight-lib.mjs'

const healthy = (): DemoPreflightProbes => ({
  dockerRunning: () => true,
  supabaseUp: () => true,
  mailpitUp: () => true,
  migrationsApplied: () => 8,
  migrationFiles: () => 8,
  envReady: () => true,
  demoDesigns: () => ({ designs: 3, published: 1 }),
  buildCurrent: () => true,
  previewServesBuild: () => true,
  videoCurrent: () => true,
})
const run = (changes: Partial<DemoPreflightProbes> = {}) => runDemoPreflight({ probes: { ...healthy(), ...changes } })
const statusOf = (report: { results: Array<{ id: string; status: string }> }, id: string) =>
  report.results.find((result) => result.id === id)?.status

describe('demo pre-flight', () => {
  test('is ready when everything is', async () => {
    const report = await run()
    expect(report.ready).toBe(true)
    expect(formatDemoPreflight(report)).toContain('Ready for the demo.')
  })

  test('with Docker down, says to start it and skips what depends on it', async () => {
    const report = await run({
      dockerRunning: () => {
        throw new Error('Cannot connect to the Docker daemon')
      },
    })
    expect(report.ready).toBe(false)
    expect(statusOf(report, 'docker')).toBe('fix')
    expect(statusOf(report, 'supabase')).toBe('skipped')
    expect(statusOf(report, 'demo-account')).toBe('skipped')
    const text = formatDemoPreflight(report)
    expect(text).toContain('Open Docker Desktop')
    expect(text).toContain('Mac password')
    expect(text).toContain('Not ready.')
  })

  test('an empty database, as after a Docker reset, says to run the reset', async () => {
    const report = await run({ demoDesigns: () => ({ designs: 0, published: 0 }) })
    expect(statusOf(report, 'demo-account')).toBe('fix')
    expect(formatDemoPreflight(report)).toContain('node scripts/demo-reset.mjs')
  })

  test('a missing migration never suggests the reset that wipes the database', async () => {
    const report = await run({ migrationsApplied: () => 7 })
    expect(statusOf(report, 'migrations')).toBe('fix')
    expect(formatDemoPreflight(report)).toContain('supabase migration up')
    expect(formatDemoPreflight(report)).toContain('Never run supabase db reset')
  })

  test('catches an old preview, an old build and an old video', async () => {
    expect(statusOf(await run({ previewServesBuild: () => false }), 'preview')).toBe('fix')
    const oldBuild = await run({ buildCurrent: () => false })
    expect(statusOf(oldBuild, 'build')).toBe('fix')
    expect(statusOf(oldBuild, 'preview')).toBe('skipped')
    expect(statusOf(await run({ videoCurrent: () => false }), 'video')).toBe('fix')
  })
})
