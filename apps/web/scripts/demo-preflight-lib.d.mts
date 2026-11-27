// Types for demo-preflight-lib.mjs, used by its tests.

export type DemoPreflightProbes = {
  dockerRunning: () => boolean | Promise<boolean>
  supabaseUp: () => boolean | Promise<boolean>
  mailpitUp: () => boolean | Promise<boolean>
  migrationsApplied: () => number | Promise<number>
  migrationFiles: () => number | Promise<number>
  envReady: () => boolean | Promise<boolean>
  demoDesigns: () => { designs: number; published: number } | Promise<{ designs: number; published: number }>
  buildCurrent: () => boolean | Promise<boolean>
  previewServesBuild: () => boolean | Promise<boolean>
  videoCurrent: () => boolean | Promise<boolean>
}

export type DemoPreflightResult =
  | { id: string; label: string; status: 'ok' }
  | { id: string; label: string; status: 'skipped'; blockedBy: string }
  | { id: string; label: string; status: 'fix'; fix: string; error?: string }

export type DemoPreflightReport = { ready: boolean; results: DemoPreflightResult[] }

export function runDemoPreflight(input: { probes: DemoPreflightProbes }): Promise<DemoPreflightReport>
export function formatDemoPreflight(report: DemoPreflightReport): string
