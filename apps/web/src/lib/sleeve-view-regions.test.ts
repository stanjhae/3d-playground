import { describe, expect, test } from 'vitest'

import type { PanelId } from './design-document'
import { MANIFEST_MESH, rasterizeView, regionAt, visiblePrintRegions } from './print-view-harness'
import { CAMERA_PRESET_POSITIONS } from './studio-camera'
import { CURRENT_TEMPLATE } from './template-manifest'

/**
 * E02 #153: the side cameras add no fifth print region. Every printed
 * pixel the `left` and `right` sleeve views show is one of the manifest's
 * four panels, on the mesh the manifest prints that panel on. The collar
 * shares the front's UVs but is trim (#165), so it must never count.
 */

const SLEEVE_VIEWS = [
  // `left` sits at −x and frames the wearer's right sleeve (#179).
  { preset: 'left', sleeve: 'body-sleeve-left', panel: 'left' },
  { preset: 'right', sleeve: 'body-sleeve-right', panel: 'right' },
] as const satisfies ReadonlyArray<{ preset: keyof typeof CAMERA_PRESET_POSITIONS; sleeve: string; panel: PanelId }>

const MANIFEST_PAIRS = new Set(Object.values(CURRENT_TEMPLATE.regions).map((region) => `${region.mesh}:${region.renderPanel}`))

describe('sleeve views show only manifest print regions (#153)', () => {
  test('the manifest has four regions on three meshes, the collar not among them', () => {
    expect(MANIFEST_PAIRS.size).toBe(4)
    expect(Object.values(MANIFEST_MESH).sort()).toEqual(['body', 'body', 'body-sleeve-left', 'body-sleeve-right'])
  })

  for (const pose of ['flat', 'worn'] as const) {
    for (const { preset, sleeve, panel } of SLEEVE_VIEWS) {
      test(`${preset} view (${pose}): every printed pixel is a manifest panel on its own mesh`, () => {
        const view = rasterizeView({ preset, pose, width: 240, height: 300 })
        const pairs = new Set<string>()
        let printed = 0

        for (const sample of view.samples) {
          if (!sample?.printable) {
            continue
          }

          printed += 1
          pairs.add(`${sample.mesh}:${regionAt(sample)}`)
        }

        expect(printed).toBeGreaterThan(0)

        for (const pair of pairs) {
          expect(MANIFEST_PAIRS.has(pair), `${pair} is not a manifest print region`).toBe(true)
        }

        // The view frames its own sleeve; the far sleeve is hidden behind the body.
        const regions = visiblePrintRegions({ view })
        expect([...(regions.get(sleeve) ?? [])]).toEqual([panel])
        expect([...regions.keys()].sort()).toEqual(['body', sleeve])
        expect(regions.has('body-collar')).toBe(false)
      })
    }
  }
})
