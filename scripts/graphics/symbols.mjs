import {
  GOLD,
  INK,
  OX,
  P,
  PAPER,
  SILVER,
  circle,
  ellipse,
  linear,
  outlined,
  path,
  place,
  poly,
  radial,
  rect,
  ribbon,
  rng,
  starPoints,
  sym,
} from './draw.mjs'

const HEART = (T) => sym([0, -110], [['C', 30, -170, 170, -170, 170, -50], ['C', 170, 40, 60, 110, 0, 170]], T)

/** One feather pointing up from (0, 0). */
const feather = (T, w, L) => sym([0, -L], [['C', w * 0.62, -L * 0.94, w * 0.55, -L * 0.3, w * 0.3, 0]], T)

/** A right wing rooted at (0, 0): an arm rising right, feathers hanging off it. */
function wing({ span = 240, rows = [1, 0.68, 0.4], count = 9, fills = ['url(#f0)', 'url(#f1)', 'url(#f2)'] }) {
  const arm = (t) => [span * t, -span * 0.85 * Math.sin(Math.PI * t * 0.62)]
  const out = []
  rows.forEach((scale, row) => {
    const feathers = []
    for (let j = 0; j < count; j += 1) {
      const t = j / (count - 1)
      const [ax, ay] = arm(0.04 + t * 0.94)
      const angle = 105 - 45 * t
      const L = (90 + 150 * Math.pow(t, 0.9)) * scale
      const T = place(ax, ay, angle + 90)
      feathers.push(
        P(feather(T, 48 - row * 8, L), `fill="${fills[row]}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`) +
          P(path(T).M(0, -8).L(0, -L * 0.82).d(), `fill="none" stroke="${INK}" stroke-width="2" opacity="0.4"`),
      )
    }
    out.push(feathers.join(''))
  })
  const band = []
  for (let i = 0; i <= 40; i += 1) band.push(arm(i / 40))
  out.push(P(ribbon(band, (t) => 40 - 26 * t), `fill="${fills[2]}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`))
  return out.join('')
}

const featherDefs = linear('f0', ['#ffffff', '#e4e0d6', '#b9b2a2']) + linear('f1', ['#ffffff', '#ece8de', '#c9c2b2']) + linear('f2', ['#ffffff', '#f4f1ea', '#d6d0c2'])

