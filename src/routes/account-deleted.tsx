import { Link, createFileRoute } from '@tanstack/react-router'

/** Where self-serve account deletion lands (P1), already signed out. */

export const Route = createFileRoute('/account-deleted')({
  component: AccountDeleted,
})

function AccountDeleted() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-display text-4xl leading-tight">Your account has been deleted</h1>
      <p className="font-body text-sm leading-relaxed text-flv-muted">
        Your designs, their history and pictures, your uploads and your public links are gone, and this browser is
        signed out. Copies in backups expire on their own, as the{' '}
        <Link to="/privacy" className="underline">
          privacy page
        </Link>{' '}
        explains. Signing in again with the same email starts a new, empty account.
      </p>
      <Link to="/" search={{}} className="flv-cta inline-flex min-h-11 items-center px-5 font-body text-sm font-medium">
        Back to the home page
      </Link>
    </section>
  )
}
