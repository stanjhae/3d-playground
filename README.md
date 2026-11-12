# Fashion Leader Vote

The garment is the product. The building is the house.

Live (beta): [https://beta.fashionleadervote.com/](https://beta.fashionleadervote.com/)

## Develop

```bash
pnpm install
pnpm garments
pnpm stills
pnpm dev
```

`pnpm garments` rebuilds the jacket only. The seated Style3D forms stay in `public/models/` and must not be overwritten by the lathe scripts.

Open the local URL. You should see a gown in frame and **Fashion Leader Vote**.

```bash
pnpm test
pnpm build
```

`pnpm build` regenerates `src/routeTree.gen.ts` before typecheck.

## Persist the board

The one dashboard step: in the Vercel project, add a Redis store (Marketplace → Upstash / the KV env pair) and pull `KV_REST_API_URL` + `KV_REST_API_TOKEN`. The API keeps the same `/api/designs` shape. Local and tests use memory when those env values are missing. Seed looks always load.

## Assets

- `public/models/garment.glb` — White Evening Gown Dress by [Style3D CG](https://sketchfab.com/Style3DMeta), [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). [Source](https://sketchfab.com/3d-models/white-evening-gown-dress-1f77c65b1542428f89b10f538b771ce4). Do not overwrite this file.
- `public/models/slip.glb` — Black Dress by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/black-dress-b0b0e79eca3d4927b9bb25ded81221ec).
- `public/models/mixed.glb` — White shirt black leather skirt outfit by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/white-shirt-black-leather-skirt-outfit-9f9e3d05217a4f969cd08224ad0b0aee).
- `public/models/coat.glb` — Black jacket coat by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/black-jacket-coat-2181e25803164fd690c0debb4d4f391a).
- `public/models/suit.glb` — White Suit Set by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/white-suit-set-46111b5492f944bd862b8ca9ca4ba78b).
- `public/models/hoodie.glb` — Green and white hoodie by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/green-and-white-hoodie-af100701826e4bb9abc1ff1a1d24ab1e).
- `public/models/overall.glb` — Black Denim Overall Dress by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/black-denim-overall-dress-09c6f4cdafee4ed2a566affa4cbebf66).
- `public/models/tailored.glb` — Man Black Business Suit by Style3D CG, CC BY 4.0. [Source](https://sketchfab.com/3d-models/man-black-business-suit-7a669a06fb954d459985ccaa98672177). Trims (belt, buttons, tie clip) and cloth simplified to fit the GLB budget.
- `public/models/tee-real.glb` — Tshirt by [ajith98adithya](https://sketchfab.com/ajith98adithya), CC BY 4.0. [Source](https://sketchfab.com/3d-models/tshirt-8c838d3ea1e8494396438b5f5dc78ad8). Seated, recompressed and given print UVs (`templates/tee.pieces.json`): the real T-shirt new tee designs print on (template `@4`).
- `public/models/garment-print.glb` — the White Evening Gown Dress above with print UVs added (`templates/gown.pieces.json`); new gown designs print on it, so `garment.glb` stays as the seated looks use it.
- Every Style3D form above (hoodie, slip, mixed, coat, overall, suit, tailored) also carries print UVs from `scripts/build-template.mjs` (`templates/*.pieces.json`): drawing, words and graphics work on all of them.
- `public/models/jacket.glb` — original evening jacket. Same panel names. CC0. Hidden from the rail.
- `python3 scripts/ingest-garment.py` seats a downloaded Sketchfab GLB (rename panels, studio frame, credit extras). It refuses to overwrite `public/models/garment.glb`. If the result is over the GLB budget, `node scripts/simplify-parts.mjs` cuts dense trims (`hardware-*`) and, optionally, cloth. Then `scripts/compress-models.sh` for Draco + WebP; it lists the recipe used for each Style3D form. To make a garment printable, `node scripts/build-template.mjs --pieces templates/<id>.pieces.json` bakes its print UVs and writes its template manifest (docs/template-manifest.md). The house lathe, if you need it, is `node scripts/build-garment.mjs` → `garment-house.glb`.
- Board stills live in `public/stills/`. `pnpm stills`

Draco decoders live in `public/draco/` so first paint does not call gstatic.
