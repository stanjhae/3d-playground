import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'

import { buttonClass, Button } from './Button'

function Fallback({
  title,
  body,
  children,
  alert = false,
}: {
  title: string
  body: string
  children: React.ReactNode
  alert?: boolean
}) {
  return (
    <section
      role={alert ? 'alert' : undefined}
      className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center gap-3 px-4 py-24 text-center"
    >
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="font-body text-sm text-flv-muted">{body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">{children}</div>
    </section>
  )
}

/** Shown when a page fails while drawing, so it is never blank. */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <Fallback
      alert
      title="Something went wrong"
      body="This page hit a problem. Anything already saved is safe."
    >
      <Button
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </Button>
      {/* A full load, in case the app itself is what failed. */}
      <a href="/" className={buttonClass({ variant: 'secondary' })}>
        Go to the home page
      </a>
    </Fallback>
  )
}

export function RouteNotFound() {
  return (
    <Fallback title="Page not found" body="This page doesn't exist, or it has moved.">
      <Link to="/" className={buttonClass({ variant: 'secondary' })}>
        Go to the home page
      </Link>
    </Fallback>
  )
}
