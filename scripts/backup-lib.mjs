import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Backup and restore rehearsal for the local Supabase stack (Q09 #194).
 * Shared by `backup.mjs`, `restore-check.mjs` and the integration test.
 *
 * The database is dumped with `pg_dump` inside the running Postgres
 * container. Storage is backed up separately, object by object: the dump
 * holds `storage.objects` rows, never the bytes.
 */

export const MANIFEST_FORMAT = 'flp-backup/1'
export const RESTORE_DATABASE = 'flp_restore'
export const PUBLIC_RENDER_KINDS = ['view_front', 'view_three_quarter', 'view_back']

const DB_USER = process.env.FLP_DB_USER ?? 'supabase_admin'
const CONCURRENCY = 8
const END = '__FLP_END__'

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let bytes = 0
    createReadStream(file)
      .on('data', (chunk) => {
        hash.update(chunk)
        bytes += chunk.length
      })
      .on('error', reject)
      .on('end', () => resolve({ sha256: hash.digest('hex'), bytes }))
  })
}

function normalizeCanonical(value) {
  if (typeof value === 'string') return value.normalize('NFC')
  if (typeof value === 'number') {
    const rounded = Math.round(value * 1e6) / 1e6
    return Object.is(rounded, -0) ? 0 : rounded
  }
  if (Array.isArray(value)) return value.map(normalizeCanonical)
  if (typeof value === 'object' && value !== null) {
    const next = {}
    for (const key of Object.keys(value).sort()) next[key] = normalizeCanonical(value[key])
    return next
  }
  return value
}

/**
 * `design_versions.content_hash` recomputed from stored content; mirrors
 * `src/lib/canonical-hash.ts` (a unit test keeps the two equal).
 */
export function canonicalContentHash(content) {
  return `sha256:${sha256Hex(JSON.stringify(normalizeCanonical(content)))}`
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

function run(command, args, { input, inputFile, stdoutFile } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const out = []
    let stderr = ''
    let sink = null

    if (stdoutFile) {
      sink = createWriteStream(stdoutFile)
      child.stdout.pipe(sink)
    } else {
      child.stdout.on('data', (chunk) => out.push(chunk))
    }
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const finish = () => resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr })
      if (sink) sink.close(finish)
      else finish()
    })

    if (inputFile) createReadStream(inputFile).on('error', reject).pipe(child.stdin)
    else child.stdin.end(input ?? '')
  })
}

async function mustRun(command, args, options) {
  const result = await run(command, args, options)
  if (result.code !== 0) {
    throw new Error(`${command} ${args.slice(0, 4).join(' ')} … exited ${result.code}: ${result.stderr.trim()}`)
  }
  return result
}

/** The local stack's Postgres container (`supabase_db_<project>`). */
export async function findDbContainer() {
  if (process.env.FLP_DB_CONTAINER) return process.env.FLP_DB_CONTAINER
  const { stdout } = await mustRun('docker', ['ps', '--filter', 'name=^supabase_db_', '--format', '{{.Names}}'])
  const names = stdout.split('\n').filter(Boolean)
  if (names.length !== 1) {
    throw new Error(`expected one running supabase_db_* container, found ${names.length}; set FLP_DB_CONTAINER`)
  }
  return names[0]
}

const psqlArgs = ({ container, database }) => [
  'exec', '-i', container, 'psql', '-U', DB_USER, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', database,
]

export async function psql({ container, database = 'postgres', sql }) {
  return (await mustRun('docker', psqlArgs({ container, database }), { input: sql })).stdout
}

