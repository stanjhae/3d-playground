import type { Session } from '@supabase/supabase-js'
import { type FormEvent, useEffect, useState } from 'react'

import { DesignsPanel, FlagsPanelView, HealthPanelView, type Links, OverviewPanel, ReportsPanel, UsersPanel } from './panels.tsx'
import { adminGet, supabase } from './supabase.ts'
import { button, input } from './ui.tsx'

type Access = { state: 'checking' } | ({ state: 'admin'; email: string | null } & Links) | { state: 'refused'; message: string }

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'designs', label: 'Designs' },
  { id: 'reports', label: 'Reports' },
  { id: 'health', label: 'Health' },
  { id: 'flags', label: 'Flags' },
] as const

type Tab = (typeof TABS)[number]['id']

/** The tab in the URL hash, so a reload or a shared link keeps it. */
function tabFromHash(): Tab {
  const id = window.location.hash.slice(1)
  return TABS.some((tab) => tab.id === id) ? (id as Tab) : 'overview'
}

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
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}

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
    adminGet<{ email: string | null } & Links>('/api/me').then((result) =>
      setAccess(result.ok ? { state: 'admin', ...result.body } : { state: 'refused', message: result.message }),
    )
  }, [])

  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const follow = () => setTab(tabFromHash())
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
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

  const links: Links = { siteUrl: access.siteUrl, posthogUrl: access.posthogUrl }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">Signed in as {access.email}</p>
        <button className="text-sm underline" onClick={signOut}>Sign out</button>
      </div>
      <nav aria-label="Panels" className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === item.id ? 'border-neutral-900 font-medium dark:border-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'}`}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {tab === 'overview' && <OverviewPanel links={links} />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'designs' && <DesignsPanel links={links} />}
      {tab === 'reports' && <ReportsPanel links={links} />}
      {tab === 'health' && <HealthPanelView />}
      {tab === 'flags' && <FlagsPanelView />}
    </section>
  )
}
