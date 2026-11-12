import {
  BRASS,
  GOLD,
  INK,
  OX,
  P,
  PAPER,
  circle,
  linear,
  outlined,
  path,
  place,
  poly,
  ribbon,
  ringPath,
  swell,
  sym,
  turtle,
} from './draw.mjs'

/** A calligraphic stroke: a curve from a heading, thick in the middle. */
function stroke({ x, y, heading, length, k, width = 14, min = 1.5, steps = 140 }) {
  return P(ribbon(turtle({ x, y, heading, length, k, steps }), swell(width, min)))
}

/** A stroke that runs out and winds into a spiral at its end. */
const curl = (start, rate, sign = 1) => (s) => (s > start ? sign * (s - start) * rate : 0)

const mirrorX = (width, inner) => `<g transform="translate(${width} 0) scale(-1 1)">${inner}</g>`

export const ORNAMENTS = [
  {
    id: 'orn-fleuron',
    label: 'Fleuron',
    tags: ['fleuron', 'hedera', 'leaf', 'printer', 'typographic', 'dingbat'],
    width: 480,
    height: 440,
    draw() {
      const T = place(290, 220, -125, 0.78)
      const leaf = sym([0, -120], [['C', 40, -175, 175, -160, 162, -40], ['C', 150, 40, 60, 110, 0, 175]], T)
      const veins = [-1, 1]
        .map((side) => P(path(T).M(0, -90).Q(side * 60, -60, side * 110, -40).M(0, -20).Q(side * 50, 10, side * 90, 30).d()))
        .join('')
      const [sx, sy] = T(0, -120)
      const stem = turtle({ x: sx, y: sy, heading: 190, length: 340, k: curl(40, 0.0003, 1), steps: 140 })
      return {
        body:
          P(ribbon(stem, (t) => 16 * (1 - t) + 3), `fill="${INK}"`) +
          P(leaf, `fill="${INK}"`) +
          `<g fill="none" stroke="${PAPER}" stroke-width="4" stroke-linecap="round">${P(path(T).M(0, -100).Q(6, 30, 0, 150).d())}${veins}</g>`,
      }
    },
  },
  {
    id: 'orn-divider',
    label: 'Flourish Divider',
    tags: ['divider', 'flourish', 'swirl', 'calligraphy', 'vintage', 'scroll'],
    width: 800,
    height: 220,
    draw() {
      const half =
        stroke({ x: 430, y: 110, heading: -4, length: 330, k: (s) => (s < 200 ? 0.0012 * Math.sin(s / 40) : -(s - 200) * 0.00055), width: 16 }) +
        stroke({ x: 450, y: 112, heading: 30, length: 190, k: curl(60, 0.0011, -1), width: 10 }) +
        stroke({ x: 470, y: 106, heading: -40, length: 150, k: curl(40, 0.0016, 1), width: 8 }) +
        circle(700, 70, 6) +
        circle(560, 150, 5)
      const diamond = poly([[400, 70], [436, 110], [400, 150], [364, 110]])
      return {
        body: `<g fill="${INK}">${half}${mirrorX(800, half)}</g>` + outlined(P(diamond), OX, { width: 4 }) + P(poly([[400, 92], [418, 110], [400, 128], [382, 110]]), `fill="${BRASS}"`),
      }
    },
  },
  {
    id: 'orn-corner',
    label: 'Corner Flourish',
    tags: ['corner', 'flourish', 'frame', 'border', 'vintage', 'ornament'],
    width: 480,
    height: 480,
    draw() {
      const arm =
        stroke({ x: 60, y: 60, heading: 0, length: 400, k: (s) => (s < 260 ? 0.0009 * Math.sin(s / 50) : (s - 260) * 0.00055), width: 24 }) +
        stroke({ x: 110, y: 68, heading: 24, length: 220, k: curl(40, 0.0012, -1), width: 14 }) +
        stroke({ x: 200, y: 56, heading: -20, length: 120, k: curl(20, 0.003, 1), width: 8 }) +
        circle(250, 112, 7)
      const flip = `<g transform="matrix(0 1 1 0 0 0)">${arm}</g>`
      return {
        body:
          `<g fill="${INK}">${arm}${flip}</g>` +
          outlined(P(sym([0, -40], [['C', 26, -30, 30, 10, 0, 40]], place(60, 60, -45))), OX, { width: 4 }) +
          circle(60, 60, 12, `fill="${BRASS}" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'orn-asterism',
    label: 'Asterism',
    tags: ['asterism', 'asterisk', 'star', 'typographic', 'dingbat', 'divider'],
    width: 480,
    height: 440,
    draw() {
      const asterisk = (cx, cy, r) =>
        Array.from({ length: 6 }, (_, i) => P(sym([0, -r], [['C', r * 0.28, -r, r * 0.22, -r * 0.3, 0, 0]], place(cx, cy, i * 60)))).join('')
      return { body: `<g fill="${INK}">${asterisk(240, 120, 100)}${asterisk(130, 320, 100)}${asterisk(350, 320, 100)}</g>` }
    },
  },
  {
    id: 'orn-banner',
    label: 'Ribbon Banner',
    tags: ['banner', 'ribbon', 'scroll', 'label', 'tattoo', 'vintage'],
    width: 760,
    height: 300,
    draw() {
      const band = path().M(120, 90).Q(380, 40, 640, 90).L(640, 200).Q(380, 150, 120, 200).Z().d()
      const tail = (sx) =>
        `<g transform="translate(${sx ? 760 : 0} 0) scale(${sx ? -1 : 1} 1)">` +
        P(path().M(150, 130).L(20, 140).L(70, 190).L(20, 245).L(170, 240).Z().d(), `fill="url(#rd)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
        P(path().M(120, 200).L(170, 240).L(170, 190).Z().d(), `fill="#5a0a14" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
        '</g>'
      return {
        defs: linear('r', ['#e2444b', '#c3161c', '#8e0f1e']) + linear('rd', ['#a8101a', '#7d0d14']),
        body:
          tail(false) +
          tail(true) +
          P(band, `fill="url(#r)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"`) +
          P(path().M(134, 106).Q(380, 58, 626, 106).M(134, 184).Q(380, 136, 626, 184).d(), `fill="none" stroke="${BRASS}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'orn-cartouche',
    label: 'Cartouche Frame',
    tags: ['frame', 'cartouche', 'oval', 'baroque', 'gold', 'badge'],
    width: 520,
    height: 460,
    draw() {
      const oval = (rx, ry) => `M${260 - rx} 230A${rx} ${ry} 0 1 1 ${260 + rx} 230A${rx} ${ry} 0 1 1 ${260 - rx} 230Z`
      const scroll = (cx, cy, angle) =>
        stroke({ x: cx, y: cy, heading: angle, length: 120, k: curl(10, 0.0045, 1), width: 16 }) +
        stroke({ x: cx, y: cy, heading: angle + 180, length: 120, k: curl(10, 0.0045, -1), width: 16 })
      return {
        defs: linear('g', GOLD, [0, 0, 1, 1]),
        body:
          outlined(
            P(oval(200, 160) + oval(170, 132), 'fill-rule="evenodd"') + scroll(260, 62, 0) + scroll(260, 398, 180) + scroll(52, 230, 90) + scroll(468, 230, -90),
            'url(#g)',
            { width: 5 },
          ) +
          P(oval(166, 128), `fill="${PAPER}" stroke="${INK}" stroke-width="4"`) +
          P(oval(150, 112), `fill="none" stroke="${BRASS}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"`),
      }
    },
  },
  {
    id: 'orn-deco',
    label: 'Art Deco Fan',
    tags: ['art deco', 'fan', 'sunrise', 'gatsby', '1920s', 'divider', 'gold'],
    width: 760,
    height: 280,
    draw() {
      let fan = ''
      for (let i = 0; i < 13; i += 1) {
        const a = 180 + (i * 180) / 12
        const T = place(380, 230, a + 90)
        fan += P(poly([[-7, -40], [0, -200 + (i % 2) * 40], [7, -40]], T))
      }
      const steps = [0, 1, 2]
        .map((i) => rect2(380 - 240 - i * 40, 230 - i * 22, 160 + i * 40, 6) + rect2(380 + 80, 230 - i * 22, 160 + i * 40, 6))
        .join('')
      return {
        defs: linear('g', GOLD, [0, 0, 1, 1]),
        body:
          outlined(fan + P(`M220 236A160 160 0 0 1 540 236Z`) + steps + rect2(40, 234, 680, 10), 'url(#g)', { width: 4 }) +
          P(`M300 236A80 80 0 0 1 460 236Z`, `fill="${INK}"`) +
          P(`M330 236A50 50 0 0 1 430 236Z`, `fill="url(#g)"`) +
          [60, 700].map((x) => P(poly([[x, 222], [x + 12, 239], [x, 256], [x - 12, 239]]), `fill="${INK}"`)).join(''),
      }
    },
  },
  {
    id: 'orn-swash',
    label: 'Swash Underline',
    tags: ['swash', 'underline', 'calligraphy', 'script', 'signature', 'flourish'],
    width: 800,
    height: 240,
    draw() {
      const loop = turtle({ x: 90, y: 150, heading: -60, length: 900, k: (s) => (s < 300 ? 0.0244 : s < 820 ? 0.0012 * Math.sin((s - 300) / 90) : -0.012), steps: 260 })
      return { body: P(ribbon(loop, (t) => 2 + 20 * Math.pow(Math.sin(Math.PI * t), 1.1)), `fill="${INK}"`) }
    },
  },
  {
    id: 'orn-scroll',
    label: 'S-Scroll',
    tags: ['scroll', 'volute', 'baroque', 'iron', 'swirl', 'ornament'],
    width: 560,
    height: 420,
    draw() {
      const half = (sign) => P(ribbon(turtle({ x: 280, y: 210, heading: sign > 0 ? 0 : 180, length: 420, k: (s) => -(0.002 + s * 0.000062), steps: 160 }), (t) => 28 * (1 - t) + 4))
      return {
        defs: linear('m', ['#4a4f59', '#1a1c22', '#30343c']),
        body: outlined(half(1) + half(-1), 'url(#m)', { width: 4 }) + circle(280, 210, 16, `fill="${BRASS}" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'orn-rule',
    label: 'Diamond Rule',
    tags: ['rule', 'divider', 'line', 'diamond', 'typographic', 'border'],
    width: 800,
    height: 120,
    draw() {
      let marks = ''
      for (let i = 1; i <= 6; i += 1) {
        const s = 22 - i * 3
        for (const x of [400 - i * 52, 400 + i * 52]) {
          marks += i % 2 ? P(poly([[x, 60 - s], [x + s, 60], [x, 60 + s], [x - s, 60]])) : circle(x, 60, s * 0.55)
        }
      }
      return {
        body:
          P(path().M(30, 60).L(770, 60).d(), `stroke="${INK}" stroke-width="4"`) +
          P(path().M(110, 48).L(690, 48).M(110, 72).L(690, 72).d(), `stroke="${INK}" stroke-width="1.5"`) +
          `<g fill="${INK}">${marks}</g>` +
          outlined(P(poly([[400, 22], [438, 60], [400, 98], [362, 60]])), OX, { width: 4 }) +
          P(poly([[400, 42], [418, 60], [400, 78], [382, 60]]), `fill="${BRASS}"`),
      }
    },
  },
  {
    id: 'orn-rosette',
    label: 'Rosette',
    tags: ['rosette', 'dingbat', 'flower', 'medallion', 'typographic', 'star'],
    width: 480,
    height: 480,
    draw() {
      const drop = (T, w, L) => sym([0, -L], [['C', w * 0.2, -L * 0.8, w * 0.7, -L * 0.45, w * 0.45, -L * 0.15], ['C', w * 0.3, 0, w * 0.1, 0, 0, 0]], T)
      let outer = ''
      let inner = ''
      for (let i = 0; i < 12; i += 1) {
        outer += P(drop(place(240, 240, i * 30), 70, 220))
        inner += P(drop(place(240, 240, i * 30 + 15), 40, 120))
      }
      return {
        body:
          `<g fill="${INK}">${outer}</g>` +
          `<g fill="${OX}" stroke="${PAPER}" stroke-width="3">${inner}</g>` +
          P(ringPath(240, 240, 52), `fill="${PAPER}" stroke="${INK}" stroke-width="6"`) +
          circle(240, 240, 30, `fill="${BRASS}" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
].map((g) => ({ ...g, category: 'ornaments' }))

function rect2(x, y, w, h) {
  return P(poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]))
}