/** Rows of `select row_to_json(…)`, one JSON object per line. */
async function jsonRows({ container, database, sql }) {
  const out = await psql({ container, database, sql })
  return out.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

/** A psql session kept open, so a snapshot can be exported and reused. */
function openSession({ container, database }) {
  const child = spawn('docker', psqlArgs({ container, database }), { stdio: ['pipe', 'pipe', 'pipe'] })
  let buffer = ''
  let stderr = ''
  let pending = null

  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const at = buffer.indexOf(`${END}\n`)
    if (at >= 0 && pending) {
      const text = buffer.slice(0, at)
      buffer = buffer.slice(at + END.length + 1)
      pending.resolve(text)
      pending = null
    }
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.on('close', (code) => {
    if (pending) pending.reject(new Error(`psql session exited ${code}: ${stderr.trim()}`))
  })

  return {
    query(sql) {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
        child.stdin.write(`${sql}\n\\echo ${END}\n`)
      })
    },
    close() {
      return new Promise((resolve) => {
        child.on('close', resolve)
        child.stdin.end('\\q\n')
      })
    },
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function timer() {
  const phases = []
  const started = performance.now()
  return {
    phases,
    async phase(name, fn) {
      const at = performance.now()
      try {
        return await fn()
      } finally {
        phases.push({ name, ms: Math.round(performance.now() - at) })
      }
    },
    totalMs: () => Math.round(performance.now() - started),
  }
}

export function formatPhases({ phases, total }) {
  const width = Math.max(...phases.map((p) => p.name.length), ...total.map((t) => t.name.length))
  const line = ({ name, ms }) => `  ${name.padEnd(width)}  ${(ms / 1000).toFixed(2).padStart(8)} s`
  return [...phases.map(line), `  ${'-'.repeat(width + 12)}`, ...total.map(line)].join('\n')
}

// The storage file for one object, inside a backup folder. Object names
// are owner-scoped paths; anything that could escape the folder is refused.
function objectFile({ dir, bucket, name }) {
  const parts = [bucket, ...name.split('/')]
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`refusing unsafe storage path ${bucket}/${name}`)
  }
  return path.join(dir, 'storage', ...parts)
}

// Backup folder helpers, also used by the integration test to stage and
// corrupt a backup.
export const makeBackupDir = () => mkdtemp(path.join(tmpdir(), 'flp-backup-'))
export const removeBackupDir = (dir) => rm(dir, { recursive: true, force: true })
export const readManifest = async (dir) => JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
export const writeManifest = (dir, manifest) =>
  writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

export async function writeBackupObject({ dir, bucket, name, bytes }) {
  await writeFile(objectFile({ dir, bucket, name }), bytes)
  return { size: bytes.length, sha256: sha256Hex(bytes) }
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

// What the restored copy must match, read in the dump's own snapshot.
const COUNTS_SQL = `json_build_object(
    'users', (select count(*) from auth.users),
    'designs', (select count(*) from public.designs),
    'versions', (select count(*) from public.design_versions),
    'publications', (select count(*) from public.publications),
    'renderArtifacts', (select count(*) from public.render_artifacts),
    'assets', (select count(*) from public.assets),
    'storageObjects', (select count(*) from storage.objects)
  )`

const EXPECTATIONS_SQL = `
select json_build_object(
  'counts', ${COUNTS_SQL},
  'designIds', coalesce((select json_agg(id order by id) from public.designs), '[]'),
  'publications', coalesce((
    select json_agg(json_build_object('slug', slug, 'designId', design_id, 'status', status, 'seq', version_seq) order by slug)
    from public.publications
  ), '[]'),
  'objects', coalesce((
    select json_agg(json_build_object('bucket', bucket_id, 'name', name) order by bucket_id, name)
    from storage.objects
  ), '[]'),
  'buckets', coalesce((select json_agg(json_build_object('id', id, 'public', public) order by id) from storage.buckets), '[]')
);`

/**
 * Dumps the database and downloads every storage object into `outDir`.
 * The dump and the object list come from one exported snapshot, so the
 * manifest says exactly what the dump contains; objects are then fetched
 * through the Storage API with the secret key.
 */
export async function runBackup({ admin, container, outDir, log = () => {} }) {
  const time = timer()
  await mkdir(outDir, { recursive: true })
  const dumpFile = path.join(outDir, 'database.dump')

  const expected = await time.phase('database dump', async () => {
    const session = openSession({ container, database: 'postgres' })
    try {
      await session.query('begin isolation level repeatable read read only;')
      const snapshot = (await session.query('select pg_export_snapshot();')).trim()
      await mustRun(
        'docker',
        ['exec', container, 'pg_dump', '-U', DB_USER, '-d', 'postgres', '--format=custom', `--snapshot=${snapshot}`],
        { stdoutFile: dumpFile },
      )
      const state = JSON.parse(await session.query(EXPECTATIONS_SQL))
      await session.query('commit;')
      return state
    } finally {
      await session.close()
    }
  })
  const dump = await sha256File(dumpFile)
  log(`database: ${(dump.bytes / 1048576).toFixed(2)} MB dump, ${expected.counts.designs} design(s)`)

  const { objects, missing } = await time.phase('storage download', async () => {
    const missingObjects = []
    const saved = await mapLimit(expected.objects, CONCURRENCY, async ({ bucket, name }) => {
      const { data, error } = await admin.storage.from(bucket).download(name)
      if (error || !data) {
        // Deleted between the snapshot and the download.
        missingObjects.push({ bucket, path: name, reason: error?.message ?? 'no data' })
        return null
      }
      const bytes = Buffer.from(await data.arrayBuffer())
      const file = objectFile({ dir: outDir, bucket, name })
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, bytes)
      return { bucket, path: name, size: bytes.length, sha256: sha256Hex(bytes), contentType: data.type || null }
    })
    return { objects: saved.filter(Boolean), missing: missingObjects }
  })
  const storageBytes = objects.reduce((sum, object) => sum + object.size, 0)
  log(`storage: ${objects.length} object(s), ${(storageBytes / 1048576).toFixed(2)} MB${missing.length ? `, ${missing.length} gone before download` : ''}`)

  const manifest = {
    format: MANIFEST_FORMAT,
    createdAt: new Date().toISOString(),
    database: { file: 'database.dump', bytes: dump.bytes, sha256: dump.sha256 },
    expected: {
      counts: expected.counts,
      designIds: expected.designIds,
      publications: expected.publications,
    },
    storage: { buckets: expected.buckets, objects, missing },
    phases: time.phases,
    totalMs: time.totalMs(),
  }
  await writeManifest(outDir, manifest)
  return manifest
}

