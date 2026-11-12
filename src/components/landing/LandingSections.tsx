import {
  Check,
  Eye,
  KeyRound,
  Layers,
  Lock,
  MousePointer2,
  PenTool,
  Rotate3d,
  Share2,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Type,
  Users,
  Vote,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '../../lib/cn'
import { HOUSE_COPY } from '../../lib/house-copy'
import { LANDING_COPY } from '../../lib/landing-copy'
import { GownCredit } from '../editor/GownCredit'
import { ConceptPreviewBadge } from '../ui/ConceptPreviewBadge'
import { HeroPoster, HERO_POSTER } from './HeroPoster'
import { HeroToolDock } from './HeroToolDock'
import { CreateCta, type LandingMode } from './LandingLink'

const C = LANDING_COPY

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('font-body text-xs font-medium tracking-[0.22em] text-flv-accent uppercase', className)}>
      {children}
    </p>
  )
}

function SectionHeading({
  eyebrow,
  title,
  accent,
  lead,
  id,
  align = 'left',
}: {
  eyebrow: string
  title: string
  accent?: string
  lead?: string
  id: string
  align?: 'left' | 'center'
}) {
  return (
    <div className={cn('flex max-w-3xl flex-col gap-4', { 'mx-auto items-center text-center': align === 'center' })}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="font-display text-4xl leading-[1.02] text-balance text-flv-ink sm:text-5xl lg:text-6xl">
        {title}
        {accent ? <span className="flv-text-gradient block">{accent}</span> : null}
      </h2>
      {lead ? <p className="max-w-xl font-body text-lg text-pretty text-flv-muted">{lead}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ hero */

export function LandingHeroSection({
  mode,
  stage,
  intro = true,
}: {
  mode: LandingMode
  stage?: ReactNode
  /** The entrance plays once: not again when the live page replaces the prerendered one. */
  intro?: boolean
}) {
  const hero = C.hero

  return (
    <section id="product" aria-labelledby="hero-title" className={cn('flv-hero relative isolate overflow-hidden', { 'flv-intro': intro })}>
      <div aria-hidden className="flv-hero-glow pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="flv-hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 pt-28 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:px-10 lg:pt-36 lg:pb-24">
        <div className="flex flex-col gap-7">
          <p className="flv-rise inline-flex w-fit items-center gap-2 rounded-full border border-flv-line bg-white/80 px-3 py-1.5 font-body text-xs text-flv-muted shadow-sm backdrop-blur">
            <Sparkles aria-hidden className="size-3.5 text-flv-accent" />
            {hero.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="font-display text-[clamp(2.75rem,6.6vw,5.75rem)] leading-[0.92] tracking-[-0.045em] text-flv-ink"
          >
            {hero.lines.map((line, index) => (
              <span key={line} className={cn('flv-line block', `flv-d${index + 1}`)}>
                <span className="block">{line}</span>
              </span>
            ))}
            <span className="flv-line flv-d3 block">
              <span className="flv-text-gradient block pb-[0.08em]">{hero.accent}</span>
            </span>
          </h1>
          <p className="flv-rise flv-d4 max-w-xl font-body text-lg text-pretty text-flv-muted sm:text-xl">
            {hero.lead}{' '}
            <strong className="font-medium text-flv-ink">{hero.tryIt}</strong>
          </p>
          <div className="flv-rise flv-d5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <CreateCta mode={mode}>{hero.cta}</CreateCta>
            <a
              href="#flow"
              className="inline-flex min-h-12 items-center justify-center gap-2 px-3 font-body text-sm text-flv-muted underline-offset-4 hover:text-flv-ink hover:underline"
            >
              {hero.secondary}
              <span aria-hidden>↓</span>
            </a>
          </div>
          <p className="flv-rise flv-d5 -mt-3 font-body text-sm text-flv-muted">{hero.ctaNote}</p>
          <ul className="flv-rise flv-d6 flex flex-wrap gap-x-5 gap-y-2 border-t border-flv-line pt-5 font-body text-sm text-flv-ink">
            {hero.proof.map((item) => (
              <li key={item} className="inline-flex items-center gap-2">
                <Check aria-hidden className="size-4 text-flv-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flv-rise flv-d3 relative flex flex-col items-center gap-4 lg:block">
          <div aria-hidden className="flv-halo pointer-events-none absolute inset-[8%] -z-10 rounded-full" />
          {stage ?? (
            <div className="relative mx-auto aspect-square w-full max-w-[36rem] overflow-hidden rounded-[2rem] border border-flv-line bg-white shadow-[0_40px_80px_-30px_rgb(11_13_18_/0.35)]">
              <HeroPoster />
            </div>
          )}
          {/* A credited model (CC BY) is named under it; today's tee is project-made. */}
          <div className="mt-3 flex justify-center lg:absolute lg:-bottom-8 lg:right-0">
            <GownCredit garmentId="tee" />
          </div>
          <div className="relative z-10 w-full max-w-md lg:absolute lg:-bottom-14 lg:-left-14 lg:w-[19rem] xl:-left-20">
            <HeroToolDock live={mode === 'live'} />
          </div>
          <p className="pointer-events-none absolute top-5 right-5 z-10 hidden items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 font-body text-xs text-flv-muted shadow-sm backdrop-blur [@media(pointer:fine)]:lg:inline-flex">
            <MousePointer2 aria-hidden className="size-3.5" />
            {hero.drag}
          </p>
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- steps */

const STEP_ICONS = [PenTool, Rotate3d, Users] as const

export function LandingSteps() {
  const steps = C.steps

  return (
    <section id="flow" aria-labelledby="flow-title" className="flv-section scroll-mt-24 px-4 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto flex max-w-7xl flex-col gap-14">
        <SectionHeading id="flow-title" eyebrow={steps.eyebrow} title={steps.title} lead={steps.lead} />
        <ol className="relative grid gap-6 md:grid-cols-3">
          <span aria-hidden className="flv-thread pointer-events-none absolute top-11 right-[16%] left-[16%] hidden h-px md:block" />
          {steps.items.map((step, index) => {
            const Icon = STEP_ICONS[index]!
            return (
              <li key={step.number} className="flv-reveal flv-panel relative flex flex-col gap-4 p-7">
                <div className="flex items-center gap-4">
                  <span className="relative inline-flex size-14 items-center justify-center rounded-2xl bg-flv-ink text-white shadow-lg">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <span className="font-display text-sm tracking-[0.2em] text-flv-muted">
                    {step.number} · {step.name}
                  </span>
                </div>
                <h3 className="font-display text-2xl leading-tight text-flv-ink">{step.title}</h3>
                <p className="font-body text-base text-flv-muted">{step.body}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- features */

function WordsMock() {
  return (
    <div className="flv-mock relative flex h-full items-center justify-center rounded-xl bg-flv-soft">
      <div className="relative rounded-md border-2 border-dashed border-flv-accent/60 px-5 py-2">
        <span className="font-[Cormorant_Garamond] text-4xl font-semibold text-flv-ink italic">Maison</span>
        {['-top-1.5 -left-1.5', '-top-1.5 -right-1.5', '-bottom-1.5 -left-1.5', '-right-1.5 -bottom-1.5'].map((spot) => (
          <span key={spot} className={cn('absolute size-3 rounded-sm border-2 border-flv-accent bg-white', spot)} />
        ))}
      </div>
      <span className="absolute bottom-3 left-3 rounded-full bg-white px-2 py-1 font-body text-[0.65rem] text-flv-muted shadow-sm">
        x 0.50 · y 0.32 · 120%
      </span>
    </div>
  )
}

function GraphicsMock() {
  return (
    <div className="flv-mock grid h-full grid-cols-3 gap-2 rounded-xl bg-flv-soft p-3">
      {['cross-gothic', 'flame-rise', 'logo-crown', 'cross-flare', 'flame-burst', 'shape-stripe'].map((id, index) => (
        <span
          key={id}
          className={cn('flex items-center justify-center rounded-lg border bg-white p-2', {
            'border-flv-accent ring-2 ring-flv-accent/30': index === 0,
            'border-flv-line': index !== 0,
          })}
        >
          <img src={`/graphics/${id}.svg`} alt="" width={40} height={40} loading="lazy" className="size-9 object-contain" />
        </span>
      ))}
    </div>
  )
}

function LayersMock() {
  const rows = [
    { name: 'Maison', icon: Type, locked: false, active: true },
    { name: 'Cross', icon: Sparkles, locked: true, active: false },
    { name: 'Sketch', icon: PenTool, locked: false, active: false },
  ]

  return (
    <ul className="flv-mock flex h-full flex-col justify-center gap-2 rounded-xl bg-flv-soft p-4">
      {rows.map((row, index) => (
        <li
          key={row.name}
          className={cn(
            'flv-layer flex items-center gap-3 rounded-lg border bg-white px-3 py-2 font-body text-sm',
            `flv-layer-${index + 1}`,
            { 'border-flv-accent text-flv-ink': row.active, 'border-flv-line text-flv-muted': !row.active },
          )}
        >
          <row.icon aria-hidden className="size-4" />
          <span className="flex-1">{row.name}</span>
          {row.locked ? <Lock aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
        </li>
      ))}
    </ul>
  )
}

function LiveMock() {
  return (
    <div className="flv-mock relative h-full overflow-hidden rounded-xl bg-gradient-to-b from-white to-flv-soft">
      <img
        src={HERO_POSTER.src(480)}
        alt=""
        width={480}
        height={480}
        loading="lazy"
        className="absolute inset-x-0 -bottom-6 mx-auto h-[115%] w-auto object-contain"
      />
      <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 font-body text-[0.65rem] text-flv-muted shadow-sm">
        <Rotate3d aria-hidden className="size-3" /> Front · Back · Sleeves
      </span>
    </div>
  )
}

const FEATURE_MOCKS: Record<string, () => ReactNode> = {
  words: WordsMock,
  graphics: GraphicsMock,
  layers: LayersMock,
  live: LiveMock,
}

const FEATURE_ICONS = { words: Type, graphics: Sparkles, layers: Layers, live: Rotate3d } as const

export function LandingFeatures() {
  const features = C.features

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="flv-section scroll-mt-24 bg-flv-ink px-4 py-24 text-white sm:px-8 lg:px-10 lg:py-32"
    >
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
          <Eyebrow className="text-flv-flare">{features.eyebrow}</Eyebrow>
          <h2 id="features-title" className="font-display text-4xl leading-[1.02] text-balance sm:text-5xl lg:text-6xl">
            {features.title}
            <span className="flv-text-gradient block">{features.titleAccent}</span>
          </h2>
          <p className="max-w-md font-body text-lg text-white/70">{features.lead}</p>
        </div>
        {/* On a phone the cards scroll sideways, so the rail takes keyboard focus. */}
        <ul
          tabIndex={0}
          aria-label={features.eyebrow}
          className="flv-rail -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0">
          {features.items.map((feature) => {
            const Mock = FEATURE_MOCKS[feature.id]!
            const Icon = FEATURE_ICONS[feature.id]
            return (
              <li
                key={feature.id}
                data-claim={feature.claim}
                className="flv-reveal flv-feature group flex w-[82%] shrink-0 snap-center flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:w-auto"
              >
                <div className="aspect-[4/3] w-full text-flv-ink">
                  <Mock />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-2 font-body text-xs tracking-[0.18em] text-white/60 uppercase">
                      <Icon aria-hidden className="size-4 text-flv-flare" />
                      {feature.name}
                    </p>
                    {feature.claim === 'concept' ? <ConceptPreviewBadge /> : null}
                  </div>
                  <h3 className="font-display text-2xl leading-tight">{feature.title}</h3>
                  <p className="font-body text-base text-white/70">{feature.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ vote */

export function LandingVote({ mode }: { mode: LandingMode }) {
  const vote = C.vote
  const [voted, setVoted] = useState(false)

  return (
    <section id="vote" aria-labelledby="vote-title" className="flv-section scroll-mt-24 px-4 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionHeading id="vote-title" eyebrow={vote.eyebrow} title={vote.title} accent={vote.titleAccent} />
          <p className="max-w-xl font-body text-lg text-pretty text-flv-muted">{vote.body}</p>
          <ul className="flex flex-col gap-3 font-body text-base text-flv-ink">
            {vote.points.map((point, index) => {
              const Icon = [Share2, Eye, Vote][index]!
              return (
                <li key={point} className="inline-flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-flv-soft text-flv-accent">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  {point}
                </li>
              )
            })}
          </ul>
          <p className="font-body text-sm text-flv-muted">{vote.fine}</p>
        </div>

        <figure className="flv-reveal relative mx-auto w-full max-w-md">
          <div aria-hidden className="flv-halo pointer-events-none absolute -inset-8 -z-10 rounded-full" />
          <div className="flv-share-card flv-panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-flv-line px-4 py-3">
              <span className="size-2.5 rounded-full bg-flv-line" />
              <span className="size-2.5 rounded-full bg-flv-line" />
              <span className="size-2.5 rounded-full bg-flv-line" />
              <span className="ml-2 truncate rounded-full bg-flv-soft px-3 py-1 font-body text-[0.7rem] text-flv-muted">
                fashionleadervote.com/s/your-design
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 bg-flv-soft/60 p-4">
              {['Front', 'Three-quarter', 'Back'].map((label, index) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-flv-line bg-white">
                    <img
                      src={HERO_POSTER.src(480)}
                      alt=""
                      width={480}
                      height={480}
                      loading="lazy"
                      className={cn('absolute inset-0 size-full object-contain', {
                        'scale-x-[-1] opacity-80': index === 2,
                        'opacity-90': index === 1,
                      })}
                    />
                  </div>
                  <span className="font-body text-[0.6rem] tracking-[0.08em] text-flv-muted uppercase">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-display text-xl text-flv-ink">{vote.cardTitle}</p>
                <p className="font-body text-xs text-flv-muted">{vote.cardByline}</p>
              </div>
              {mode === 'live' ? (
                <button
                  type="button"
                  aria-pressed={voted}
                  onClick={() => setVoted((current) => !current)}
                  className={cn('inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-body text-sm font-medium transition', {
                    'flv-cta': !voted,
                    'border border-flv-accent bg-white text-flv-accent': voted,
                  })}
                >
                  <Vote aria-hidden className="size-4" />
                  {voted ? 'Voted' : vote.cardVote}
                </button>
              ) : (
                <span className="flv-cta inline-flex min-h-11 items-center gap-2 px-5 font-body text-sm font-medium">
                  <Vote aria-hidden className="size-4" />
                  {vote.cardVote}
                </span>
              )}
            </div>
          </div>
          <figcaption className="mt-3 text-center font-body text-xs tracking-[0.14em] text-flv-muted uppercase">
            {vote.cardLabel}
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- alpha */

const ALPHA_ICONS = [ShieldCheck, KeyRound, Trash2, Store] as const

export function LandingAlpha() {
  const alpha = C.alpha

  return (
    <section id="alpha" aria-labelledby="alpha-title" className="flv-section scroll-mt-24 border-y border-flv-line bg-white px-4 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <Eyebrow>{alpha.eyebrow}</Eyebrow>
          <h2 id="alpha-title" className="font-display text-3xl text-flv-ink sm:text-4xl">
            {alpha.title}
          </h2>
        </div>
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {alpha.items.map((item, index) => {
            const Icon = ALPHA_ICONS[index]!
            return (
              <li key={item.title} className="flv-reveal flex flex-col gap-3">
                <Icon aria-hidden className="size-7 stroke-[1.5] text-flv-accent" />
                <p className="font-body text-base text-flv-muted">
                  <strong className="font-medium text-flv-ink">{item.title}</strong> {item.body}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- faq */

export function LandingFaq() {
  const faq = C.faq

  return (
    <section id="faq" aria-labelledby="faq-title" className="flv-section scroll-mt-24 px-4 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>{faq.eyebrow}</Eyebrow>
          <h2 id="faq-title" className="font-display text-4xl text-flv-ink sm:text-5xl">
            {faq.title}
          </h2>
        </div>
        <div className="flex flex-col divide-y divide-flv-line border-y border-flv-line">
          {faq.items.map((item) => (
            <details key={item.question} className="flv-faq group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 font-display text-lg text-flv-ink marker:hidden sm:text-xl">
                {item.question}
                <span
                  aria-hidden
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-flv-line text-flv-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 font-body text-base text-pretty text-flv-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- final cta */

function WaitlistForm({ mode }: { mode: LandingMode }) {
  const final = C.final
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle')
  const live = mode === 'live'

  // One live region for both outcomes; once joined, the form gives way to it.
  const message = status === 'joined' ? HOUSE_COPY.joined : status === 'error' ? HOUSE_COPY.waitlistFailed : ''

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      {status === 'joined' ? null : (
        <form
          className="flex w-full flex-col gap-3 sm:flex-row"
          method="post"
          action="/api/waitlist"
          onSubmit={(event) => {
            event.preventDefault()
            setStatus('joining')
            void fetch('/api/waitlist', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email }),
            })
              .then((response) => setStatus(response.ok ? 'joined' : 'error'))
              .catch(() => setStatus('error'))
          }}
        >
          <label className="flex-1">
            <span className="sr-only">{final.waitlistField}</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              disabled={!live}
              placeholder={final.waitlistPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 w-full rounded-full border border-white/20 bg-white/10 px-5 font-body text-base text-white placeholder:text-white/50 focus:border-white focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={!live || status === 'joining'}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 px-5 font-body text-sm font-medium text-white hover:bg-white hover:text-flv-ink disabled:opacity-60"
          >
            {status === 'joining' ? HOUSE_COPY.joining : final.waitlistButton}
          </button>
        </form>
      )}
      <p role="status" className="font-body text-sm text-white/80 empty:hidden">
        {message}
      </p>
    </div>
  )
}

export function LandingFinalCta({ mode }: { mode: LandingMode }) {
  const final = C.final

  return (
    <section aria-labelledby="final-title" className="px-4 pb-6 sm:px-8 lg:px-10">
      <div className="flv-final relative isolate mx-auto flex max-w-7xl flex-col items-center gap-8 overflow-hidden rounded-[2rem] bg-flv-ink px-6 py-20 text-center text-white sm:py-28">
        <div aria-hidden className="flv-final-glow pointer-events-none absolute inset-0 -z-10" />
        <h2 id="final-title" className="font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.03em] text-balance">
          {final.title}
          <span className="flv-text-gradient block">{final.titleAccent}</span>
        </h2>
        <div className="flex flex-col items-center gap-3">
          <CreateCta mode={mode}>{final.cta}</CreateCta>
          <p className="font-body text-sm text-white/70">{final.note}</p>
        </div>
        <div id="waitlist" className="mt-6 flex w-full scroll-mt-24 flex-col items-center gap-3 border-t border-white/10 pt-10">
          <p className="font-display text-lg">{final.waitlistLabel}</p>
          <p className="max-w-md font-body text-sm text-white/70">{final.waitlistLead}</p>
          <WaitlistForm mode={mode} />
        </div>
      </div>
    </section>
  )
}

/** Everything below the hero, in reading order. */
export function LandingBody({ mode }: { mode: LandingMode }) {
  return (
    <>
      <LandingSteps />
      <LandingFeatures />
      <LandingVote mode={mode} />
      <LandingAlpha />
      <LandingFaq />
      <LandingFinalCta mode={mode} />
    </>
  )
}
