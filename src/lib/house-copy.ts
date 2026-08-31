export const HOUSE_COPY = {
  lookGone: 'That look has left the house.',
  lookFailed: 'The look could not open.',
  boardFailed: 'The board could not open.',
  boardLoading: 'The house is setting the board.',
  lookLoading: 'Opening the look.',
  entered: 'Entered the vote',
  entering: 'Entering the vote',
  enter: 'Enter the Vote',
  studioOpen: 'The studio is open.',
  voteFailed: 'The vote could not be counted.',
  copyFailed: 'The link could not be copied. Use the address bar.',
  publishFailed: 'The look could not enter the vote.',
  boardFull: 'The house is full tonight.',
  boardPersistFailed: 'The look could not be kept. Try again.',
} as const

export function remixCaption({ title }: { title: string }) {
  return `Remixing ${title}`
}
