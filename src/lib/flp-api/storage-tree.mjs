/**
 * Every file under a prefix in the `design-assets` bucket. Supabase lists
 * one level at a time; folders have no id. Shared by the cleanup and
 * account-deletion scripts (A07 #151) and the API's own account deletion (P1).
 */
export async function listFilesUnder({ admin, bucket = 'design-assets', prefix }) {
  const files = []
  const pending = [prefix]

  while (pending.length > 0) {
    const folder = pending.pop()
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })

    if (error) {
      throw new Error(`listing ${folder || '/'} failed: ${error.message}`)
    }

    for (const entry of data ?? []) {
      const path = folder ? `${folder}/${entry.name}` : entry.name
      if (entry.id) files.push(path)
      else pending.push(path)
    }
  }

  return files
}

export async function removeFiles({ admin, bucket = 'design-assets', files }) {
  // The storage API removes at most 1000 paths per call.
  for (let start = 0; start < files.length; start += 1000) {
    const { error } = await admin.storage.from(bucket).remove(files.slice(start, start + 1000))
    if (error) throw new Error(`removing files failed: ${error.message}`)
  }
}
