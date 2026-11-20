import { Link, createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Anything the router doesn't know. Hosting already answers these with a
 * 404 and this shell; the page says so and offers a way on. `/sign-up` is
 * the old name for sign-in, so it goes there instead of looking missing.
 */
export const Route = createFileRoute('/$')({
  beforeLoad: ({ location }) => {
    if (isSignUpPath({ pathname: location.pathname })) {
      throw redirect({ to: '/sign-in', search: { returnTo: '/studio' } })
    }
  },
  component: MissingPage,
})

export function isSignUpPath({ pathname }: { pathname: string }) {
  return pathname === '/sign-up' || pathname === '/sign-up/'
}

function MissingPage() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-display text-4xl leading-tight">That page isn’t here</h1>
      <p className="font-body text-sm leading-relaxed text-flv-muted">
        The address doesn’t match a page on Fashion Leader Vote. It may have moved, or it was typed wrong.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/" search={{}} className="flv-cta inline-flex min-h-11 items-center px-5 font-body text-sm font-medium">
          Back to the home page
        </Link>
        <Link to="/sign-in" search={{ returnTo: '/studio' }} className="inline-flex min-h-11 items-center font-body text-sm text-flv-ink underline underline-offset-4 hover:text-flv-accent">
          Sign in
        </Link>
      </div>
    </section>
  )
}
