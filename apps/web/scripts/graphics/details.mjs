// Garment details for the graphics library (tester, 22 Nov: zippers,
// buttons and snaps, seams and stitching, collars, pockets, holes and
// distressing). Drawn here from primitives, so original to this project
// (CC0). They are printed details: a hole looks like a hole but is not cut
// through the cloth.
import { BRASS, INK, PAPER, P, circle, ellipse, path, rect, rng } from './draw.mjs'

const TAPE = '#3a3d45'
const METAL = '#b9bcc4'
const SHADOW = '#2a2b30'
const THREAD = '#e9e3d6'
const RED = '#d7262e'

/** Dashes along a straight line from (x1, y1) to (x2, y2). */
function stitches(x1, y1, x2, y2, { dash = 18, gap = 10, color = THREAD, width = 5 } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${dash} ${gap}"/>`
}

/** Dashes along any path. */
function stitchPath(d, { dash = 18, gap = 10, color = THREAD, width = 5 } = {}) {
  return P(d, `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${dash} ${gap}"`)
}

/** A zip from (cx, top) down `length`: tape, interlocking teeth, and a pull at the top. */
function zip({ cx, top, length, width = 56 }) {
  let teeth = ''
  const tooth = 14

  for (let y = top + 40, i = 0; y < top + length - 10; y += tooth, i += 1) {
    const left = i % 2 === 0
    teeth += rect(left ? cx - 13 : cx - 1, y, 14, tooth - 3, `rx="2" fill="${METAL}" stroke="${INK}" stroke-width="2"`)
  }

  const pull =
    rect(cx - 16, top + 10, 32, 34, `rx="6" fill="${METAL}" stroke="${INK}" stroke-width="3"`) +
    P(path().M(cx - 10, top + 40).L(cx + 10, top + 40).L(cx + 14, top + 110).Q(cx, top + 124, cx - 14, top + 110).Z().d(), `fill="${METAL}" stroke="${INK}" stroke-width="3"`) +
    ellipse(cx, top + 96, 5, 9, `fill="${INK}"`)

  return (
    rect(cx - width / 2, top, width, length, `rx="6" fill="${TAPE}"`) +
    stitches(cx - width / 2 + 6, top + 8, cx - width / 2 + 6, top + length - 8, { dash: 10, gap: 8, width: 3 }) +
    stitches(cx + width / 2 - 6, top + 8, cx + width / 2 - 6, top + length - 8, { dash: 10, gap: 8, width: 3 }) +
    teeth +
    pull
  )
}

/** A sewn button: rim, dished face and four holes with a thread cross. */
function button({ cx, cy, r, fill = '#ece6da', thread = INK }) {
  const hole = r * 0.22

  return (
    circle(cx, cy, r, `fill="${fill}" stroke="${INK}" stroke-width="${Math.max(3, r * 0.08)}"`) +
    circle(cx, cy, r * 0.72, `fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="${Math.max(2, r * 0.05)}"`) +
    `<g stroke="${thread}" stroke-width="${Math.max(2, r * 0.09)}" stroke-linecap="round">` +
    `<line x1="${cx - hole}" y1="${cy - hole}" x2="${cx + hole}" y2="${cy + hole}"/>` +
    `<line x1="${cx + hole}" y1="${cy - hole}" x2="${cx - hole}" y2="${cy + hole}"/></g>` +
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => circle(cx + dx * hole, cy + dy * hole, r * 0.09, `fill="${SHADOW}"`)).join('')
  )
}

/** A press stud: a metal ring with a domed centre. */
function snap({ cx, cy, r }) {
  return (
    circle(cx, cy, r, `fill="${METAL}" stroke="${INK}" stroke-width="${Math.max(3, r * 0.08)}"`) +
    circle(cx, cy, r * 0.62, `fill="#d8dbe2" stroke="${INK}" stroke-opacity="0.5" stroke-width="${Math.max(2, r * 0.05)}"`) +
    circle(cx - r * 0.18, cy - r * 0.18, r * 0.16, `fill="#ffffff" fill-opacity="0.8"`)
  )
}

/** Loose threads across a gap: short wavy strands. */
function threads({ x1, x2, y, count, spread, seed }) {
  const random = rng(seed)
  let out = ''

  for (let i = 0; i < count; i += 1) {
    const x = x1 + ((x2 - x1) * (i + 0.5)) / count + (random() - 0.5) * 10
    const sag = (random() - 0.5) * spread
    out += P(path().M(x, y - spread / 2).Q(x + sag, y, x + (random() - 0.5) * 8, y + spread / 2).d(), `fill="none" stroke="${THREAD}" stroke-width="3" stroke-linecap="round"`)
  }

  return out
}

