import type { Design } from './design-schema'

export function rankDesigns({ designs }: { designs: Design[] }): Design[] {
  return [...designs].sort((left, right) => {
    if (right.votes !== left.votes) {
      return right.votes - left.votes
    }

    return left.title.localeCompare(right.title)
  })
}
