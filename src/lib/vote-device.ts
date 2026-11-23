const KEY = 'flv:vote-device'
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An id this browser keeps so a vote can be tied to the browser, not the person. */
export function voteDeviceId({
  storage,
  createId = () => crypto.randomUUID(),
}: {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  createId?: () => string
}) {
  const existing = storage?.getItem(KEY)

  if (existing && DEVICE_ID.test(existing)) {
    return existing
  }

  const id = createId()
  storage?.setItem(KEY, id)
  return id
}
