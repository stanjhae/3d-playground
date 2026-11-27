// Logo-style marks for the "Logos" category: shields, crests, monogram
// frames, seals, laurels, banners, stars and chevrons. Each is drawn here
// from plain geometry in one or two flat colours from the house palette,
// with no letters, so a designer adds their own initials or words on top.
// None is based on, or arranged like, a real brand's mark (see
// docs/asset-rights.md, "Logo marks").
import { BRASS, INK, OX, P, RED, circle, path, place, poly, ringPath, starPoints, sym } from './draw.mjs'

const num = (value) => String(Math.round(value * 10) / 10)

/** A heater shield, `hw` half wide and `h` tall, its top edge centred on (cx, top). */
const shield = (cx, top, hw, h) =>
  sym([0, 0], [['L', hw, 0], ['L', hw, h * 0.42], ['C', hw, h * 0.74, hw * 0.5, h * 0.9, 0, h]], place(cx, top))

/** The same shield `d` inside its outline. */
const shieldIn = (cx, top, hw, h, d) => shield(cx, top + d, hw - d, h - d * 2.3)

const star = (cx, cy, R, r = R * 0.4, turn = -90) => poly(starPoints(5, R, r, turn), place(cx, cy))

/** A ring between radii R and r, for fill-rule="evenodd". */
const ring = (cx, cy, R, r) => ringPath(cx, cy, R) + ringPath(cx, cy, r, true)

/** Points of a regular polygon around (cx, cy). */
const regular = (cx, cy, n, r, rotation = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rotation + (i * 360) / n) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

/** A closed outline from a polar radius function. */
const polar = (cx, cy, r, steps = 144) =>
  poly(
    Array.from({ length: steps }, (_, i) => {
      const a = (i / steps) * Math.PI * 2
      return [cx + r(a) * Math.cos(a), cy + r(a) * Math.sin(a)]
    }),
  )

/** One leaf pointing up from (0, 0) in T's frame. */
const leaf = (T, w, L) => sym([0, -L], [['C', w, -L * 0.72, w, -L * 0.22, 0, 0]], T)

/**
 * A laurel branch along a circle of radius R around (cx, cy), from angle a0
 * to a1 (degrees, 0 = right, 90 = down), leaves in pairs either side.
 */
function laurel({ cx, cy, R, a0, a1, pairs = 7, size = 1, stem = 5 }) {
  const at = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)]
  const dir = Math.sign(a1 - a0)
  let leaves = ''
  for (let i = 0; i < pairs; i += 1) {
    const t = (i + 0.6) / pairs
    const a = a0 + (a1 - a0) * t
    const [x, y] = at(a)
    const L = size * (58 - 18 * t)
    // Tangent heading in the direction of growth, leaves splayed either side of it.
    const heading = a + 90 * dir
    leaves += leaf(place(x, y, heading + 90 - 34 * dir), L * 0.4, L) + leaf(place(x, y, heading + 90 + 34 * dir), L * 0.4, L)
  }
  const [ex, ey] = at(a1 + 4 * dir)
  leaves += leaf(place(ex, ey, a1 + 90 * dir + 90), size * 14, size * 40)
  const [sx, sy] = at(a0)
  const [tx, ty] = at(a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const arc = path().M(sx, sy).A(R, large, dir > 0 ? 1 : 0, tx, ty).d()
  return { leaves, stem: P(arc, `fill="none" stroke-width="${stem}" stroke-linecap="round"`) }
}

/** Both branches of a wreath meeting at the bottom of a circle. */
function wreath({ cx, cy, R, spread = 130, pairs = 7, size = 1, color }) {
  const left = laurel({ cx, cy, R, a0: 98, a1: 98 + spread, pairs, size })
  const right = laurel({ cx, cy, R, a0: 82, a1: 82 - spread, pairs, size })
  return `<g fill="${color}" stroke="${color}">${left.stem}${right.stem}</g><g fill="${color}">${P(left.leaves + right.leaves)}</g>`
}

/**
 * A ribbon banner: a front band from x0 to x1 whose centre line follows
 * y(x), with notched tails tucked behind each end.
 */