// ---------------------------------------------------------------------------
// Restore check
// ---------------------------------------------------------------------------

function collectAssetIds(value, into) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, into)
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'assetId' && typeof item === 'string') into.add(item)
      else collectAssetIds(item, into)
    }
  }
  return into
}

/**
 * Restores a backup beside the live data and verifies it:
 *   (a) every design head and version has its source content (content
 *       hash recomputed) and every uploaded image it uses;
 *   (b) every published render's bytes match `render_artifacts.sha256`;
 *   (c) publications keep their state: revoked stays revoked;
 *   (d) designs deleted before the backup do not reappear.
 *
 * The dump is restored into a separate database (`flp_restore`) in the
 * same container, dropped at the end. Objects are re-uploaded into a new
 * private bucket (never the live one) and read back, unless `upload` is
 * false, in which case the backup folder's bytes are verified instead.
 */
export async function runRestoreCheck({ admin, container, backupDir, upload = true, keep = false, log = () => {} }) {
  const time = timer()
  const issues = []
  const warnings = []
  const issue = (check, message, ids = {}) => issues.push({ check, message, ...ids })

  const manifest = await readManifest(backupDir)
  if (manifest.format !== MANIFEST_FORMAT) throw new Error(`unknown backup format ${manifest.format}`)
  for (const gone of manifest.storage.missing) {
    warnings.push(`${gone.bucket}/${gone.path}: deleted before it was downloaded (${gone.reason})`)
  }

  // Bytes by `bucket/path`, as read back from where they were restored.
  const stored = new Map()

  await time.phase('backup integrity', async () => {
    const dump = await sha256File(path.join(backupDir, manifest.database.file))
    if (dump.sha256 !== manifest.database.sha256) throw new Error('database dump does not match its manifest hash')
    await mapLimit(manifest.storage.objects, CONCURRENCY, async (object) => {
      const { sha256 } = await sha256File(objectFile({ dir: backupDir, bucket: object.bucket, name: object.path }))
      if (sha256 !== object.sha256) issue('backup', `${object.bucket}/${object.path}: file does not match its manifest hash`)
      else if (!upload) stored.set(`${object.bucket}/${object.path}`, sha256)
    })
  })

  const restoreBucket = `flp-restore-${Date.now().toString(36)}`
  let bucketCreated = false
  let restored = { designIds: new Set(), publications: new Map() }
  const verified = { versions: 0, renders: [], assets: 0 }

  try {
    await time.phase('create database', () =>
      psql({ container, sql: `drop database if exists ${RESTORE_DATABASE} with (force);\ncreate database ${RESTORE_DATABASE};` }),
    )

    await time.phase('restore database', async () => {
      const result = await run(
        'docker',
        ['exec', '-i', container, 'pg_restore', '-U', DB_USER, '-d', RESTORE_DATABASE, '--no-owner'],
        { inputFile: path.join(backupDir, manifest.database.file) },
      )
      // Supabase's platform extensions (pg_net, vault, …) are per-cluster
      // and refuse a second database. They hold no FLP data; anything that
      // does is caught by the row counts below.
      const errors = result.stderr.split('\n').filter((line) => line.startsWith('pg_restore: error:'))
      if (errors.length > 0) warnings.push(`pg_restore reported ${errors.length} error(s):\n    ${errors.join('\n    ')}`)
      if (result.code !== 0 && errors.length === 0) throw new Error(`pg_restore exited ${result.code}: ${result.stderr.trim()}`)
    })

    if (upload) {
      await time.phase('restore storage', async () => {
        const created = await admin.storage.createBucket(restoreBucket, { public: false })
        if (created.error) throw new Error(`creating ${restoreBucket} failed: ${created.error.message}`)
        bucketCreated = true
        await mapLimit(manifest.storage.objects, CONCURRENCY, async (object) => {
          const key = `${object.bucket}/${object.path}`
          const bytes = await readFile(objectFile({ dir: backupDir, bucket: object.bucket, name: object.path }))
          const put = await admin.storage
            .from(restoreBucket)
            .upload(key, bytes, { contentType: object.contentType ?? undefined, upsert: false })
          if (put.error) return issue('storage', `${key}: re-upload failed (${put.error.message})`)
          const { data, error } = await admin.storage.from(restoreBucket).download(key)
          if (error || !data) return issue('storage', `${key}: not readable after re-upload`)
          stored.set(key, sha256Hex(Buffer.from(await data.arrayBuffer())))
        })
      })
    }

    restored = await time.phase('verify', async () => {
      const db = { container, database: RESTORE_DATABASE }

      // Row counts: the restore lost nothing the snapshot had.
      const [counts] = await jsonRows({ ...db, sql: `select ${COUNTS_SQL};` })
      for (const [table, count] of Object.entries(manifest.expected.counts)) {
        if (counts[table] !== count) issue('counts', `${table}: ${counts[table]} restored, ${count} in the backup`)
      }

      // (a) Heads and versions with their content.
      const headless = await jsonRows({
        ...db,
        sql: `select row_to_json(t) from (
          select d.id from public.designs d
          left join public.design_versions v on v.design_id = d.id and v.seq = d.head_seq
          where v.seq is null) t;`,
      })
      for (const { id } of headless) issue('a', 'head version missing', { designId: id })

      const usedAssets = new Map()
      const versions = await jsonRows({
        ...db,
        sql: `select row_to_json(t) from (
          select design_id, seq, content_hash, octet_length(content::text) = content_bytes as bytes_match, content
          from public.design_versions) t;`,
      })
      for (const version of versions) {
        // content_bytes is the database's own measure (octet_length of the
        // jsonb text), so it is compared there.
        if (canonicalContentHash(version.content) !== version.content_hash || !version.bytes_match) {
          issue('a', `version ${version.seq}: content does not match its hash`, { designId: version.design_id })
          continue
        }
        for (const assetId of collectAssetIds(version.content, new Set())) {
          if (assetId.startsWith('asset_lib_')) continue
          if (!usedAssets.has(assetId)) usedAssets.set(assetId, new Set())
          usedAssets.get(assetId).add(version.design_id)
        }
        verified.versions += 1
      }

      const assets = new Map(
        (await jsonRows({
          ...db,
          sql: `select row_to_json(t) from (select id, status, sha256, storage_path from public.assets) t;`,
        })).map((row) => [row.id, row]),
      )
      for (const [assetId, designIds] of usedAssets) {
        const row = assets.get(assetId)
        const bytes = row?.storage_path ? stored.get(`design-assets/${row.storage_path}`) : undefined
        for (const designId of designIds) {
          if (row?.status !== 'ready') issue('a', `uses ${assetId}, which is not a ready upload`, { designId })
          else if (bytes !== row.sha256) issue('a', `uploaded image ${assetId} ${bytes ? 'bytes differ' : 'is missing'}`, { designId })
        }
      }
      for (const row of assets.values()) {
        if (row.status !== 'ready') continue
        if (stored.get(`design-assets/${row.storage_path}`) === row.sha256) verified.assets += 1
        else if (!usedAssets.has(row.id)) warnings.push(`unused upload ${row.id}: bytes missing or different`)
      }

      // (b) Published renders, byte for byte.
      const publications = await jsonRows({
        ...db,
        sql: `select row_to_json(t) from (
          select p.slug, p.design_id, p.status, p.version_seq as seq,
            coalesce(json_object_agg(r.kind, json_build_object('status', r.status, 'path', r.storage_path, 'sha256', r.sha256))
              filter (where r.kind is not null), '{}') as renders
          from public.publications p
          left join public.render_artifacts r on r.design_id = p.design_id and r.version_seq = p.version_seq
          group by p.slug) t;`,
      })
      for (const publication of publications.filter((p) => p.status === 'published')) {
        for (const kind of PUBLIC_RENDER_KINDS) {
          const render = publication.renders[kind]
          const ids = { designId: publication.design_id, slug: publication.slug }
          if (render?.status !== 'ready') {
            issue('b', `published render ${kind} missing`, ids)
            continue
          }
          const bytes = stored.get(`design-assets/${render.path}`)
          if (bytes !== render.sha256) issue('b', `published render ${kind} ${bytes ? 'bytes differ from render_artifacts.sha256' : 'file is missing'}`, ids)
          else verified.renders.push({ slug: publication.slug, kind })
        }
      }

      // (c) Publication state as backed up; tombstones stay revoked.
      const byslug = new Map(publications.map((p) => [p.slug, p]))
      for (const expectedPublication of manifest.expected.publications) {
        const actual = byslug.get(expectedPublication.slug)
        const ids = { designId: expectedPublication.designId, slug: expectedPublication.slug }
        if (!actual) issue('c', 'publication missing', ids)
        else if (actual.status !== expectedPublication.status || actual.seq !== expectedPublication.seq) {
          issue('c', `publication is ${actual.status} v${actual.seq}, backed up as ${expectedPublication.status} v${expectedPublication.seq}`, ids)
        }
      }
      for (const publication of publications) {
        if (publication.status === 'revoked' && publication.seq !== null) issue('c', 'revoked publication still points at a version', { slug: publication.slug })
        if (publication.design_id === null && publication.status !== 'revoked') issue('c', 'tombstone is not revoked', { slug: publication.slug })
      }
      if (publications.length !== manifest.expected.publications.length) {
        issue('c', `${publications.length} publications restored, ${manifest.expected.publications.length} backed up`)
      }

      // (d) Exactly the designs that existed at backup time.
      const designIds = new Set((await jsonRows({ ...db, sql: `select row_to_json(t) from (select id from public.designs) t;` })).map((row) => row.id))
      const backedUp = new Set(manifest.expected.designIds)
      for (const id of designIds) if (!backedUp.has(id)) issue('d', 'design reappeared: it was not in the backup', { designId: id })
      for (const id of backedUp) if (!designIds.has(id)) issue('d', 'design missing from the restore', { designId: id })

      // Render files of designs deleted before the backup are unreachable
      // (no rows point at them); reported so the weekly cleanup is visible.
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      const leftovers = new Set()
      for (const object of manifest.storage.objects) {
        const [owner, folder] = object.path.split('/')
        if (object.bucket === 'design-assets' && UUID.test(owner) && UUID.test(folder ?? '') && !designIds.has(folder)) leftovers.add(folder)
      }
      if (leftovers.size > 0) warnings.push(`${leftovers.size} deleted design(s) still have render files in storage (unreachable; cleanup-orphans removes them)`)

      return { designIds, publications: new Map(publications.map((p) => [p.slug, { status: p.status, seq: p.seq, designId: p.design_id }])) }
    })
  } finally {
    if (!keep) {
      await time.phase('cleanup', async () => {
        await psql({ container, sql: `drop database if exists ${RESTORE_DATABASE} with (force);` })
        if (bucketCreated) {
          const keys = manifest.storage.objects.map((object) => `${object.bucket}/${object.path}`)
          for (let start = 0; start < keys.length; start += 1000) {
            await admin.storage.from(restoreBucket).remove(keys.slice(start, start + 1000))
          }
          const dropped = await admin.storage.deleteBucket(restoreBucket)
          if (dropped.error) warnings.push(`bucket ${restoreBucket} not removed: ${dropped.error.message}`)
        }
      })
    }
  }

  const recoveryPhases = ['create database', 'restore database', 'restore storage', 'verify']
  const recoveryMs = time.phases.filter((p) => recoveryPhases.includes(p.name)).reduce((sum, p) => sum + p.ms, 0)
  log(`verified ${verified.versions} version(s), ${verified.renders.length} published render(s), ${verified.assets} upload(s)`)

  return {
    issues,
    warnings,
    verified,
    restored,
    restoreBucket: upload ? restoreBucket : null,
    phases: time.phases,
    recoveryMs,
    totalMs: time.totalMs(),
  }
}
