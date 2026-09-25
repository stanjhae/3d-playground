import { FLV_COPY } from '../../lib/flv-copy'

export function LandingSoon() {
  return (
    <section className="flex flex-col gap-6 border-b border-flv-line px-6 py-12 sm:px-10">
      <div className="flex flex-col gap-2">
        <p className="font-display text-xs tracking-[0.22em] text-flv-accent uppercase">
          {FLV_COPY.soonBadge}
        </p>
        <h2 className="font-display text-3xl text-flv-ink">
          {FLV_COPY.soonTitle}
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col gap-3 border border-flv-line p-5">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            {FLV_COPY.soonBadge}
          </p>
          <h3 className="font-display text-2xl text-flv-ink">
            {FLV_COPY.soonAiShoot}
          </h3>
          <p className="font-body text-sm text-flv-muted">
            {FLV_COPY.soonAiShootLead}
          </p>
        </article>
        <article className="flex flex-col gap-3 border border-flv-line p-5">
          <p className="font-body text-xs tracking-[0.14em] text-flv-accent uppercase">
            {FLV_COPY.soonBadge}
          </p>
          <h3 className="font-display text-2xl text-flv-ink">
            {FLV_COPY.soonAiVideo}
          </h3>
          <p className="font-body text-sm text-flv-muted">
            {FLV_COPY.soonAiVideoLead}
          </p>
        </article>
      </div>
    </section>
  )
}
