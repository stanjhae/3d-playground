import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/look/$lookId')({
  component: LookPage,
})

function LookPage() {
  const { lookId } = Route.useParams()

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Shared look
      </p>
      <h1 className="font-display text-4xl text-ivory">Look {lookId}</h1>
      <p className="max-w-lg text-base leading-relaxed text-ivory-muted">
        This page will open one look without the editor chrome fighting it.
      </p>
    </section>
  )
}
