
export function nextBoardLoadId({
  current,
}: {
  current: number
}) {
  return current + 1
}

export function isLiveBoardLoad({
  loadId,
  current,
}: {
  loadId: number
  current: number
}) {
  return loadId === current
}
