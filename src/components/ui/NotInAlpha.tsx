import { Link } from '@tanstack/react-router'

/**
 * Shown on guest-era pages (the vote board, guest looks) where the alpha
 * requires sign-in (F09 #144): designs are owned and shared by link now.
 */
export function NotInAlpha() {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-24">
      <h1 className="font-display text-3xl">Not part of this alpha</h1>
      <p className="font-body text-sm text-flv-muted">
        Designs are private to you and shared with a link when you publish them. Voting comes later.
      </p>
      <Link to="/studio" className="font-body text-sm underline">
        Open My Studio
      </Link>
    </section>
  )
}
