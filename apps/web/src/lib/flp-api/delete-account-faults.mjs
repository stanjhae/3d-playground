// Fault injection for delete-account.integration.test.ts (A07 #151),
// preloaded with `node --import`, so scripts/delete-account.mjs runs
// unedited. FLP_FAIL_AT picks the interruption:
//
// - `storage-remove`: the file removal stops part-way: the first half of
//   the paths are really removed, then the call fails.
// - `account-delete`: the files go, then deleting the account fails.

const failAt = process.env.FLP_FAIL_AT
const realFetch = globalThis.fetch

const failure = (body) =>
  new Response(JSON.stringify(body), { status: 500, headers: { 'Content-Type': 'application/json' } })

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()

  if (failAt === 'storage-remove' && method === 'DELETE' && url.includes('/storage/v1/object/')) {
    const { prefixes } = JSON.parse(init.body)
    const half = prefixes.slice(0, Math.ceil(prefixes.length / 2))
    await realFetch(url, { ...init, body: JSON.stringify({ prefixes: half }) })
    return failure({ statusCode: '500', error: 'injected', message: 'injected: storage went away part-way' })
  }

  if (failAt === 'account-delete' && method === 'DELETE' && url.includes('/auth/v1/admin/users/')) {
    return failure({ code: 500, error_code: 'unexpected_failure', msg: 'injected: auth went away' })
  }

  return realFetch(input, init)
}
