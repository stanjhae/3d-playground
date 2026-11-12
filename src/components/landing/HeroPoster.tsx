import { cn } from '../../lib/cn'
import { LANDING_COPY } from '../../lib/landing-copy'

/** Baked by `pnpm poster` (scripts/bake-landing-poster.mjs) from the live scene. */
export const HERO_POSTER = {
  widths: [480, 800, 1200] as const,
  width: 1200,
  height: 1200,
  src: (width: number) => `/landing/hero-tee-${width}.webp`,
  sizes: '(min-width: 1024px) 36rem, 92vw',
}

export function heroPosterSrcSet() {
  return HERO_POSTER.widths.map((width) => `${HERO_POSTER.src(width)} ${width}w`).join(', ')
}

/** The hero's largest image, identical in the prerendered page and the app. */
export function HeroPoster({ className }: { className?: string }) {
  return (
    <img
      src={HERO_POSTER.src(800)}
      srcSet={heroPosterSrcSet()}
      sizes={HERO_POSTER.sizes}
      width={HERO_POSTER.width}
      height={HERO_POSTER.height}
      alt={LANDING_COPY.hero.posterAlt}
      fetchPriority="high"
      decoding="async"
      className={cn('absolute inset-0 size-full object-cover select-none', className)}
      draggable={false}
    />
  )
}