function banner({ x0, x1, y, h, tail = 70, drop = 26, band, fold }) {
  const steps = 24
  const top = []
  const bottom = []
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps
    top.push([x, y(x) - h / 2])
    bottom.push([x, y(x) + h / 2])
  }
  const front = poly([...top, ...bottom.reverse()])
  const tails = [
    [x0, -1],
    [x1, 1],
  ].map(([x, s]) => {
    const cy = y(x) + drop
    const outer = x + s * tail
    const tailShape = poly([
      [x + s * 0, cy - h / 2],
      [outer, cy - h / 2],
      [outer - s * tail * 0.32, cy],
      [outer, cy + h / 2],
      [x - s * 22, cy + h / 2],
    ])
    const tuck = poly([
      [x, y(x) + h / 2],
      [x - s * 22, cy + h / 2],
      [x, cy + h / 2 - 2],
    ])
    return { tailShape, tuck }
  })
  return (
    P(tails.map((t) => t.tailShape).join(''), `fill="${fold}"`) +
    P(tails.map((t) => t.tuck).join(''), `fill="${INK}"`) +
    P(front, `fill="${band}"`)
  )
}

/** A thin line inside the band, a stitch or keyline. */
const keyline = (d, color, width = 4, dash) =>
  P(d, `fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}`)

/** An up-pointing chevron, arm `w` wide, tip at (cx, tip), `span` half wide, `rise` deep. */
const chevron = (cx, tip, span, rise, w) =>
  poly([
    [cx, tip],
    [cx + span, tip + rise],
    [cx + span, tip + rise + w],
    [cx, tip + w],
    [cx - span, tip + rise + w],
    [cx - span, tip + rise],
  ])

const LOGO_TAGS = ['logo', 'mark']

