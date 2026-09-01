import { Link } from '@tanstack/react-router'

import type { Design } from '../../lib/design-schema'
import { lookRecipe } from '../../lib/look-recipe'
import { isSafeThumbnail } from '../../lib/look-thumbnail'

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
      className={
        isLeader || featured
          ? 'flex flex-col gap-4 border border-brass bg-atelier-raised p-4'
          : isEntered
            ? 'flex flex-col gap-4 border border-brass/70 bg-atelier-raised p-4'
            : 'flex flex-col gap-4 border border-atelier-line bg-atelier-raised p-4'
      }
    >
      <Link
        to="/look/$lookId"
        params={{ lookId: design.id }}
        className="flex flex-col gap-3"
      >
        <div className="relative overflow-hidden border border-atelier-line bg-atelier">
          {isSafeThumbnail({
            thumbnailDataUrl: design.thumbnailDataUrl,
          }) ? (
            <img
              alt=""
              src={design.thumbnailDataUrl}
              className="aspect-[4/5] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center text-sm text-ivory-muted">
              Opening the still
            </div>
          )}
          {isLeader ? (
            <p className="absolute top-3 left-3 border border-brass bg-atelier px-3 py-1 font-display text-xs tracking-[0.22em] text-brass uppercase">
              Leader
            </p>
          ) : null}
          {isEntered && !isLeader ? (
            <p className="absolute top-3 left-3 border border-atelier-line bg-atelier px-3 py-1 font-display text-xs tracking-[0.22em] text-ivory uppercase">
              Just entered
            </p>
          ) : null}
        </div>
        <h2 className="font-display text-2xl text-ivory">{design.title}</h2>
        <p className="text-sm text-ivory-muted">{lookRecipe({ design })}</p>
        <p className="text-sm text-ivory-muted">By {design.author}</p>
      </Link>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-xs tracking-[0.18em] text-ivory-muted uppercase">
          {design.votes} {design.votes === 1 ? 'vote' : 'votes'}
        </p>
        <button
          type="button"
          disabled={voting}
          onClick={() => {
            onVote?.({ id: design.id })
          }}
          className="min-h-11 border border-brass px-4 py-2 font-display text-xs tracking-[0.18em] text-brass uppercase hover:bg-atelier disabled:opacity-50"
        >
          {voting ? 'Voting' : 'Vote'}
        </button>
      </div>
    </article>
  )
}
