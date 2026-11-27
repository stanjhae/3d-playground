import type { CanonicalPattern, PatternPoint } from './pattern-document.ts'

/**
 * A four-piece tee in the stored form, for tests: front and back bodices,
 * a right sleeve and its mirror. It matches the cloth spike's tee.
 */
function bodice(neckDip: number): PatternPoint[] {
  return [
    { id: 'hemL', x: -260, y: 0 },
    { id: 'hemR', x: 260, y: 0 },
    { id: 'armR', x: 255, y: 440 },
    { id: 'armRm', x: 205, y: 520, k: 's' },
    { id: 'shR', x: 175, y: 640 },
    { id: 'neckR', x: 78, y: 680 },
    { id: 'neckC', x: 0, y: neckDip, k: 's', hi: [45, 0], ho: [-45, 0] },
    { id: 'neckL', x: -78, y: 680 },
    { id: 'shL', x: -175, y: 640 },
    { id: 'armLm', x: -205, y: 520, k: 's' },
    { id: 'armL', x: -255, y: 440 },
  ]
}

export function fixtureTeePattern(): CanonicalPattern {
  return {
    v: 1,
    basis: { templateId: 'tee-crew-short', templateVersion: 4, patternVersion: 1 },
    pieces: [
      {
        id: 'front',
        panel: 'front',
        label: 'Front',
        panelOrigin: [340, 40],
        outline: bodice(590),
        roles: { hem: ['hemL', 'hemR'], side: ['hemL', 'hemR'], armhole: ['armR', 'armL'], neck: ['neckR', 'neckC', 'neckL'] },
        place: { anchor: 'front', wrap: 'plane', offset: [0, -640, 100], rot: 0 },
      },
      {
        id: 'back',
        panel: 'back',
        label: 'Back',
        panelOrigin: [340, 40],
        outline: bodice(655),
        roles: { hem: ['hemL', 'hemR'], side: ['hemL', 'hemR'], armhole: ['armR', 'armL'] },
        place: { anchor: 'back', wrap: 'plane', offset: [0, -640, 100], rot: 0 },
      },
      {
        id: 'sleeveR',
        panel: 'right',
        label: 'Right sleeve',
        panelOrigin: [240, 20],
        outline: [
          { id: 'cuffL', x: -175, y: 0 },
          { id: 'cuffR', x: 175, y: 0 },
          { id: 'capR', x: 215, y: 180 },
          { id: 'capMid', x: 0, y: 245, k: 's', hi: [120, 0], ho: [-120, 0] },
          { id: 'capL', x: -215, y: 180 },
        ],
        roles: { cuff: ['cuffL', 'cuffR'] },
        place: { anchor: 'arm-right', wrap: 'cylinder', offset: [0, 30, 12], rot: 0 },
        fabric: 'jersey',
      },
      {
        id: 'sleeveL',
        panel: 'left',
        label: 'Left sleeve',
        panelOrigin: [240, 20],
        mirrorOf: 'sleeveR',
        place: { anchor: 'arm-left', wrap: 'cylinder', offset: [0, 30, 12], rot: 0 },
      },
    ],
    // Front piece +x and back piece −x are the wearer's left (+x). On both
    // sleeves the capR half faces the front.
    seams: [
      { id: 'sideL', kind: 'sew', a: { piece: 'front', from: 'hemR', to: 'armR' }, b: { piece: 'back', from: 'armL', to: 'hemL' } },
      { id: 'sideR', kind: 'sew', a: { piece: 'front', from: 'armL', to: 'hemL' }, b: { piece: 'back', from: 'hemR', to: 'armR' } },
      { id: 'shoulderL', kind: 'sew', a: { piece: 'front', from: 'shR', to: 'neckR' }, b: { piece: 'back', from: 'neckL', to: 'shL' } },
      { id: 'shoulderR', kind: 'sew', a: { piece: 'front', from: 'neckL', to: 'shL' }, b: { piece: 'back', from: 'shR', to: 'neckR' } },
      { id: 'capFrontL', kind: 'ease', a: { piece: 'front', from: 'armR', to: 'shR' }, b: { piece: 'sleeveL', from: 'capMid', to: 'capR' } },
      { id: 'capBackL', kind: 'ease', a: { piece: 'back', from: 'shL', to: 'armL' }, b: { piece: 'sleeveL', from: 'capL', to: 'capMid' } },
      { id: 'capFrontR', kind: 'ease', a: { piece: 'front', from: 'shL', to: 'armL' }, b: { piece: 'sleeveR', from: 'capR', to: 'capMid' } },
      { id: 'capBackR', kind: 'ease', a: { piece: 'back', from: 'armR', to: 'shR' }, b: { piece: 'sleeveR', from: 'capMid', to: 'capL' } },
      { id: 'underR', kind: 'sew', a: { piece: 'sleeveR', from: 'cuffR', to: 'capR' }, b: { piece: 'sleeveR', from: 'capL', to: 'cuffL' } },
      { id: 'underL', kind: 'sew', a: { piece: 'sleeveL', from: 'capR', to: 'cuffR' }, b: { piece: 'sleeveL', from: 'cuffL', to: 'capL' } },
    ],
  }
}