/** A ragged hole: a dark torn shape, a frayed paler rim, and threads across. */
function hole({ cx, cy, rx, ry, seed }) {
  const random = rng(seed)
  const points = []
  const n = 22

  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2
    const k = 0.78 + random() * 0.32
    points.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }

  const edge = path()
  points.forEach(([x, y], i) => (i === 0 ? edge.M(x, y) : edge.L(x, y)))
  edge.Z()
  const rim = P(edge.d(), `fill="${THREAD}" stroke="${THREAD}" stroke-width="10" stroke-linejoin="round"`)

  return rim + P(edge.d(), `fill="${SHADOW}"`) + threads({ x1: cx - rx * 0.7, x2: cx + rx * 0.7, y: cy, count: Math.max(2, Math.round(rx / 18)), spread: ry * 1.4, seed: seed + 1 })
}

export const DETAILS = [
  {
    id: 'detail-zip-centre',
    label: 'Centre Zip',
    tags: ['zip', 'zipper', 'fastening', 'front', 'jacket', 'hoodie'],
    width: 120,
    height: 640,
    draw: () => ({ body: zip({ cx: 60, top: 10, length: 620 }) }),
  },
  {
    id: 'detail-zip-half',
    label: 'Half Zip',
    tags: ['zip', 'zipper', 'quarter zip', 'neck', 'fastening'],
    width: 120,
    height: 340,
    draw: () => ({ body: zip({ cx: 60, top: 10, length: 320 }) }),
  },
  {
    id: 'detail-zip-pocket',
    label: 'Zip Pocket',
    tags: ['zip', 'zipper', 'pocket', 'horizontal', 'chest'],
    width: 480,
    height: 140,
    draw: () => ({
      body:
        rect(10, 30, 460, 80, `rx="10" fill="${TAPE}"`) +
        `<g transform="rotate(-90 240 70) translate(0 0)">${zip({ cx: 240, top: -150, length: 440, width: 44 })}</g>`,
    }),
  },
  {
    id: 'detail-button',
    label: 'Button',
    tags: ['button', 'fastening', 'sewn', 'four hole'],
    width: 240,
    height: 240,
    draw: () => ({ body: button({ cx: 120, cy: 120, r: 100 }) }),
  },
  {
    id: 'detail-button-placket',
    label: 'Button Placket',
    tags: ['button', 'placket', 'shirt', 'front', 'fastening', 'row'],
    width: 160,
    height: 640,
    draw: () => ({
      body:
        rect(20, 10, 120, 620, `rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="4"`) +
        stitches(34, 22, 34, 618, { color: INK, dash: 12, gap: 9, width: 3 }) +
        stitches(126, 22, 126, 618, { color: INK, dash: 12, gap: 9, width: 3 }) +
        [90, 220, 350, 480, 600].map((y) => button({ cx: 80, cy: y - 20, r: 34 })).join(''),
    }),
  },
  {
    id: 'detail-snap',
    label: 'Snap',
    tags: ['snap', 'press stud', 'popper', 'fastening', 'metal'],
    width: 200,
    height: 200,
    draw: () => ({ body: snap({ cx: 100, cy: 100, r: 86 }) }),
  },
  {
    id: 'detail-snap-row',
    label: 'Snap Row',
    tags: ['snap', 'press stud', 'popper', 'fastening', 'row', 'workwear'],
    width: 600,
    height: 140,
    draw: () => ({ body: [80, 227, 373, 520].map((x) => snap({ cx: x, cy: 70, r: 52 })).join('') }),
  },
  {
    id: 'detail-toggle',
    label: 'Toggle',
    tags: ['toggle', 'duffle', 'horn', 'fastening', 'coat'],
    width: 360,
    height: 220,
    draw: () => ({
      body:
        P(path().M(40, 110).Q(180, 40, 320, 110).d(), `fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"`) +
        rect(110, 80, 140, 60, `rx="30" fill="${BRASS}" stroke="${INK}" stroke-width="6"`) +
        `<line x1="140" y1="110" x2="220" y2="110" stroke="${INK}" stroke-opacity="0.4" stroke-width="5" stroke-linecap="round"/>`,
    }),
  },
  {
    id: 'detail-stitch-line',
    label: 'Stitch Line',
    tags: ['stitch', 'stitching', 'seam', 'line', 'thread'],
    width: 640,
    height: 40,
    draw: () => ({ body: stitches(12, 20, 628, 20, { color: INK, dash: 24, gap: 12, width: 6 }) }),
  },
  {
    id: 'detail-topstitch',
    label: 'Double Topstitch',
    tags: ['stitch', 'topstitch', 'seam', 'double', 'denim', 'thread'],
    width: 640,
    height: 70,
    draw: () => ({
      body:
        stitches(12, 18, 628, 18, { color: BRASS, dash: 22, gap: 10, width: 6 }) +
        stitches(12, 52, 628, 52, { color: BRASS, dash: 22, gap: 10, width: 6 }),
    }),
  },
  {
    id: 'detail-contrast-seam',
    label: 'Contrast Seam',
    tags: ['seam', 'stitch', 'contrast', 'red', 'panel line'],
    width: 640,
    height: 80,
    draw: () => ({
      body:
        `<line x1="10" y1="40" x2="630" y2="40" stroke="${INK}" stroke-opacity="0.45" stroke-width="4"/>` +
        stitches(12, 22, 628, 22, { color: RED, dash: 20, gap: 10, width: 6 }) +
        stitches(12, 58, 628, 58, { color: RED, dash: 20, gap: 10, width: 6 }),
    }),
  },
  {
    id: 'detail-cross-stitch',
    label: 'Cross Stitch',
    tags: ['stitch', 'cross stitch', 'zigzag', 'hand sewn', 'thread', 'repair'],
    width: 640,
    height: 90,
    draw() {
      let body = ''

      for (let x = 20; x < 620; x += 40) {
        body +=
          `<line x1="${x}" y1="15" x2="${x + 30}" y2="75" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
          `<line x1="${x + 30}" y1="15" x2="${x}" y2="75" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`
      }

      return { body }
    },
  },
  {
    id: 'detail-pocket-patch',
    label: 'Patch Pocket',
    tags: ['pocket', 'patch', 'jeans', 'denim', 'chest', 'back pocket'],
    width: 380,
    height: 420,
    draw() {
      const outline = path().M(20, 20).L(360, 20).L(360, 330).L(190, 400).L(20, 330).Z().d()
      const inner = path().M(40, 40).L(340, 40).L(340, 316).L(190, 376).L(40, 316).Z().d()

      return {
        body:
          P(outline, `fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          stitchPath(inner, { color: BRASS, dash: 16, gap: 9, width: 5 }) +
          stitches(40, 90, 340, 90, { color: BRASS, dash: 16, gap: 9, width: 5 }),
      }
    },
  },
  {
    id: 'detail-pocket-kangaroo',
    label: 'Kangaroo Pocket',
    tags: ['pocket', 'kangaroo', 'pouch', 'hoodie', 'front'],
    width: 600,
    height: 320,
    draw() {
      const outline = path().M(130, 20).L(470, 20).L(580, 300).L(20, 300).Z().d()

      return {
        body:
          P(outline, `fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          stitchPath(path().M(140, 38).L(460, 38).d(), { color: INK, dash: 14, gap: 9, width: 4 }) +
          stitchPath(path().M(136, 34).L(42, 284).d(), { color: INK, dash: 14, gap: 9, width: 4 }) +
          stitchPath(path().M(464, 34).L(558, 284).d(), { color: INK, dash: 14, gap: 9, width: 4 }) +
          P(path().M(118, 52).L(36, 280).d(), `stroke="${INK}" stroke-opacity="0.5" stroke-width="5"`) +
          P(path().M(482, 52).L(564, 280).d(), `stroke="${INK}" stroke-opacity="0.5" stroke-width="5"`),
      }
    },
  },
  {
    id: 'detail-pocket-welt',
    label: 'Welt Pocket',
    tags: ['pocket', 'welt', 'jetted', 'tailored', 'jacket', 'slit'],
    width: 420,
    height: 110,
    draw: () => ({
      body:
        rect(14, 20, 392, 70, `rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="5"`) +
        rect(34, 50, 352, 12, `rx="4" fill="${SHADOW}"`) +
        stitches(30, 34, 390, 34, { color: INK, dash: 12, gap: 8, width: 3 }) +
        stitches(30, 76, 390, 76, { color: INK, dash: 12, gap: 8, width: 3 }),
    }),
  },
  {
    id: 'detail-pocket-flap',
    label: 'Flap Pocket',
    tags: ['pocket', 'flap', 'cargo', 'utility', 'button'],
    width: 380,
    height: 420,
    draw() {
      const flap = path().M(16, 20).L(364, 20).L(364, 130).L(190, 160).L(16, 130).Z().d()

      return {
        body:
          rect(26, 90, 328, 310, `rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="6"`) +
          stitchPath(path().M(44, 150).L(44, 382).L(336, 382).L(336, 150).d(), { color: INK, dash: 14, gap: 9, width: 4 }) +
          P(flap, `fill="#ece6da" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          stitchPath(path().M(34, 40).L(346, 40).L(346, 116).L(190, 142).L(34, 116).Z().d(), { color: INK, dash: 14, gap: 9, width: 4 }) +
          button({ cx: 190, cy: 124, r: 24 }),
      }
    },
  },
  {
    id: 'detail-collar-rib',
    label: 'Rib Collar',
    tags: ['collar', 'crew', 'rib', 'neckline', 'band', 'tee'],
    width: 600,
    height: 230,
    draw() {
      let ribs = ''
      // Between the band's outer and inner curves, at the same share along each.
      const outer = (t) => [(1 - t) ** 2 * 38 + 2 * (1 - t) * t * 300 + t ** 2 * 562, (1 - t) ** 2 * 20 + 2 * (1 - t) * t * 290 + t ** 2 * 20]
      const inner = (t) => [(1 - t) ** 2 * 78 + 2 * (1 - t) * t * 300 + t ** 2 * 522, (1 - t) ** 2 * 20 + 2 * (1 - t) * t * 210 + t ** 2 * 20]

      for (let i = 1; i < 40; i += 1) {
        const [x1, y1] = outer(i / 40)
        const [x2, y2] = inner(i / 40)
        ribs += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-opacity="0.35" stroke-width="4"/>`
      }

      return {
        body:
          P(path().M(38, 20).Q(300, 290, 562, 20).L(522, 20).Q(300, 210, 78, 20).Z().d(), `fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          ribs,
      }
    },
  },
  {
    id: 'detail-collar-polo',
    label: 'Polo Collar',
    tags: ['collar', 'polo', 'placket', 'button', 'shirt'],
    width: 520,
    height: 440,
    draw() {
      const left = path().M(250, 40).L(40, 70).L(80, 240).L(230, 170).Z().d()
      const right = path().M(270, 40).L(480, 70).L(440, 240).L(290, 170).Z().d()

      return {
        body:
          rect(220, 150, 80, 280, `rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="5"`) +
          stitchPath(path().M(232, 170).L(232, 416).d(), { color: INK, dash: 12, gap: 8, width: 3 }) +
          stitchPath(path().M(288, 170).L(288, 416).d(), { color: INK, dash: 12, gap: 8, width: 3 }) +
          button({ cx: 260, cy: 250, r: 20 }) +
          button({ cx: 260, cy: 350, r: 20 }) +
          P(left, `fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          P(right, `fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          stitchPath(path().M(70, 210).L(220, 150).d(), { color: INK, dash: 12, gap: 8, width: 3 }) +
          stitchPath(path().M(450, 210).L(300, 150).d(), { color: INK, dash: 12, gap: 8, width: 3 }),
      }
    },
  },
  {
    id: 'detail-collar-mandarin',
    label: 'Mandarin Collar',
    tags: ['collar', 'mandarin', 'band', 'stand', 'neckline'],
    width: 580,
    height: 170,
    draw: () => ({
      body:
        P(path().M(20, 40).Q(290, 0, 560, 40).L(540, 150).Q(290, 110, 40, 150).Z().d(), `fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
        stitchPath(path().M(42, 58).Q(290, 22, 538, 58).d(), { color: INK, dash: 14, gap: 9, width: 4 }) +
        button({ cx: 70, cy: 96, r: 18 }),
    }),
  },
  {
    id: 'detail-rip',
    label: 'Rip',
    tags: ['rip', 'distressed', 'torn', 'destroyed', 'grunge', 'denim'],
    width: 440,
    height: 180,
    draw: () => ({ body: hole({ cx: 220, cy: 90, rx: 190, ry: 46, seed: 11 }) }),
  },
  {
    id: 'detail-holes',
    label: 'Holes',
    tags: ['hole', 'holes', 'distressed', 'worn', 'grunge', 'cutout'],
    width: 420,
    height: 320,
    draw: () => ({
      body:
        hole({ cx: 110, cy: 90, rx: 70, ry: 50, seed: 21 }) +
        hole({ cx: 300, cy: 150, rx: 90, ry: 60, seed: 31 }) +
        hole({ cx: 150, cy: 250, rx: 50, ry: 36, seed: 41 }),
    }),
  },
  {
    id: 'detail-frayed-edge',
    label: 'Frayed Edge',
    tags: ['fray', 'frayed', 'raw hem', 'fringe', 'distressed', 'edge'],
    width: 640,
    height: 140,
    draw() {
      const random = rng(7)
      let fringe = ''

      for (let x = 10; x < 632; x += 7) {
        const length = 30 + random() * 70
        const lean = (random() - 0.5) * 16
        fringe += P(path().M(x, 40).Q(x + lean / 2, 40 + length / 2, x + lean, 40 + length).d(), `fill="none" stroke="${THREAD}" stroke-width="3" stroke-linecap="round"`)
      }

      return {
        body:
          rect(0, 0, 640, 44, `fill="${THREAD}"`) +
          stitches(10, 22, 630, 22, { color: INK, dash: 14, gap: 9, width: 4 }) +
          fringe,
      }
    },
  },
].map((g) => ({ ...g, category: 'details' }))
