export type InkColor = {
  id: string
  name: string
  value: string
}

export const INK_COLORS: readonly InkColor[] = [
  { id: 'ink', name: 'Ink', value: '#1a1c22' },
  { id: 'ivory', name: 'Ivory', value: '#f4ead4' },
  { id: 'brass', name: 'Brass', value: '#c4a15a' },
  { id: 'blush', name: 'Blush', value: '#e8c4b8' },
  { id: 'oxblood', name: 'Oxblood', value: '#6b1d2a' },
  { id: 'meadow', name: 'Meadow', value: '#6b7c4a' },
  { id: 'night', name: 'Night', value: '#111318' },
  { id: 'house', name: 'House white', value: '#f7f3ea' },
]

export const INK_WIDTHS = [0.014, 0.024, 0.04] as const

export function getInkColor({ id }: { id: string }) {
  return INK_COLORS.find((color) => color.id === id) ?? INK_COLORS[0]
}
