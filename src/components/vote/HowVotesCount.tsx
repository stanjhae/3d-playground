import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The vote rules, folded away under one line on Vote and Ranking, so each
 * page opens with a short intro rather than a paragraph of rules.
 */
export function HowVotesCount({ children }: { children: ReactNode }) {
  return (
    <details data-testid="how-votes-count" className="group max-w-2xl font-body text-sm text-flv-muted">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 hover:text-flv-accent marker:hidden [&::-webkit-details-marker]:hidden">
        <Info aria-hidden className="size-4" />
        <span className="underline underline-offset-2">How votes count</span>
      </summary>
      <ul className="mt-1 flex list-disc flex-col gap-1.5 border-l border-flv-line py-1 pr-2 pl-7">{children}</ul>
    </details>
  )
}
