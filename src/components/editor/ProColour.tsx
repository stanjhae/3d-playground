import { Pipette } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { cn } from '../../lib/cn'
import { eyeDropper, normalizeHex, pickScreenColour, useRecentColours } from '../../lib/colour-input'
import { chromeMutedClass, chromeTextClass } from '../../lib/studio-chrome'

/**
 * Pro colour entry (A5): a full picker, hex, the eyedropper and recent
 * colours. `onChange` gets `#rrggbb`; every colour chosen here becomes a recent.
 */
export function ProColour({
  label,
  value,
  onChange,
}: {
  /** What the colour is for, e.g. "Brush colour". */
  label: string
  value: string
  onChange: ({ color }: { color: string }) => void
}) {
  const current = normalizeHex({ text: value }) ?? '#000000'
  const [text, setText] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const recents = useRecentColours((state) => state.recents)
  const rememberColour = useRecentColours((state) => state.use)
  const errorId = useId()
  const canDrop = eyeDropper() !== null

  useEffect(() => {
    setText(current)
    setError(null)
  }, [current])

  function choose({ color }: { color: string }) {
    setError(null)
    rememberColour({ color })

    if (color !== current) {
      onChange({ color })
    }
  }

  function commitText() {
    const hex = normalizeHex({ text })

    if (!hex) {
      setError('Enter a hex colour, like #c4a15a.')
      return
    }

    setText(hex)
    choose({ color: hex })
  }

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <input
          type="color"
          aria-label={`${label}: picker`}
          value={current}
          // Fires while dragging in the picker; commit once it closes.
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => choose({ color: event.target.value })}
          className="size-11 shrink-0 cursor-pointer border border-flv-line bg-transparent p-0.5"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            autoComplete="off"
            aria-label={`${label}: hex`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitText()
              }

              if (event.key === 'Escape') {
                setText(current)
                setError(null)
              }
            }}
            className={cn('min-h-11 w-full border bg-white px-2 font-mono text-sm text-flv-ink', {
              'border-flv-accent': Boolean(error),
              'border-flv-line': !error,
            })}
          />
          {error ? (
            <span id={errorId} className="font-body text-xs text-flv-accent">
              {error}
            </span>
          ) : null}
        </span>
        {canDrop ? (
          <button
            type="button"
            aria-label={`${label}: pick from screen`}
            title="Pick a colour from the screen"
            onClick={async () => {
              const picked = await pickScreenColour()

              if (picked) {
                setText(picked)
                choose({ color: picked })
              }
            }}
            className="grid size-11 shrink-0 place-items-center border border-flv-line text-flv-muted hover:text-flv-accent"
          >
            <Pipette aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      {recents.length ? (
        <div className="flex flex-col gap-1">
          <span className={chromeMutedClass()}>Recent</span>
          <ul className="flex flex-wrap gap-1.5">
            {recents.map((color) => (
              <li key={color}>
                <button
                  type="button"
                  aria-label={`Recent colour ${color}`}
                  aria-pressed={color === current}
                  onClick={() => choose({ color })}
                  className={cn('size-8 border', chromeTextClass(), {
                    'border-flv-accent': color === current,
                    'border-flv-line': color !== current,
                  })}
                  style={{ backgroundColor: color }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
