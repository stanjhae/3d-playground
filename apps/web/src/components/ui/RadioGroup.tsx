import { type HTMLAttributes, type KeyboardEvent, useLayoutEffect, useRef } from 'react'

import { nextRadioIndex, radioTabStop } from '../../lib/radio-keys'

function enabledRadios(group: HTMLElement) {
  return [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')]
}

function onRadioKeyDown(event: KeyboardEvent<HTMLElement>) {
  const radios = enabledRadios(event.currentTarget)
  const next = nextRadioIndex({
    key: event.key,
    current: radios.indexOf(document.activeElement as HTMLButtonElement),
    count: radios.length,
  })

  if (next === null) {
    return
  }

  event.preventDefault()
  radios[next]!.focus()
  // As with native radios, moving the selection is choosing.
  radios[next]!.click()
}

/**
 * A `role="radiogroup"` that behaves like one: Tab reaches the checked
 * radio, and the arrow keys move the choice.
 */
export function RadioGroup({
  as: Tag = 'div',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'nav' }) {
  const group = useRef<HTMLElement | null>(null)

  // Every render: which radio is checked or enabled can change with any of them.
  useLayoutEffect(() => {
    if (!group.current) {
      return
    }

    const radios = enabledRadios(group.current)
    const stop = radioTabStop({ checked: radios.map((radio) => radio.getAttribute('aria-checked') === 'true') })
    radios.forEach((radio, index) => {
      radio.tabIndex = index === stop ? 0 : -1
    })
  })

  return (
    <Tag
      {...props}
      ref={(element: HTMLElement | null) => {
        group.current = element
      }}
      role="radiogroup"
      onKeyDown={onRadioKeyDown}
    >
      {children}
    </Tag>
  )
}
