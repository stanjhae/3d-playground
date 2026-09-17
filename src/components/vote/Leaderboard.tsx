import { Link } from '@tanstack/react-router'

import { cn } from '../../lib/cn'
import type { Design } from '../../lib/design-schema'
import { HOUSE_COPY } from '../../lib/house-copy'
import { chromeKickerClass, chromeTextClass } from '../../lib/studio-chrome'

export function Leaderboard({
  looks,
  compact = false,
}: {
  looks: Design[]
  compact?: boolean
}) {
  return (
    <aside
      className={cn('border border-atelier-line bg-atelier-raised', {
        'flex flex-col gap-3 overflow-x-auto p-3': compact,
        'flex flex-col gap-4 p-5': !compact,
      })}
    >
      <p className={chromeKickerClass()}>{HOUSE_COPY.theHouse}</p>
      <ol
        className={cn({
          'flex flex-row gap-4': compact,
          'flex flex-col gap-3': !compact,
        })}
      >
        {looks.map((look, index) => (
          <li key={look.id} className={cn({ 'shrink-0': compact })}>
            <Link
              to="/look/$lookId"
              params={{ lookId: look.id }}
              className="flex items-baseline justify-between gap-3 hover:text-brass"
            >
              <span className="font-body text-sm text-ivory">
                <span
                  className={cn('mr-2 text-brass', chromeTextClass())}
                >
                  {index === 0 ? HOUSE_COPY.leader : `#${index + 1}`}
                </span>
                {look.title}
              </span>
              <span className="font-body text-xs text-ivory-muted">
                {look.votes}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  )
}
