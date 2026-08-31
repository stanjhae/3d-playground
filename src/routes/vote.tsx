import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/vote')({
  component: VotePage,
})

function VotePage() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Fashion Leader Vote
      </p>
      <h1 className="font-display text-4xl text-ivory">The board</h1>
      <p className="max-w-lg text-base leading-relaxed text-ivory-muted">
        Looks and the Leader rank land here once the community feed is wired.
      </p>
    </section>
  )
}
