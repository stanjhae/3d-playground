/**
 * The colour map behind every fabric `mapId`, served from public/fabrics/.
 * The scene loads them all (Garment.tsx); fabrics.test.ts checks that every
 * preset's map is listed here and that each file exists. The linen, satin,
 * jersey, chiffon and canvas maps are drawn by scripts/build-fabric-maps.mjs.
 */
export const FABRIC_MAP_SRC = {
  'cotton-weave': '/fabrics/cotton-weave.png',
  'silk-shine': '/fabrics/silk-shine.png',
  'wool-nap': '/fabrics/wool-nap.png',
  'denim-twill': '/fabrics/denim-twill.png',
  'leather-grain': '/fabrics/leather-grain.png',
  'linen-slub': '/fabrics/linen-slub.png',
  'satin-sheen': '/fabrics/satin-sheen.png',
  'jersey-knit': '/fabrics/jersey-knit.png',
  'chiffon-gauze': '/fabrics/chiffon-gauze.png',
  'canvas-duck': '/fabrics/canvas-duck.png',
} as const
