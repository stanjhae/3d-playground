import type { ImportNote } from './legacy-import'

/**
 * What a legacy import changed, for the person (F06 #141): one line per
 * kind of change with a count, most frequent first.
 */
export function importNoticeLines({ notes, max = 5 }: { notes: ImportNote[]; max?: number }) {
  const counts = new Map<string, number>()

  for (const note of notes) {
    counts.set(note.message, (counts.get(note.message) ?? 0) + 1)
  }

  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([message, count]) => (count > 1 ? `${message} (×${count})` : message))

  return lines.length > max
    ? [...lines.slice(0, max), `and ${lines.length - max} more kinds of change`]
    : lines
}
