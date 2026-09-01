export function cn(
  ...parts: Array<string | false | null | undefined | Record<string, boolean>>
) {
  return parts
    .flatMap((part) => {
      if (!part) {
        return []
      }

      if (typeof part === 'string') {
        return [part]
      }

      return Object.entries(part)
        .filter(([, on]) => on)
        .map(([name]) => name)
    })
    .join(' ')
}
