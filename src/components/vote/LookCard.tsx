import { Link } from '@tanstack/react-router'

import { cn } from '../../lib/cn'
import type { Design } from '../../lib/design-schema'
import { HOUSE_COPY } from '../../lib/house-copy'
import { lookRecipe } from '../../lib/look-recipe'
import { isSafeThumbnail } from '../../lib/look-thumbnail'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'

export function LookCard({
  design,
  isLeader = false,
  isEntered = false,
  voting = false,
  featured = false,
  onVote,
}: {
  design: Design
  isLeader?: boolean
  isEntered?: boolean
  voting?: boolean
  featured?: boolean
  onVote?: ({ id }: { id: string }) => void
}) {
  return (
    <article
      className={cn('flv-panel flex flex-col gap-4 p-4', {
        'border-flv-accent': isLeader || featured,
        'border-flv-accent/70': isEntered && !isLeader && !featured,
      })}
    >
      <Link
        to="/look/$lookId"
        params={{ lookId: design.id }}
        className="flex flex-col gap-3"
      >
        <div className="relative overflow-hidden rounded-xl border border-flv-line bg-flv-soft">
          {isSafeThumbnail({
            thumbnailDataUrl: design.thumbnailDataUrl,
          }) ? (
            <img
              alt=""
              src={design.thumbnailDataUrl}
              className="aspect-[4/5] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center font-body text-sm text-flv-muted">
              {HOUSE_COPY.openingStill}
            </div>
          )}
          {isLeader ? (
            <p
              className={cn(
                'absolute top-3 left-3 rounded-full border border-flv-accent bg-flv-paper px-3 py-1',
                chromeKickerClass(),
              )}
            >
              {HOUSE_COPY.leader}
            </p>
          ) : null}
          {isEntered && !isLeader ? (
            <p className="absolute top-3 left-3 rounded-full border border-flv-line bg-flv-paper px-3 py-1 font-body text-xs tracking-[0.08em] text-flv-ink uppercase">
              {HOUSE_COPY.justEntered}
            </p>
          ) : null}
        </div>
        <h2 className="font-display text-2xl text-flv-ink">{design.title}</h2>
        {design.tags && design.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {design.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-flv-line px-2 py-1 font-body text-xs tracking-[0.08em] text-flv-muted uppercase"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <p className="line-clamp-2 font-body text-sm text-flv-muted">
          {lookRecipe({ design })}
        </p>
        <p className="font-body text-sm text-flv-muted">
          {HOUSE_COPY.by} {design.author}
        </p>
      </Link>
      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-flv-muted', chromeTextClass())}>
          {design.votes}{' '}
          {design.votes === 1 ? HOUSE_COPY.voteOne : HOUSE_COPY.votes}
        </p>
        <button
          type="button"
          disabled={voting}
          onClick={() => {
            onVote?.({ id: design.id })
          }}
          className={cn(
            'min-h-11 border border-flv-accent px-4 py-2 text-flv-accent hover:bg-flv-soft disabled:opacity-50',
            chromeTextClass(),
          )}
        >
          {voting ? HOUSE_COPY.voting : HOUSE_COPY.vote}
        </button>
      </div>
    </article>
  )
}
