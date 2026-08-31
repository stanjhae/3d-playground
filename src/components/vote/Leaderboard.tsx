import { Link } from '@tanstack/react-router'

import type { Design } from '../../lib/design-schema'

export function Leaderboard({ looks }: { looks: Design[] }) {
  return (
    <aside className="flex flex-col gap-4 border border-atelier-line bg-atelier-raised p-5">
      <p className="font-display text-xs tracking-[0.28em] text-brass uppercase">
        Leaderboard
      </p>
      <ol className="flex flex-col gap-3">
        {looks.map((look, index) => (
          <li key={look.id}>
            <Link
              to="/look/$lookId"
              params={{ lookId: look.id }}
              className="flex items-baseline justify-between gap-3 hover:text-brass"
            >
              <span className="text-sm text-ivory">
                <span className="mr-2 font-display text-xs tracking-[0.16em] text-brass uppercase">
                  {index === 0 ? 'Leader' : `#${index + 1}`}
                </span>
                {look.title}
              </span>
              <span className="text-xs text-ivory-muted">{look.votes}</span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  )
}
