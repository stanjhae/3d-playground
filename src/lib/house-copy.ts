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
  gownCredit: 'Gown by Style3D CG',
  gownLicense: 'CC BY 4.0',
} as const

export const GOWN_CREDIT_HREF =
  'https://sketchfab.com/3d-models/white-evening-gown-dress-1f77c65b1542428f89b10f538b771ce4'
export const GOWN_LICENSE_HREF = 'https://creativecommons.org/licenses/by/4.0/'

export function remixCaption({ title }: { title: string }) {
  return `Remixing ${title}`
}