export const SYMBOLS = [
  {
    id: 'logo-crown',
    label: 'Crown',
    tags: ['crown', 'king', 'queen', 'royal', 'gold', 'jewel', 'luxury'],
    width: 480,
    height: 380,
    draw() {
      const T = place(240, 300)
      const body = sym(
        [0, -170],
        [
          ['C', 10, -130, 30, -90, 46, -60],
          ['C', 70, -100, 95, -130, 112, -150],
          ['C', 120, -110, 135, -80, 150, -54],
          ['C', 170, -80, 185, -110, 200, -130],
          ['C', 196, -80, 190, -40, 186, 0],
          ['L', 0, 0],
        ],
        T,
      )
      const tips = [[240, 130], [128, 150], [352, 150], [40, 170], [440, 170]]
      const jewels = [
        [120, '#1f5fae'],
        [180, '#1f8a4c'],
        [240, '#b3123a'],
        [300, '#1f8a4c'],
        [360, '#1f5fae'],
      ]
      return {
        defs:
          linear('g', GOLD, [40, 120, 440, 360], true) +
          radial('v', ['#a8324a', OX, '#3a0a12'], [0.5, 0.7, 0.7]) +
          radial('jw', ['#ffffff', '#ffffff00'], [0.35, 0.3, 0.5]),
        body:
          P(path().M(96, 300).C(96, 150, 384, 150, 384, 300).Z().d(), `fill="url(#v)" stroke="${INK}" stroke-width="6"`) +
          outlined(P(body) + rect(48, 290, 384, 58, 'rx="10"'), 'url(#g)', { width: 6 }) +
          tips.map(([x, y]) => circle(x, y, 15, `fill="${PAPER}" stroke="${INK}" stroke-width="5"`)).join('') +
          tips.map(([x, y]) => circle(x - 4, y - 5, 5, 'fill="#fff"')).join('') +
          `<g fill="none" stroke="#9a6a14" stroke-width="3">${rect(58, 298, 364, 42, 'rx="6"')}</g>` +
          jewels.map(([x, c]) => ellipse(x, 319, 18, 14, `fill="${c}" stroke="${INK}" stroke-width="4"`) + ellipse(x - 5, 314, 7, 4, 'fill="#fff" opacity="0.75"')).join('') +
          [150, 210, 270, 330].map((x) => circle(x, 319, 5, `fill="${PAPER}" stroke="${INK}" stroke-width="2"`)).join(''),
      }
    },
  },
  {
    id: 'star-five',
    label: 'Gold Star',
    tags: ['star', 'five point', 'gold', 'award', 'celebrity'],
    width: 500,
    height: 500,
    draw() {
      const pts = starPoints(5, 236, 96).map(([x, y]) => [250 + x, 268 + y])
      const facets = pts.map((p, i) => P(poly([[250, 268], p, pts[(i + 1) % pts.length]]), `fill="${i % 2 ? '#b07c1c' : '#f4d57e'}"`))
      return {
        defs: linear('g', GOLD, [0, 0, 1, 1]),
        body: outlined(P(poly(pts)), 'url(#g)', { width: 7 }) + facets.join('') + P(poly(pts), `fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`),
      }
    },
  },
  {
    id: 'star-nautical',
    label: 'Nautical Star',
    tags: ['star', 'nautical', 'tattoo', 'sailor', 'punk', 'compass'],
    width: 500,
    height: 500,
    draw() {
      const pts = starPoints(5, 236, 96).map(([x, y]) => [250 + x, 268 + y])
      const facets = pts.map((p, i) => P(poly([[250, 268], p, pts[(i + 1) % pts.length]]), `fill="${i % 2 ? INK : '#c3161c'}" stroke="${PAPER}" stroke-width="3" stroke-linejoin="round"`))
      return { body: facets.join('') + P(poly(pts), `fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"`) }
    },
  },
  {
    id: 'star-sparkle',
    label: 'Sparkle',
    tags: ['star', 'sparkle', 'shine', 'glitter', 'twinkle', 'glam'],
    width: 500,
    height: 500,
    draw() {
      const spark = (cx, cy, R, k = 0.12) =>
        path()
          .M(cx, cy - R)
          .Q(cx + R * k, cy - R * k, cx + R, cy)
          .Q(cx + R * k, cy + R * k, cx, cy + R)
          .Q(cx - R * k, cy + R * k, cx - R, cy)
          .Q(cx - R * k, cy - R * k, cx, cy - R)
          .Z()
          .d()
      return {
        defs: radial('s', ['#ffffff', '#fff2bf', '#efc560', '#b07c1c'], [0.5, 0.5, 0.6]),
        body: outlined(P(spark(220, 270, 200)) + P(spark(400, 110, 78)) + P(spark(410, 400, 52)) + P(spark(90, 90, 40)), 'url(#s)', { width: 6 }),
      }
    },
  },
  {
    id: 'heart',
    label: 'Heart',
    tags: ['heart', 'love', 'valentine', 'red', 'romance'],
    width: 460,
    height: 420,
    draw() {
      return {
        defs: radial('h', ['#ff7a7a', '#d7262e', '#7d0d14'], [0.35, 0.3, 0.8]),
        body:
          outlined(P(HEART(place(230, 210, 0, 1.18))), 'url(#h)', { width: 7 }) +
          ellipse(140, 120, 46, 22, 'fill="#fff" opacity="0.6" transform="rotate(-35 140 120)"') +
          circle(186, 96, 8, 'fill="#fff" opacity="0.8"'),
      }
    },
  },
  {
    id: 'heart-winged',
    label: 'Winged Heart',
    tags: ['heart', 'wings', 'love', 'tattoo', 'angel', 'flight'],
    width: 640,
    height: 360,
    draw() {
      return {
        defs: featherDefs + radial('h', ['#ff7a7a', '#d7262e', '#7d0d14'], [0.35, 0.3, 0.8]),
        body:
          `<g transform="translate(350 170) scale(0.9)">${wing({ span: 200 })}</g>` +
          `<g transform="translate(290 170) scale(-0.9 0.9)">${wing({ span: 200 })}</g>` +
          outlined(P(HEART(place(320, 190, 0, 0.66))), 'url(#h)', { width: 6 }) +
          ellipse(282, 146, 24, 11, 'fill="#fff" opacity="0.6" transform="rotate(-35 282 146)"'),
      }
    },
  },
  {
    id: 'wings',
    label: 'Wings',
    tags: ['wings', 'angel', 'feather', 'flight', 'freedom'],
    width: 640,
    height: 360,
    draw() {
      return {
        defs: featherDefs,
        body:
          `<g transform="translate(336 190) scale(0.9)">${wing({ span: 200 })}</g>` +
          `<g transform="translate(304 190) scale(-0.9 0.9)">${wing({ span: 200 })}</g>` +
          ellipse(320, 200, 22, 46, `fill="${PAPER}" stroke="${INK}" stroke-width="5"`),
      }
    },
  },
  {
    id: 'skull',
    label: 'Skull',
    tags: ['skull', 'skeleton', 'death', 'punk', 'rock', 'gothic', 'halloween'],
    width: 440,
    height: 520,
    draw() {
      const T = place(220, 250)
      const head = sym(
        [0, -215],
        [
          ['C', 125, -215, 182, -130, 176, -30],
          ['C', 174, 20, 150, 60, 136, 82],
          ['C', 126, 100, 112, 108, 98, 116],
          ['L', 96, 178],
          ['C', 92, 220, 50, 240, 0, 240],
        ],
        T,
      )
      const eye = (sx) =>
        P(
          path(place(220 + sx * 70, 266, sx * 8))
            .M(-52, -6)
            .C(-52, -50, 52, -56, 54, -8)
            .C(56, 34, 18, 46, 0, 46)
            .C(-30, 46, -52, 30, -52, -6)
            .Z()
            .d(),
        )
      const nose = sym([0, 318], [['C', 10, 318, 30, 358, 24, 372], ['C', 18, 380, 6, 374, 0, 364]], place(220, 0))
      const teeth = []
      for (let i = 0; i < 7; i += 1) {
        const x = 160 + i * 17.5
        teeth.push(rect(x, 400, 16, 30, `rx="5" fill="${PAPER}" stroke="${INK}" stroke-width="3"`))
        teeth.push(rect(x, 432, 16, 28, `rx="5" fill="#efe6d2" stroke="${INK}" stroke-width="3"`))
      }
      return {
        defs: radial('b', ['#fffdf6', '#efe6d2', '#c9bb9c'], [0.45, 0.35, 0.7]),
        body:
          outlined(P(head), 'url(#b)', { width: 7 }) +
          ellipse(110, 160, 20, 46, 'fill="#c9bb9c" opacity="0.5" transform="rotate(20 110 160)"') +
          ellipse(330, 160, 20, 46, 'fill="#c9bb9c" opacity="0.5" transform="rotate(-20 330 160)"') +
          `<g fill="${INK}">${eye(-1)}${eye(1)}${P(nose)}</g>` +
          ellipse(140, 262, 10, 6, 'fill="#fff" opacity="0.25"') +
          rect(150, 394, 140, 72, `rx="14" fill="${INK}"`) +
          teeth.join('') +
          P(path().M(250, 48).L(238, 82).L(256, 100).L(244, 132).d(), `fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"`),
      }
    },
  },
  {
    id: 'lightning',
    label: 'Lightning Bolt',
    tags: ['lightning', 'bolt', 'electric', 'energy', 'storm', 'power'],
    width: 420,
    height: 560,
    draw() {
      const bolt = [[262, 20], [92, 312], [196, 312], [136, 540], [340, 214], [230, 214], [330, 20]]
      const shine = [[268, 52], [146, 284], [228, 284], [190, 430], [300, 236], [196, 236], [292, 52]]
      return {
        defs: linear('y', ['#fff6c2', '#ffd84d', '#f5a312'], [0, 0, 1, 1]),
        body: outlined(P(poly(bolt)), 'url(#y)', { width: 8 }) + P(poly(shine), 'fill="#fffbe8" opacity="0.55"'),
      }
    },
  },
  {
    id: 'moon',
    label: 'Crescent Moon',
    tags: ['moon', 'crescent', 'night', 'stars', 'celestial', 'mystic'],
    width: 500,
    height: 500,
    draw() {
      const stars = [[392, 120, 30], [430, 250, 18], [360, 380, 22]]
        .map(([x, y, r]) => P(poly(starPoints(5, r, r * 0.42), place(x, y))))
        .join('')
      return {
        defs:
          `<mask id="cut"><rect width="500" height="500" fill="#fff"/>${circle(320, 210, 168, 'fill="#000"')}</mask>` +
          `<clipPath id="disc">${circle(230, 260, 200)}</clipPath>` +
          radial('m', ['#ffffff', '#f2ecd6', '#c8bd96'], [0.3, 0.6, 0.8]),
        body:
          `<g mask="url(#cut)">${circle(230, 260, 200, `fill="url(#m)" stroke="${INK}" stroke-width="12"`)}${circle(110, 300, 26, 'fill="#d9cfaa"')}${circle(150, 400, 16, 'fill="#d9cfaa"')}${circle(90, 200, 12, 'fill="#d9cfaa"')}</g>` +
          `<g clip-path="url(#disc)">${circle(320, 210, 168, `fill="none" stroke="${INK}" stroke-width="12"`)}</g>` +
          outlined(stars, '#efc560', { width: 4 }),
      }
    },
  },
  {
    id: 'sun',
    label: 'Sun',
    tags: ['sun', 'sunshine', 'rays', 'summer', 'celestial', 'boho'],
    width: 520,
    height: 520,
    draw() {
      const rays = []
      for (let i = 0; i < 16; i += 1) {
        const T = place(260, 260, i * 22.5)
        if (i % 2 === 0) {
          rays.push(P(poly([[-20, -100], [0, -250], [20, -100]], T)))
        } else {
          const pts = []
          for (let s = 0; s <= 30; s += 1) {
            const t = s / 30
            pts.push(T(14 * Math.sin(t * Math.PI * 3), -100 - 110 * t))
          }
          rays.push(P(ribbon(pts, (t) => 26 * (1 - t) + 4)))
        }
      }
      return {
        defs: radial('s', ['#fffbe8', '#ffd84d', '#f5a312', '#d9751a'], [0.45, 0.4, 0.65]) + linear('r', GOLD, [0, 0, 1, 1]),
        body:
          outlined(rays.join(''), 'url(#r)', { width: 5 }) +
          circle(260, 260, 112, `fill="url(#s)" stroke="${INK}" stroke-width="7"`) +
          circle(260, 260, 90, `fill="none" stroke="#d9751a" stroke-width="3" stroke-dasharray="4 10"`),
      }
    },
  },
  {
    id: 'anchor',
    label: 'Anchor',
    tags: ['anchor', 'nautical', 'sailor', 'sea', 'tattoo', 'navy'],
    width: 440,
    height: 560,
    draw() {
      const arc = []
      for (let i = 0; i <= 60; i += 1) {
        const a = Math.PI * (0.08 + 0.84 * (i / 60))
        arc.push([220 + 160 * Math.cos(a), 330 + 160 * Math.sin(a)])
      }
      const fluke = (x, y, angle) => P(poly([[0, -46], [30, 22], [0, 8], [-30, 22]], place(x, y, angle)))
      const [lx, ly] = arc[arc.length - 1]
      const [rx, ry] = arc[0]
      const metal =
        P(ribbon(arc, (t) => 26 + 18 * Math.sin(Math.PI * t))) +
        rect(204, 110, 32, 390) +
        rect(110, 150, 220, 30, 'rx="10"') +
        circle(110, 165, 22) +
        circle(330, 165, 22) +
        fluke(lx, ly, -40) +
        fluke(rx, ry, 40) +
        P(poly([[-34, 0], [0, -38], [34, 0], [0, 16]], place(220, 506)))
      const ring = P(path().M(220, 30).C(270, 30, 270, 110, 220, 110).C(170, 110, 170, 30, 220, 30).Z().d(), `fill="none" stroke="${INK}" stroke-width="30"`) + P(path().M(220, 30).C(270, 30, 270, 110, 220, 110).C(170, 110, 170, 30, 220, 30).Z().d(), `fill="none" stroke="url(#s)" stroke-width="16"`)
      const rope = path().M(220, 92).C(320, 120, 300, 200, 220, 230).C(140, 260, 120, 330, 220, 360).C(300, 390, 310, 440, 260, 470).d()
      return {
        defs: linear('s', ['#5a606b', '#30343c', '#15171c', '#4a4f59'], [0, 0, 1, 1]) + linear('s2', SILVER, [0, 0, 1, 1]),
        body:
          ring +
          outlined(metal, 'url(#s)', { width: 6 }) +
          P(rope, `fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"`) +
          P(rope, `fill="none" stroke="#c4a15a" stroke-width="10" stroke-linecap="round"`) +
          P(rope, `fill="none" stroke="#7a5a22" stroke-width="10" stroke-dasharray="3 9"`),
      }
    },
  },
  {
    id: 'gem',
    label: 'Diamond Gem',
    tags: ['diamond', 'gem', 'jewel', 'crystal', 'bling', 'luxury'],
    width: 500,
    height: 440,
    draw() {
      const girdle = Array.from({ length: 9 }, (_, i) => [30 + i * 55, 150])
      const table = Array.from({ length: 5 }, (_, i) => [150 + i * 50, 60])
      const tip = [250, 410]
      const random = rng(7)
      const shades = ['#e8f6ff', '#bfe3fb', '#8cc8f0', '#5aa6dd', '#d7f0ff', '#a6d6f5']
      const facets = []
      const shade = () => shades[Math.floor(random() * shades.length)]
      facets.push(P(poly([table[0], table[4], [table[4][0], 60], [table[0][0], 60]]), `fill="${shades[0]}"`))
      for (let i = 0; i < 8; i += 1) {
        const top = table[Math.min(4, Math.round(i / 2))]
        facets.push(P(poly([girdle[i], girdle[i + 1], top]), `fill="${shade()}"`))
        facets.push(P(poly([girdle[i], girdle[i + 1], tip]), `fill="${shade()}"`))
      }
      for (let i = 0; i < 4; i += 1) facets.push(P(poly([table[i], table[i + 1], girdle[i * 2 + 1]]), `fill="${shade()}"`))
      const outline = [[30, 150], [150, 60], [350, 60], [470, 150], tip]
      return {
        body:
          outlined(P(poly(outline)), '#bfe3fb', { width: 7 }) +
          `<g stroke="#ffffff" stroke-width="2" stroke-linejoin="round">${facets.join('')}</g>` +
          P(poly(outline), `fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"`) +
          P(poly(starPoints(4, 34, 6), place(170, 96)), 'fill="#fff"'),
      }
    },
  },
  {
    id: 'laurel',
    label: 'Laurel Wreath',
    tags: ['laurel', 'wreath', 'victory', 'leaves', 'gold', 'award', 'classic'],
    width: 520,
    height: 460,
    draw() {
      const leaf = (T) => sym([0, -92], [['C', 30, -74, 34, -22, 0, 0]], T)
      const branch = (side) => {
        const leaves = []
        for (let i = 0; i < 10; i += 1) {
          const t = 0.06 + i * 0.09
          const a = Math.PI / 2 + side * Math.PI * 0.86 * t
          const x = 260 + 180 * Math.cos(a)
          const y = 230 + 180 * Math.sin(a)
          const growth = (Math.atan2(side * Math.cos(a), -side * Math.sin(a)) * 180) / Math.PI + 90
          const size = 1 - t * 0.35
          leaves.push(P(leaf(place(x, y, growth - 38 * side, size))))
          leaves.push(P(leaf(place(x, y, growth + 30 * side, size * 0.92))))
        }
        const [tx, ty] = [260 + 180 * Math.cos(Math.PI / 2 + side * Math.PI * 0.9), 230 + 180 * Math.sin(Math.PI / 2 + side * Math.PI * 0.9)]
        leaves.push(P(leaf(place(tx, ty, (Math.atan2(side * Math.cos(Math.PI / 2 + side * Math.PI * 0.9), -side * Math.sin(Math.PI / 2 + side * Math.PI * 0.9)) * 180) / Math.PI + 90, 0.6))))
        return leaves.join('')
      }
      const stem = (side) => {
        const pts = []
        for (let i = 0; i <= 40; i += 1) {
          const a = Math.PI / 2 + side * Math.PI * 0.9 * (i / 40)
          pts.push([260 + 180 * Math.cos(a), 230 + 180 * Math.sin(a)])
        }
        return P(ribbon(pts, (t) => 10 - 6 * t))
      }
      const bow = P(path().M(260, 420).C(200, 380, 180, 450, 230, 440).Z().M(260, 420).C(320, 380, 340, 450, 290, 440).Z().d()) + P(poly([[250, 420], [215, 455], [235, 458], [255, 430], [275, 458], [295, 455], [270, 420]]))
      return {
        defs: linear('g', GOLD, [0, 0, 1, 1]),
        body: outlined(stem(1) + stem(-1) + branch(1) + branch(-1), 'url(#g)', { width: 4 }) + outlined(bow + circle(260, 422, 14), OX, { width: 4 }),
      }
    },
  },
  {
    id: 'compass',
    label: 'Compass Rose',
    tags: ['compass', 'rose', 'navigation', 'map', 'nautical', 'travel'],
    width: 500,
    height: 500,
    draw() {
      const ticks = []
      for (let i = 0; i < 72; i += 1) {
        const T = place(250, 250, i * 5)
        ticks.push(P(path(T).M(0, -200).L(0, i % 2 ? -190 : -182).d()))
      }
      const points = []
      for (let i = 0; i < 8; i += 1) {
        const long = i % 2 === 0
        const T = place(250, 250, i * 45)
        const r = long ? 232 : 150
        const s = long ? 34 : 26
        points.push({ long, half: [P(poly([[0, 0], [0, -r], [s, -s]], T), `fill="${long ? PAPER : '#c4a15a'}"`), P(poly([[0, 0], [0, -r], [-s, -s]], T), `fill="${long ? INK : OX}"`)] })
      }
      const shape = (long) => points.filter((p) => p.long === long).map((p) => p.half.join('')).join('')
      return {
        body:
          circle(250, 250, 200, `fill="${PAPER}" stroke="${INK}" stroke-width="6"`) +
          circle(250, 250, 176, `fill="none" stroke="${INK}" stroke-width="3"`) +
          `<g stroke="${INK}" stroke-width="3">${ticks.join('')}</g>` +
          `<g stroke="${INK}" stroke-width="4" stroke-linejoin="round">${shape(false)}${shape(true)}</g>` +
          circle(250, 250, 16, `fill="#c4a15a" stroke="${INK}" stroke-width="4"`),
      }
    },
  },
  {
    id: 'suit-spade',
    label: 'Spade',
    tags: ['spade', 'cards', 'poker', 'casino', 'ace', 'suit'],
    width: 420,
    height: 480,
    draw() {
      const spade = sym([0, -210], [['C', 50, -130, 190, -80, 176, 30], ['C', 166, 110, 70, 126, 22, 70], ['C', 30, 140, 60, 190, 100, 210], ['L', 0, 210]], place(210, 240))
      return {
        defs: radial('k', ['#4a4f59', '#1a1c22', '#08090b'], [0.35, 0.3, 0.8]),
        body: outlined(P(spade), 'url(#k)', { width: 5 }) + ellipse(140, 180, 30, 14, 'fill="#fff" opacity="0.35" transform="rotate(-40 140 180)"'),
      }
    },
  },
  {
    id: 'suit-club',
    label: 'Club',
    tags: ['club', 'cards', 'poker', 'casino', 'clover', 'suit'],
    width: 440,
    height: 480,
    draw() {
      const club = circle(220, 130, 96) + circle(118, 270, 96) + circle(322, 270, 96) + rect(190, 160, 60, 140) + P(sym([0, 260], [['C', 20, 330, 50, 400, 100, 440], ['L', 0, 440]], place(220, 0)))
      return {
        defs: radial('k', ['#4a4f59', '#1a1c22', '#08090b'], [0.35, 0.3, 0.8]),
        body: outlined(club, 'url(#k)', { width: 5 }) + ellipse(180, 80, 26, 12, 'fill="#fff" opacity="0.35" transform="rotate(-35 180 80)"'),
      }
    },
  },
  {
    id: 'suit-diamond',
    label: 'Diamond Suit',
    tags: ['diamond', 'cards', 'poker', 'casino', 'red', 'suit'],
    width: 380,
    height: 500,
    draw() {
      const d = sym([0, -230], [['C', 50, -140, 110, -60, 160, 0], ['C', 110, 60, 50, 140, 0, 230]], place(190, 250))
      return {
        defs: radial('r', ['#ff7a7a', '#d7262e', '#7d0d14'], [0.4, 0.35, 0.8]),
        body: outlined(P(d), 'url(#r)', { width: 6 }) + P(sym([0, -170], [['C', 30, -110, 70, -50, 100, 0], ['L', 0, 0]], place(190, 250)), 'fill="#fff" opacity="0.18"'),
      }
    },
  },
  {
    id: 'infinity',
    label: 'Infinity',
    tags: ['infinity', 'forever', 'loop', 'eternal', 'symbol'],
    width: 600,
    height: 320,
    draw() {
      const at = (t) => {
        const s = Math.sin(t)
        const c = Math.cos(t)
        const k = 1 + s * s
        return [300 + (250 * c) / k, 160 + (250 * s * c) / k]
      }
      const all = []
      for (let i = 0; i <= 200; i += 1) all.push(at((i / 200) * Math.PI * 2))
      const over = []
      for (let i = 0; i <= 20; i += 1) over.push(at(Math.PI / 2 - 0.4 + (i / 20) * 0.8))
      const line = (pts, extra, cap = 'round') => P(poly(pts, undefined, false), `fill="none" stroke-linecap="${cap}" stroke-linejoin="round" ${extra}`)
      return {
        defs: linear('g', GOLD, [40, 40, 560, 280], true),
        body:
          line(all, `stroke="${INK}" stroke-width="52"`) +
          line(all, 'stroke="url(#g)" stroke-width="36"') +
          line(over, `stroke="${INK}" stroke-width="52"`, 'butt') +
          line(over, 'stroke="url(#g)" stroke-width="36"', 'butt') +
          line(all, 'stroke="#fff" stroke-width="5" opacity="0.5" stroke-dasharray="80 60"'),
      }
    },
  },
  {
    id: 'eye',
    label: 'Eye',
    tags: ['eye', 'vision', 'mystic', 'see', 'iris', 'evil eye'],
    width: 600,
    height: 360,
    draw() {
      const almond = path().M(40, 190).C(160, 50, 440, 50, 560, 190).C(440, 320, 160, 320, 40, 190).Z().d()
      const lines = []
      for (let i = 0; i < 36; i += 1) {
        const T = place(300, 186, i * 10)
        lines.push(P(path(T).M(0, -42).L(0, -86).d()))
      }
      const lashes = []
      for (let i = 0; i < 9; i += 1) {
        const t = 0.12 + i * 0.095
        const x = 40 + 520 * t
        const y = 190 - 4 * 140 * t * (1 - t) * 0.98
        lashes.push(P(path().M(x, y).L(x + (t - 0.5) * 50, y - 34 - 10 * Math.sin(Math.PI * t)).d()))
      }
      return {
        defs: `<clipPath id="a"><path d="${almond}"/></clipPath>` + radial('i', ['#7fd1c6', '#1f8a8a', '#0d4a52'], [0.5, 0.5, 0.5]),
        body:
          `<g stroke="${INK}" stroke-width="7" stroke-linecap="round">${lashes.join('')}</g>` +
          P(almond, `fill="${PAPER}"`) +
          `<g clip-path="url(#a)">${circle(300, 186, 96, 'fill="url(#i)"')}<g stroke="#0d4a52" stroke-width="3" opacity="0.6">${lines.join('')}</g>${circle(300, 186, 96, `fill="none" stroke="${INK}" stroke-width="6"`)}${circle(300, 186, 40, `fill="${INK}"`)}${circle(276, 160, 16, 'fill="#fff"')}${circle(326, 212, 7, 'fill="#fff" opacity="0.8"')}</g>` +
          P(almond, `fill="none" stroke="${INK}" stroke-width="9"`),
      }
    },
  },
  {
    id: 'fleur-de-lis',
    label: 'Fleur-de-lis',
    tags: ['fleur de lis', 'lily', 'heraldry', 'royal', 'french', 'gold'],
    width: 440,
    height: 540,
    draw() {
      const T = place(220, 300)
      const center = sym([0, -270], [['C', 48, -220, 84, -130, 56, -40], ['C', 46, -10, 22, 12, 0, 22]], T)
      const side = (T2) => path(T2).M(34, -18).C(70, -140, 220, -160, 206, -40).C(200, 6, 150, 16, 128, -18).C(150, -54, 118, -84, 88, -54).C(66, -32, 56, 0, 44, 34).Z().d()
      const mirror = place(220, 300, 0, -1, 1)
      const band = rect(110, 316, 220, 40, 'rx="10"')
      const foot = sym([0, 56], [['C', 34, 56, 60, 100, 110, 128], ['C', 70, 140, 30, 128, 0, 104]], T)
      return {
        defs: linear('g', GOLD, [40, 20, 400, 520], true),
        body:
          outlined(P(center) + P(side(T)) + P(side(mirror)) + P(foot) + band, 'url(#g)', { width: 6 }) +
          P(sym([0, -230], [['C', 18, -190, 30, -120, 16, -40], ['L', 0, -30]], T), 'fill="#9a6a14" opacity="0.5"'),
      }
    },
  },
  {
    id: 'yin-yang',
    label: 'Yin Yang',
    tags: ['yin yang', 'balance', 'harmony', 'zen', 'taoism'],
    width: 480,
    height: 480,
    draw() {
      const dark = path().M(240, 40).A(200, 0, 1, 240, 440).A(100, 0, 1, 240, 240).A(100, 0, 0, 240, 40).Z().d()
      return {
        body:
          circle(240, 240, 200, `fill="${PAPER}"`) +
          P(dark, `fill="${INK}"`) +
          circle(240, 140, 32, `fill="${INK}"`) +
          circle(240, 340, 32, `fill="${PAPER}"`) +
          circle(240, 240, 200, `fill="none" stroke="${INK}" stroke-width="10"`),
      }
    },
  },
].map((g) => ({ ...g, category: 'symbols' }))
