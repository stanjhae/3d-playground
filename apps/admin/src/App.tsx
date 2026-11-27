import type { Session } from '@supabase/supabase-js'
import { type FormEvent, useEffect, useState } from 'react'

import type { Overview } from './server/handlers.ts'
import { adminGet, supabase } from './supabase.ts'

type Access = { state: 'checking' } | { state: 'admin'; email: string | null } | { state: 'refused'; message: string }

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase) {
    return <Shell><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to use the admin.</p></Shell>
  }

  if (session === undefined) {
    return <Shell><p className="text-neutral-500">Loading…</p></Shell>
  }

  return <Shell>{session ? <Gate key={session.user.id} /> : <SignIn />}</Shell>
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h1 className="text-sm font-semibold tracking-wide">Fashion Leader Vote · Admin</h1>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  )
}

const input = 'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'
const button = 'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900'

function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    // No account is created here: only existing accounts get a code.
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
    setBusy(false)
    if (error) setMessage('Couldn’t send a code to that address.')
    else setSent(true)
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMessage('That code didn’t work. Check it, or send a new one.')
  }

  return (
    <section className="mx-auto max-w-sm space-y-4">
      <h2 className="text-xl font-semibold">Sign in</h2>
      {sent ? (
        <form className="space-y-3" onSubmit={verify}>
          <label className="block space-y-1 text-sm">
            <span>Code sent to {email}</span>
            <input className={input} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <button className={button} disabled={busy || !code.trim()}>Sign in</button>
          <button type="button" className="ml-3 text-sm underline" onClick={() => { setSent(false); setCode('') }}>Use another email</button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={sendCode}>
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className={button} disabled={busy || !email.trim()}>Send code</button>
        </form>
      )}
      {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
    </section>
  )
}

function Gate() {
  const [access, setAccess] = useState<Access>({ state: 'checking' })

  useEffect(() => {
    adminGet<{ email: string | null }>('/api/me').then((result) =>
      setAccess(result.ok ? { state: 'admin', email: result.body.email } : { state: 'refused', message: result.message }),
    )
  }, [])

  const signOut = () => supabase!.auth.signOut()

  if (access.state === 'checking') {
    return <p className="text-neutral-500">Checking access…</p>
  }

  if (access.state === 'refused') {
    return (
      <section className="space-y-3">
        <p role="alert">{access.message}</p>
        <button className={button} onClick={signOut}>Sign out</button>
      </section>
    )
  }

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Signed in as {access.email}</p>
        <button className="text-sm underline" onClick={signOut}>Sign out</button>
      </div>
      <OverviewPanel />
    </section>
  )
}

function OverviewPanel() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    adminGet<Overview>('/api/overview').then((result) => (result.ok ? setOverview(result.body) : setMessage(result.message)))
  }, [])

  if (message) return <p role="alert">{message}</p>
  if (!overview) return <p className="text-neutral-500">Loading…</p>

  const tiles: [string, number][] = [
    ['Accounts', overview.users],
    ['Designs', overview.designs],
    ['Published', overview.publications],
    ['Open reports', overview.openReports],
  ]

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Overview</h2>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <dt className="text-sm text-neutral-500">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
