import { INK_COLORS } from '../../lib/paint-colors'
import { chromeMutedClass } from '../../lib/studio-chrome'
import { Swatch } from '../ui/Swatch'

/**
 * The two colours of a stripe or check fill (writer W): the ground, then
 * the stripes or squares, from the studio's inks.
 */
export function FillColours({
  colors,
  inkLabel,
  disabled = false,
  onChange,
}: {
  colors: [string, string]
  inkLabel: string
  disabled?: boolean
  onChange: ({ colors }: { colors: [string, string] }) => void
}) {
  const rows = [
    { label: 'Ground', index: 0 },
    { label: inkLabel, index: 1 },
  ] as const

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} role="group" aria-label={`${row.label} colour`} className="flex flex-col gap-1">
          <span className={chromeMutedClass()}>{row.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {INK_COLORS.map((ink) => (
              <Swatch
                key={ink.id}
                name={`${row.label} ${ink.name}`}
                color={ink.value}
                className="size-8"
                disabled={disabled}
                selected={colors[row.index].toLowerCase() === ink.value.toLowerCase()}
                onClick={() => {
                  const next: [string, string] = [colors[0], colors[1]]
                  next[row.index] = ink.value
                  onChange({ colors: next })
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
