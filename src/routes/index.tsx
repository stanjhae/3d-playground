import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: AtelierHome,
})

function AtelierHome() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
      <p className="font-display text-xs tracking-[0.32em] text-brass uppercase">
        Fashion Leader Vote
      </p>
      <h1 className="max-w-xl font-display text-5xl leading-tight text-ivory">
        Design a look. Publish it. Name a Leader.
      </h1>
      <p className="max-w-lg text-base leading-relaxed text-ivory-muted">
        The atelier opens on a garment, not a campus tour. Fabric names come
        next. Walk mode stays optional.
      </p>
      <section className="flex min-h-80 items-center justify-center border border-atelier-line bg-atelier-raised">
        <p className="font-display text-sm tracking-[0.22em] text-ivory-muted uppercase">
          Garment frame
        </p>
      </section>
    </section>
  )
}