export const LOGOS = [
  // ── shields and crests ──
  {
    id: 'mark-shield-classic',
    label: 'Classic Shield',
    tags: ['shield', 'crest', 'badge', 'heraldry', 'chevron', 'club', 'red'],
    width: 480,
    height: 520,
    draw() {
      const inner = shieldIn(240, 30, 200, 460, 26)
      return {
        defs: `<clipPath id="c">${P(inner)}</clipPath>`,
        body:
          P(shield(240, 30, 200, 460) + shieldIn(240, 30, 200, 460, 14), `fill="${INK}" fill-rule="evenodd"`) +
          P(inner, `fill="${RED}"`) +
          `<g clip-path="url(#c)">${P(chevron(240, 190, 240, 170, 64), `fill="${INK}"`)}</g>`,
      }
    },
  },
  {
    id: 'mark-shield-quartered',
    label: 'Quartered Shield',
    tags: ['shield', 'crest', 'badge', 'heraldry', 'quartered', 'gold', 'club'],
    width: 480,
    height: 520,
    draw() {
      const inner = shieldIn(240, 30, 200, 460, 26)
      return {
        defs: `<clipPath id="c">${P(inner)}</clipPath>`,
        body:
          P(shield(240, 30, 200, 460) + shieldIn(240, 30, 200, 460, 14), `fill="${INK}" fill-rule="evenodd"`) +
          P(inner, `fill="${BRASS}"`) +
          `<g clip-path="url(#c)" fill="${INK}"><rect x="40" y="40" width="200" height="190"/><rect x="240" y="230" width="220" height="300"/></g>` +
          P(path().M(240, 56).L(240, 470).M(40, 230).L(440, 230).d(), `stroke="${INK}" stroke-width="10"`),
      }
    },
  },
  {
    id: 'mark-shield-chevron',
    label: 'Chevron Shield',
    tags: ['shield', 'crest', 'badge', 'chevron', 'stripes', 'rank', 'oxblood'],
    width: 480,
    height: 520,
    draw() {
      const inner = shieldIn(240, 30, 200, 460, 30)
      return {
        defs: `<clipPath id="c">${P(inner)}</clipPath>`,
        body:
          P(shield(240, 30, 200, 460) + shieldIn(240, 30, 200, 460, 18), `fill="${OX}" fill-rule="evenodd"`) +
          `<g clip-path="url(#c)" fill="${INK}">${P([110, 200, 290].map((tip) => chevron(240, tip, 230, 120, 50)).join(''))}</g>`,
      }
    },
  },
  {
    id: 'mark-crest-star',
    label: 'Star Crest',
    tags: ['crest', 'shield', 'badge', 'star', 'banner', 'club', 'varsity', 'gold'],
    width: 520,
    height: 560,
    draw() {
      const inner = shieldIn(260, 92, 150, 350, 22)
      return {
        body:
          P([200, 260, 320].map((x, i) => star(x, i === 1 ? 46 : 58, i === 1 ? 28 : 20)).join(''), `fill="${BRASS}"`) +
          P(shield(260, 92, 150, 350) + inner, `fill="${INK}" fill-rule="evenodd"`) +
          P(star(260, 240, 92), `fill="${BRASS}"`) +
          banner({ x0: 120, x1: 400, y: (x) => 400 + 0.0012 * (x - 260) ** 2, h: 58, tail: 64, drop: 24, band: BRASS, fold: INK }),
      }
    },
  },
  {
    id: 'mark-crest-laurel',
    label: 'Laurel Crest',
    tags: ['crest', 'shield', 'laurel', 'wreath', 'badge', 'emblem', 'club', 'oxblood'],
    width: 520,
    height: 520,
    draw() {
      return {
        body:
          wreath({ cx: 260, cy: 270, R: 220, spread: 128, pairs: 7, size: 1.15, color: OX }) +
          P(shield(260, 90, 120, 300) + shieldIn(260, 90, 120, 300, 16), `fill="${INK}" fill-rule="evenodd"`) +
          P(path().M(260, 120).L(260, 360).M(158, 214).L(362, 214).d(), `stroke="${INK}" stroke-width="16"`),
      }
    },
  },
  // ── badges, seals and emblems ──
  {
    id: 'mark-badge-hex',
    label: 'Hex Badge',
    tags: ['badge', 'hexagon', 'emblem', 'patch', 'star', 'streetwear', 'red'],
    width: 480,
    height: 480,
    draw() {
      const hex = (r) => poly(regular(240, 240, 6, r, 0))
      return {
        body:
          P(hex(226) + hex(204), `fill="${INK}" fill-rule="evenodd"`) +
          P(hex(188) + hex(180), `fill="${INK}" fill-rule="evenodd"`) +
          P(poly([[64, 206], [416, 206], [416, 274], [64, 274]]), `fill="${RED}"`) +
          P(star(240, 128, 44) + star(160, 352, 22) + star(240, 360, 30) + star(320, 352, 22), `fill="${INK}"`),
      }
    },
  },
  {
    id: 'mark-seal-scalloped',
    label: 'Scalloped Seal',
    tags: ['seal', 'badge', 'emblem', 'stamp', 'scalloped', 'round', 'gold', 'quality'],
    width: 480,
    height: 480,
    draw() {
      return {
        body:
          P(polar(240, 240, (a) => 220 - 12 * Math.abs(Math.cos(a * 12))) + ringPath(240, 240, 176, true), `fill="${INK}" fill-rule="evenodd"`) +
          P(ring(240, 240, 164, 154), `fill="${INK}" fill-rule="evenodd"`) +
          circle(240, 240, 132, `fill="${BRASS}"`) +
          P(ring(240, 240, 118, 112), `fill="${INK}" fill-rule="evenodd"`),
      }
    },
  },
  {
    id: 'mark-seal-starburst',
    label: 'Starburst Seal',
    tags: ['seal', 'starburst', 'badge', 'emblem', 'sticker', 'star', 'red'],
    width: 480,
    height: 480,
    draw() {
      const dots = regular(240, 240, 36, 150)
        .map(([x, y]) => circle(x, y, 4))
        .join('')
      return {
        body:
          P(poly(starPoints(32, 228, 196).map(([x, y]) => [240 + x, 240 + y])), `fill="${RED}"`) +
          circle(240, 240, 170, `fill="${INK}"`) +
          `<g fill="${RED}">${dots}</g>` +
          P(star(240, 246, 92), `fill="${RED}"`),
      }
    },
  },
  {
    id: 'mark-roundel-club',
    label: 'Club Roundel',
    tags: ['roundel', 'emblem', 'badge', 'club', 'sports', 'stripes', 'team', 'gold'],
    width: 480,
    height: 480,
    draw() {
      const disc = ringPath(240, 240, 136)
      return {
        defs: `<clipPath id="c"><path d="${disc}"/></clipPath>`,
        body:
          P(ring(240, 240, 226, 136), `fill="${INK}" fill-rule="evenodd"`) +
          P(ring(240, 240, 214, 206) + ring(240, 240, 158, 150), `fill="${BRASS}" fill-rule="evenodd"`) +
          circle(58, 240, 9, `fill="${BRASS}"`) +
          circle(422, 240, 9, `fill="${BRASS}"`) +
          `<g clip-path="url(#c)">${circle(240, 240, 136, `fill="${BRASS}"`)}<g fill="${INK}">${[150, 222, 294]
            .map((x) => `<rect x="${x}" y="100" width="36" height="280"/>`)
            .join('')}</g></g>`,
      }
    },
  },
  {
    id: 'mark-emblem-sun',
    label: 'Sun Emblem',
    tags: ['emblem', 'sun', 'rays', 'sunburst', 'badge', 'roundel', 'gold'],
    width: 480,
    height: 480,
    draw() {
      const rays = Array.from({ length: 24 }, (_, i) => {
        const long = i % 2 === 0
        const T = place(240, 240, i * 15)
        return poly([[-11, -140], [0, long ? -230 : -192], [11, -140]], T)
      }).join('')
      return {
        body:
          P(rays, `fill="${BRASS}"`) +
          P(ring(240, 240, 132, 112), `fill="${INK}" fill-rule="evenodd"`) +
          circle(240, 240, 96, `fill="${BRASS}"`) +
          circle(240, 240, 36, `fill="${INK}"`),
      }
    },
  },
  {
    id: 'mark-emblem-octagon',
    label: 'Octagon Emblem',
    tags: ['emblem', 'octagon', 'badge', 'star', 'geometric', 'patch', 'red'],
    width: 480,
    height: 480,
    draw() {
      const oct = (r) => poly(regular(240, 240, 8, r, -67.5))
      const eight = poly(starPoints(8, 130, 62, -90).map(([x, y]) => [240 + x, 240 + y]))
      return {
        body:
          P(oct(226) + oct(198), `fill="${INK}" fill-rule="evenodd"`) +
          P(oct(186) + oct(178), `fill="${RED}" fill-rule="evenodd"`) +
          P(eight, `fill="${INK}"`) +
          circle(240, 240, 30, `fill="${RED}"`),
      }
    },
  },
  {
    id: 'mark-star-roundel',
    label: 'Star Roundel',
    tags: ['star', 'roundel', 'emblem', 'badge', 'dots', 'ring', 'red'],
    width: 480,
    height: 480,
    draw() {
      const dots = regular(240, 240, 28, 196, -90)
        .map(([x, y]) => circle(x, y, 9))
        .join('')
      return {
        body:
          `<g fill="${RED}">${dots}</g>` +
          P(ring(240, 240, 172, 158), `fill="${INK}" fill-rule="evenodd"`) +
          P(star(240, 252, 132, 54), `fill="${INK}"`),
      }
    },
  },
  // ── monogram frames: empty centres for the designer's own letters ──
  {
    id: 'mark-mono-circle',
    label: 'Circle Monogram Frame',
    tags: ['monogram', 'frame', 'initials', 'circle', 'border', 'badge', 'gold'],
    width: 480,
    height: 480,
    draw() {
      const dots = regular(240, 240, 48, 196)
        .map(([x, y]) => circle(x, y, 4))
        .join('')
      const diamond = (cx, cy) => poly([[cx, cy - 22], [cx + 13, cy], [cx, cy + 22], [cx - 13, cy]])
      return {
        body:
          P(ring(240, 240, 222, 212) + ring(240, 240, 180, 172), `fill="${INK}" fill-rule="evenodd"`) +
          `<g fill="${BRASS}">${dots}</g>` +
          P(diamond(240, 18) + diamond(240, 462) + diamond(18, 240) + diamond(462, 240), `fill="${INK}"`),
      }
    },
  },
  {
    id: 'mark-mono-diamond',
    label: 'Diamond Monogram Frame',
    tags: ['monogram', 'frame', 'initials', 'diamond', 'border', 'art deco', 'gold'],
    width: 480,
    height: 480,
    draw() {
      const dia = (r) => poly([[240, 240 - r], [240 + r, 240], [240, 240 + r], [240 - r, 240]])
      const ends = [[240, 14], [466, 240], [240, 466], [14, 240]].map(([x, y]) => circle(x, y, 14)).join('')
      return {
        body:
          P(dia(212) + dia(190), `fill="${INK}" fill-rule="evenodd"`) +
          P(dia(178) + dia(170), `fill="${BRASS}" fill-rule="evenodd"`) +
          `<g fill="${BRASS}">${ends}</g>`,
      }
    },
  },
  {
    id: 'mark-mono-oval',
    label: 'Oval Monogram Frame',
    tags: ['monogram', 'frame', 'initials', 'oval', 'laurel', 'wreath', 'border', 'oxblood'],
    width: 440,
    height: 520,
    draw() {
      const oval = (rx, ry, reverse = false) =>
        `M220 ${num(260 - ry)}A${rx} ${ry} 0 1 ${reverse ? 0 : 1} 220 ${num(260 + ry)}A${rx} ${ry} 0 1 ${reverse ? 0 : 1} 220 ${num(260 - ry)}Z`
      return {
        body:
          P(oval(150, 210) + oval(134, 194, true), `fill="${INK}" fill-rule="evenodd"`) +
          P(oval(124, 184) + oval(118, 178, true), `fill="${INK}" fill-rule="evenodd"`) +
          wreath({ cx: 220, cy: 250, R: 200, spread: 70, pairs: 5, size: 1.05, color: OX }),
      }
    },
  },
  {
    id: 'mark-mono-arch',
    label: 'Arch Monogram Frame',
    tags: ['monogram', 'frame', 'initials', 'arch', 'label', 'border', 'vintage', 'red'],
    width: 420,
    height: 520,
    draw() {
      const arch = (d) => {
        const r = 190 - d
        return path().M(210 - r, 500 - d).L(210 - r, 210).A(r, 0, 1, 210 + r, 210).L(210 + r, 500 - d).Z().d()
      }
      return {
        body:
          P(arch(0) + arch(16), `fill="${INK}" fill-rule="evenodd"`) +
          P(arch(28) + arch(36), `fill="${RED}" fill-rule="evenodd"`) +
          P(star(210, 92, 26), `fill="${RED}"`),
      }
    },
  },
  // ── laurels, banners and ribbons ──
  {
    id: 'mark-laurel-wreath',
    label: 'Laurel Wreath with Star',
    tags: ['laurel', 'wreath', 'leaves', 'victory', 'award', 'star', 'emblem', 'gold'],
    width: 480,
    height: 480,
    draw() {
      return {
        body:
          wreath({ cx: 240, cy: 236, R: 196, spread: 140, pairs: 8, size: 1.15, color: BRASS }) +
          P(star(240, 240, 82), `fill="${INK}"`) +
          P(poly([[214, 420], [266, 420], [282, 466], [240, 446], [198, 466]]), `fill="${INK}"`),
      }
    },
  },
  {
    id: 'mark-laurel-ring',
    label: 'Laurel Ring',
    tags: ['laurel', 'wreath', 'ring', 'emblem', 'seal', 'badge', 'frame', 'gold'],
    width: 480,
    height: 480,
    draw() {
      return {
        body:
          P(ring(240, 240, 150, 128), `fill="${INK}" fill-rule="evenodd"`) +
          wreath({ cx: 240, cy: 240, R: 182, spread: 150, pairs: 9, size: 1.05, color: INK }) +
          circle(240, 240, 112, `fill="${BRASS}"`),
      }
    },
  },
  {
    id: 'mark-banner-scroll',
    label: 'Scroll Banner',
    tags: ['banner', 'ribbon', 'scroll', 'label', 'blank', 'motto', 'red'],
    width: 600,
    height: 240,
    draw() {
      return {
        body: banner({ x0: 120, x1: 480, y: () => 110, h: 96, tail: 100, drop: 34, band: RED, fold: INK }),
      }
    },
  },
  {
    id: 'mark-banner-arch',
    label: 'Arched Banner',
    tags: ['banner', 'ribbon', 'arch', 'curved', 'label', 'blank', 'club', 'oxblood'],
    width: 600,
    height: 300,
    draw() {
      return {
        body: banner({ x0: 120, x1: 480, y: (x) => 110 + 0.0016 * (x - 300) ** 2, h: 84, tail: 96, drop: 34, band: OX, fold: INK }),
      }
    },
  },
  {
    id: 'mark-ribbon-rosette',
    label: 'Award Rosette',
    tags: ['ribbon', 'rosette', 'award', 'prize', 'winner', 'badge', 'medal', 'red'],
    width: 440,
    height: 560,
    draw() {
      const tails = poly([[150, 300], [220, 330], [196, 540], [164, 506], [120, 534]]) + poly([[290, 300], [220, 330], [244, 540], [276, 506], [320, 534]])
      return {
        body:
          P(tails, `fill="${RED}"`) +
          P(polar(220, 200, (a) => 186 - 16 * Math.abs(Math.cos(a * 14))), `fill="${INK}"`) +
          circle(220, 200, 140, `fill="${RED}"`) +
          P(ring(220, 200, 118, 110), `fill="${INK}" fill-rule="evenodd"`) +
          P(star(220, 206, 66), `fill="${INK}"`),
      }
    },
  },
  // ── stars and chevrons ──
  {
    id: 'mark-chevrons-triple',
    label: 'Triple Chevron',
    tags: ['chevron', 'stripes', 'rank', 'arrows', 'up', 'military', 'sports', 'red'],
    width: 480,
    height: 480,
    draw() {
      return {
        body: P(chevron(240, 40, 210, 130, 62) + chevron(240, 290, 210, 130, 62), `fill="${INK}"`) + P(chevron(240, 165, 210, 130, 62), `fill="${RED}"`),
      }
    },
  },
  {
    id: 'mark-chevron-band',
    label: 'Chevron Band',
    tags: ['chevron', 'band', 'arrows', 'stripe', 'streetwear', 'sleeve', 'border', 'gold'],
    width: 640,
    height: 200,
    draw() {
      const arrows = Array.from({ length: 6 }, (_, i) => {
        const x = 70 + i * 100
        return poly([[x - 26, 52], [x + 14, 52], [x + 54, 100], [x + 14, 148], [x - 26, 148], [x + 14, 100]])
      }).join('')
      return {
        body:
          P(poly([[0, 20], [640, 20], [640, 34], [0, 34]]) + poly([[0, 166], [640, 166], [640, 180], [0, 180]]), `fill="${INK}"`) +
          P(arrows, `fill="${BRASS}"`),
      }
    },
  },
  {
    id: 'mark-stars-arc',
    label: 'Arc of Stars',
    tags: ['star', 'stars', 'arc', 'five', 'award', 'rating', 'champion', 'gold'],
    width: 560,
    height: 300,
    draw() {
      const sizes = [42, 56, 74, 56, 42]
      const stars = sizes
        .map((R, i) => {
          const a = ((-90 + (i - 2) * 25) * Math.PI) / 180
          return star(280 + 320 * Math.cos(a), 420 + 320 * Math.sin(a), R)
        })
        .join('')
      return {
        body:
          P(stars, `fill="${BRASS}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"`) +
          P(path().M(90, 262).Q(280, 178, 470, 262).d(), `fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"`),
      }
    },
  },
  // ── club and streetwear marks ──
  {
    id: 'mark-club-pennant',
    label: 'Club Pennant',
    tags: ['pennant', 'flag', 'club', 'sports', 'team', 'varsity', 'retro', 'red'],
    width: 600,
    height: 300,
    draw() {
      return {
        body:
          P(poly([[40, 30], [580, 150], [40, 270]]), `fill="${RED}"`) +
          P(poly([[40, 30], [110, 45.6], [110, 254.4], [40, 270]]), `fill="${INK}"`) +
          P(star(190, 150, 34) + star(270, 150, 24), `fill="${INK}"`) +
          [86, 150, 214].map((y) => circle(75, y, 9, `fill="${RED}"`)).join(''),
      }
    },
  },
  {
    id: 'mark-varsity-patch',
    label: 'Varsity Patch',
    tags: ['varsity', 'patch', 'badge', 'stitch', 'college', 'club', 'label', 'oxblood'],
    width: 560,
    height: 400,
    draw() {
      const box = (d, r) => {
        const x0 = 20 + d
        const y0 = 20 + d
        const x1 = 540 - d
        const y1 = 380 - d
        const rr = r - d
        return path()
          .M(x0 + rr, y0).L(x1 - rr, y0).A(rr, 0, 1, x1, y0 + rr)
          .L(x1, y1 - rr).A(rr, 0, 1, x1 - rr, y1)
          .L(x0 + rr, y1).A(rr, 0, 1, x0, y1 - rr)
          .L(x0, y0 + rr).A(rr, 0, 1, x0 + rr, y0)
          .Z().d()
      }
      return {
        body:
          P(box(0, 70), `fill="${OX}"`) +
          keyline(box(18, 70), INK, 6, '18 12') +
          P(poly([[60, 168], [500, 168], [500, 232], [60, 232]]), `fill="${INK}"`) +
          P(star(150, 104, 30) + star(280, 96, 38) + star(410, 104, 30) + star(280, 300, 30), `fill="${INK}"`),
      }
    },
  },
  {
    id: 'mark-ticket-stamp',
    label: 'Ticket Stamp',
    tags: ['ticket', 'stamp', 'label', 'tag', 'streetwear', 'frame', 'blank', 'red'],
    width: 600,
    height: 340,
    draw() {
      // A ticket: notched corners and a half-round bite out of each end.
      const ticket = (d) => {
        const x0 = 20 + d
        const y0 = 20 + d
        const x1 = 580 - d
        const y1 = 320 - d
        const n = 34 - d * 0.6
        const bite = 40 - d * 0.6
        return path()
          .M(x0 + n, y0).L(x1 - n, y0).L(x1, y0 + n)
          .L(x1, 170 - bite).A(bite, 0, 0, x1, 170 + bite)
          .L(x1, y1 - n).L(x1 - n, y1)
          .L(x0 + n, y1).L(x0, y1 - n)
          .L(x0, 170 + bite).A(bite, 0, 0, x0, 170 - bite)
          .L(x0, y0 + n).Z().d()
      }
      return {
        body:
          P(ticket(0) + ticket(14), `fill="${INK}" fill-rule="evenodd"`) +
          keyline(ticket(30), RED, 5, '2 14') +
          P(poly([[150, 70], [158, 70], [158, 270], [150, 270]]) + poly([[442, 70], [450, 70], [450, 270], [442, 270]]), `fill="${RED}"`),
      }
    },
  },
  {
    id: 'mark-shield-stripes',
    label: 'Striped Club Shield',
    tags: ['shield', 'stripes', 'club', 'sports', 'team', 'crest', 'badge', 'gold'],
    width: 480,
    height: 520,
    draw() {
      const inner = shieldIn(240, 30, 190, 460, 24)
      return {
        defs: `<clipPath id="c">${P(inner)}</clipPath>`,
        body:
          P(shield(240, 30, 190, 460) + inner, `fill="${INK}" fill-rule="evenodd"`) +
          `<g clip-path="url(#c)"><g fill="${BRASS}">${[70, 166, 262, 358]
            .map((x) => `<rect x="${x}" y="150" width="52" height="340"/>`)
            .join('')}</g>${P(poly([[40, 54], [440, 54], [440, 150], [40, 150]]), `fill="${BRASS}"`)}</g>` +
          P(star(240, 104, 30), `fill="${INK}"`),
      }
    },
  },
].map((g) => ({ ...g, tags: [...g.tags, ...LOGO_TAGS], category: 'logos' }))
