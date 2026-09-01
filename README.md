# Fashion Leader Vote

The garment is the product. The building is the house.

Live: [https://3d-playground-vert.vercel.app/](https://3d-playground-vert.vercel.app/)

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
- `public/models/jacket.glb` — original evening jacket. Same panel names. CC0. Hidden from the rail.
- `python3 scripts/ingest-garment.py` seats a downloaded Sketchfab GLB (rename panels, studio frame, credit extras). It refuses to overwrite `public/models/garment.glb`. Then `scripts/compress-models.sh` for Draco + WebP. The house lathe, if you need it, is `node scripts/build-garment.mjs` → `garment-house.glb`.
- Board stills live in `public/stills/`. `pnpm stills`

Draco decoders live in `public/draco/` so first paint does not call gstatic.
