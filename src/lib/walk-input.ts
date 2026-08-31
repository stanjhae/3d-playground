type TypingCandidate = {
  tagName?: string
  isContentEditable?: boolean
} | null

export function isTypingTarget({ target }: { target: TypingCandidate }) {
  if (!target) {
    return false
  }

  const tagName = target.tagName?.toLowerCase()

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    target.isContentEditable === true
  )
}
