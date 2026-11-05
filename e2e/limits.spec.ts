import { type Page, expect, test } from '@playwright/test'

import { IMAGE_LIMITS } from '../src/lib/image-validate'
import { TINY_JPEG, ascii, concatBytes, pngChunk, rgbaPng } from '../src/lib/image-fixtures'
import { chooseTool, deleteAccounts, expectSaved, localSql, newEmail, signIn } from './helpers'

/**
 * Upload and account limits as a person meets them: through the real file
 * input and the studio's own messages (R05, R09, R15, section 9). Quotas are
 * filled in the local database, so these need the local stack.
 */

test.skip(Boolean(process.env.E2E_BASE_URL), 'fills quotas in the local database')

const GLYPH_MESSAGE = /The display face can.t draw “日”/

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Head = { seq: number; content: { panels: Record<string, { layers: Array<{ kind: string; aspect?: number; content?: string }> }> } }

async function openNewDesign({ page, label }: { page: Page; label: string }) {
  const email = newEmail({ label })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Graphics' })
  return { email, designId: new URL(page.url()).searchParams.get('cloud')! }
}

async function savedHead({ page }: { page: Page }): Promise<Head> {
  const designId = new URL(page.url()).searchParams.get('cloud')!
  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    return (await response.json()).head
  }, designId)
}

const frontLayers = (head: Head, kind: string) => head.content.panels.front!.layers.filter((layer) => layer.kind === kind)

async function chooseFile({ page, name, mimeType, bytes }: { page: Page; name: string; mimeType: string; bytes: Uint8Array }) {
  await chooseTool({ page, tool: 'Upload' })
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) })
}

/** A real image of one colour, encoded by the browser. */
async function browserImage({ page, width, height, type }: { page: Page; width: number; height: number; type: string }) {
  const base64 = await page.evaluate(
    async (image) => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ff00ff'
      context.fillRect(0, 0, image.width, image.height)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), image.type))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    },
    { width, height, type },
  )
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

/** A PNG padded with a text chunk to exactly `size` bytes. */
async function pngOfSize({ size }: { size: number }) {
  const plain = await rgbaPng({ width: 2, height: 2 })
  const chunkOverhead = 12
  const padded = await rgbaPng({
    width: 2,
    height: 2,
    extra: [pngChunk({ type: 'tEXt', data: concatBytes([ascii('Pad\0'), new Uint8Array(size - plain.length - chunkOverhead - 4).fill(0x61)]) })],
  })
  expect(padded.length).toBe(size)
  return padded
}

/** A JPEG with data after its end marker, to exactly `size` bytes. */
function jpegOfSize({ size }: { size: number }) {
  return concatBytes([TINY_JPEG, new Uint8Array(size - TINY_JPEG.length)])
}

test('PNG and JPEG at exactly 10 MB and 4096×4096 are accepted through the file input', async ({ page }) => {
  test.setTimeout(240_000)
  await openNewDesign({ page, label: 'uploadmax' })
  const artwork = page.getByRole('button', { name: 'Uploading…' })
  const limit = IMAGE_LIMITS.maxDimension

  const files = [
    { name: 'full.png', mimeType: 'image/png', bytes: await pngOfSize({ size: IMAGE_LIMITS.maxBytes }) },
    { name: 'full.jpg', mimeType: 'image/jpeg', bytes: jpegOfSize({ size: IMAGE_LIMITS.maxBytes }) },
    { name: 'wide.png', mimeType: 'image/png', bytes: await browserImage({ page, width: limit, height: limit, type: 'image/png' }) },
    { name: 'wide.jpg', mimeType: 'image/jpeg', bytes: await browserImage({ page, width: limit, height: limit, type: 'image/jpeg' }) },
  ]

  for (const [index, file] of files.entries()) {
    await chooseFile({ page, ...file })
    await expect(artwork).toHaveCount(0, { timeout: 60_000 })
    await expect(page.locator('p[role="alert"]'), file.name).toHaveCount(0)
    await expect
      .poll(async () => frontLayers(await savedHead({ page }), 'image').length, { timeout: 30_000, message: file.name })
      .toBe(index + 1)
  }
})

