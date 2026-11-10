import { type Locator, type Page, expect, test } from '@playwright/test'

import { chooseTool, deleteAccounts, expectSaved, newEmail, panelCanvas, signIn } from './helpers'

/**
 * One pointer owns a drawing gesture: what a tablet sends when a palm lands
 * on the panels beside the pen. Playwright can only send a mouse, so these
 * dispatch the pointer events a tablet would.
 */

const emails: string[] = []

test.afterAll(async () => {
  await deleteAccounts({ emails })
})

type Send = {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'
  id: number
  pointerType: 'pen' | 'touch' | 'mouse'
  at?: number
}

async function send({ canvas, events }: { canvas: Locator; events: Send[] }) {
  await canvas.evaluate((node, list) => {
    // A dispatched pointer isn't active, so the browser would refuse capture.
    node.setPointerCapture = () => undefined
    const box = node.getBoundingClientRect()

    for (const { type, id, pointerType, at = 0.5 } of list) {
      const down = type === 'pointerdown' || type === 'pointermove'
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType,
          buttons: down ? 1 : 0,
          pressure: down ? 0.5 : 0,
          clientX: box.left + box.width * at,
          clientY: box.top + box.height * at,
        }),
      )
    }
  }, events)
}

function path({ id, pointerType, from, count }: { id: number; pointerType: Send['pointerType']; from: number; count: number }) {
  return Array.from({ length: count }, (_, index): Send => ({
    type: 'pointermove',
    id,
    pointerType,
    at: from + (index + 1) * 0.02,
  }))
}

async function frontStrokes({ page }: { page: Page }) {
  await expectSaved({ page })
  const designId = new URL(page.url()).searchParams.get('cloud')!

  return page.evaluate(async (id) => {
    const token = JSON.parse(localStorage.getItem('flp-auth')!).access_token
    const response = await fetch(`/api/flp/designs/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const { head } = await response.json()
    type Layer = { kind: string; strokes?: { points: number[] }[] }

    return (head.content.panels.front.layers as Layer[])
      .filter((layer) => layer.kind === 'paint')
      .flatMap((layer) => layer.strokes ?? [])
      .map((stroke) => stroke.points.length / 2)
  }, designId)
}

test('a palm never ends, joins or starts a pen stroke', async ({ page }) => {
  const email = newEmail({ label: 'pointer-ownership' })
  emails.push(email)
  await signIn({ page, email })
  await page.getByRole('button', { name: 'Create a T-shirt' }).click()
  await expectSaved({ page })
  await chooseTool({ page, tool: 'Graphics' })
  const canvas = panelCanvas({ page, panel: 'Front' })
  await expect(canvas).toBeVisible()

  // A cancelled touch leaves nothing; the mouse stroke after it is the only one.
  await send({
    canvas,
    events: [
      { type: 'pointerdown', id: 21, pointerType: 'touch', at: 0.3 },
      ...path({ id: 21, pointerType: 'touch', from: 0.3, count: 3 }),
      { type: 'pointercancel', id: 21, pointerType: 'touch' },
      { type: 'pointerdown', id: 1, pointerType: 'mouse', at: 0.3 },
      ...path({ id: 1, pointerType: 'mouse', from: 0.3, count: 3 }),
      { type: 'pointerup', id: 1, pointerType: 'mouse' },
    ],
  })
  await expect.poll(() => frontStrokes({ page })).toEqual([4])

  // A palm lands first, then the pen takes the gesture and its stroke is whole.
  await send({
    canvas,
    events: [
      { type: 'pointerdown', id: 22, pointerType: 'touch', at: 0.4 },
      ...path({ id: 22, pointerType: 'touch', from: 0.4, count: 2 }),
      { type: 'pointerdown', id: 31, pointerType: 'pen', at: 0.5 },
      ...path({ id: 31, pointerType: 'pen', from: 0.5, count: 4 }),
      { type: 'pointerup', id: 22, pointerType: 'touch' },
      ...path({ id: 31, pointerType: 'pen', from: 0.58, count: 2 }),
      { type: 'pointerup', id: 31, pointerType: 'pen' },
    ],
  })
  await expect.poll(() => frontStrokes({ page })).toEqual([4, 7])

  // A palm that lands and lifts during a stroke changes nothing.
  await send({
    canvas,
    events: [
      { type: 'pointerdown', id: 32, pointerType: 'pen', at: 0.2 },
      ...path({ id: 32, pointerType: 'pen', from: 0.2, count: 2 }),
      { type: 'pointerdown', id: 23, pointerType: 'touch', at: 0.7 },
      { type: 'pointerup', id: 23, pointerType: 'touch' },
      ...path({ id: 32, pointerType: 'pen', from: 0.24, count: 3 }),
      { type: 'pointerup', id: 32, pointerType: 'pen' },
    ],
  })
  await expect.poll(() => frontStrokes({ page })).toEqual([4, 7, 6])
})

test('an unknown address shows a way home', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to the home page' }).click()
  await expect(page).toHaveURL(/\/$/)
})
