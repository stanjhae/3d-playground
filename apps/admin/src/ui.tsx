import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { type AdminResult, adminGet } from './supabase.ts'

/** The admin's few shared styles: one input, one button, one quiet button. */
export const input = 'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'
export const button = 'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900'
export const quietButton =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:hover:border-neutral-100'
export const card = 'rounded-lg border border-neutral-200 p-4 dark:border-neutral-800'
export const muted = 'text-neutral-500'

/** A GET that loads on mount and whenever `path` changes, with a reload. */
export function useAdminGet<T>(path: string) {
  const [result, setResult] = useState<AdminResult<T> | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    adminGet<T>(path).then((next) => {
      if (!cancelled) setResult(next)
    })
    return () => {
      cancelled = true
    }
  }, [path, attempt])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  return { result, reload }
}

/** Loading, a failure with a retry, or the panel itself. */
export function Loaded<T>({ result, reload, children }: { result: AdminResult<T> | null; reload: () => void; children: (body: T) => ReactNode }) {
  if (!result) return <p className={muted}>Loading…</p>

  if (!result.ok) {
    return (
      <div className="space-y-2">
        <p role="alert">{result.message}</p>
        <button type="button" className={quietButton} onClick={reload}>
          Try again
        </button>
      </div>
    )
  }

  return <>{children(result.body)}</>
}

export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {aside}
    </div>
  )
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

/** A small coloured state label. */
export function Badge({ tone, children }: { tone: 'good' | 'bad' | 'neutral'; children: ReactNode }) {
  const tones = {
    good: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  }
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