test('files over a limit, malformed, animated or of another type are refused with their reason', async ({ page }) => {
  test.setTimeout(180_000)
  await openNewDesign({ page, label: 'uploadbad' })
  const actl = pngChunk({ type: 'acTL', data: new Uint8Array([0, 0, 0, 2, 0, 0, 0, 0]) })

  const refused = [
    {
      name: 'heavy.png',
      mimeType: 'image/png',
      bytes: await pngOfSize({ size: IMAGE_LIMITS.maxBytes + 1 }),
      message: 'Upload failed: Images must be 10 MB or smaller',
    },
    {
      name: 'tall.png',
      mimeType: 'image/png',
      bytes: await rgbaPng({ width: 1, height: IMAGE_LIMITS.maxDimension + 1 }),
      message: 'Upload failed: Images must be at most 4096×4096 pixels',
    },
    {
      name: 'broken.png',
      mimeType: 'image/png',
      bytes: (await rgbaPng({ width: 2, height: 2 })).slice(0, 30),
      message: 'Upload failed: This file is damaged or not a complete image',
    },
    {
      name: 'moving.png',
      mimeType: 'image/png',
      bytes: await rgbaPng({ width: 2, height: 2, extra: [actl] }),
      message: 'Upload failed: Animated images are not supported',
    },
    {
      name: 'drawing.svg',
      mimeType: 'image/svg+xml',
      bytes: ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      message: 'Upload failed: Only PNG and JPEG images are supported',
    },
  ]

  for (const file of refused) {
    await chooseFile({ page, ...file })
    await expect(page.locator('p[role="alert"]'), file.name).toHaveText(file.message, { timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Uploading…' })).toHaveCount(0)
  }

  await page.waitForTimeout(2_000)
  expect(frontLayers(await savedHead({ page }), 'image')).toEqual([])
})

test('an uploaded image is saved with its natural width and height ratio', async ({ page }) => {
  test.setTimeout(120_000)
  await openNewDesign({ page, label: 'aspect' })
  await chooseFile({ page, name: 'wide.png', mimeType: 'image/png', bytes: await browserImage({ page, width: 400, height: 100, type: 'image/png' }) })

  await expect.poll(async () => frontLayers(await savedHead({ page }), 'image')[0]?.aspect, { timeout: 30_000 }).toBe(4)
})

test('a word its face cannot draw is flagged on screen and never saved', async ({ page }) => {
  await openNewDesign({ page, label: 'glyphs' })
  await chooseTool({ page, tool: 'Text' })
  const type = page.getByPlaceholder('Your text')
  await type.fill('日本')
  await type.press('Enter')

  await expect(page.getByText(GLYPH_MESSAGE)).toBeVisible()
  await page.waitForTimeout(2_000)
  const head = await savedHead({ page })
  expect(frontLayers(head, 'text')).toEqual([])
})

test('the 21st design is refused with a message in My Studio', async ({ page }) => {
  test.setTimeout(150_000)
  await openNewDesign({ page, label: 'twenty' })
  const head = await savedHead({ page })

  const statuses = await page.evaluate(async (content) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const answers = []

    for (let n = 2; n <= 20; n += 1) {
      const response = await fetch('/api/flp/designs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mutationKey: crypto.randomUUID(), title: `Design ${n}`, content }),
      })
      answers.push(response.status)
    }

    return answers
  }, head.content)
  expect(new Set(statuses)).toEqual(new Set([201]))

  await page.goto('/studio')
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expect(page.getByRole('main')).toContainText('You have 20 designs, the most an account can keep. Delete one to create another.')
  await expect(page).toHaveURL(/\/studio$/)
})

test('the 101st named checkpoint is refused with a message in History', async ({ page }) => {
  test.setTimeout(120_000)
  const { designId } = await openNewDesign({ page, label: 'checkpoints' })
  localSql({
    sql: `do $$
      declare
        d uuid := '${designId}';
        head public.design_versions%rowtype;
        owner uuid := (select owner_id from public.designs where id = d);
      begin
        select * into head from public.design_versions
          where design_id = d and seq = (select head_seq from public.designs where id = d);
        for i in 1..100 loop
          perform public.flp_save_version(
            owner, d, (select head_seq from public.designs where id = d), gen_random_uuid(),
            head.content, head.content_hash, 'checkpoint', 'Named ' || i
          );
        end loop;
      end $$`,
  })
  await page.reload()
  await expectSaved({ page })

  await page.getByRole('button', { name: 'Show' }).click()
  await page.getByRole('button', { name: 'Save checkpoint' }).click()
  await page.getByLabel(/name/i).last().fill('One too many')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This design has 100 named checkpoints, the most it can keep.')
})

test('an upload past 100 MB is refused with a message, and the design stays as it was', async ({ page }) => {
  test.setTimeout(120_000)
  const { email } = await openNewDesign({ page, label: 'hundred' })
  localSql({
    sql: `do $$
      declare owner uuid := (select id from auth.users where email = '${email}');
      begin
        insert into public.assets (id, owner_id)
          select 'asset_full_' || lpad(n::text, 8, '0'), owner from generate_series(1, 10) n;
        update public.assets set status = 'ready', mime_type = 'image/png', byte_size = ${IMAGE_LIMITS.maxBytes},
          width = 10, height = 10, sha256 = repeat('a', 64), storage_path = owner_id::text || '/' || id || '/normalized'
          where owner_id = owner;
      end $$`,
  })

  await chooseFile({ page, name: 'one-more.png', mimeType: 'image/png', bytes: await rgbaPng({ width: 2, height: 2 }) })
  await expect(page.locator('p[role="alert"]')).toContainText('Your uploaded images use the 100 MB this account can keep.', { timeout: 30_000 })
  await page.waitForTimeout(2_000)
  expect(frontLayers(await savedHead({ page }), 'image')).toEqual([])
})
