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

Open the local URL. You should see a gown in frame and **Fashion Leader Vote**.

```bash
pnpm test
pnpm build
```

`pnpm build` regenerates `src/routeTree.gen.ts` before typecheck.

## Persist the board

The one dashboard step: in the Vercel project, add a Redis store (Marketplace → Upstash / the KV env pair) and pull `KV_REST_API_URL` + `KV_REST_API_TOKEN`. The API keeps the same `/api/designs` shape. Local and tests use memory when those env values are missing. Seed looks always load.

## Assets

- `public/models/garment.glb` — White Evening Gown Dress by [Style3D CG](https://sketchfab.com/Style3DMeta), [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). [Source](https://sketchfab.com/3d-models/white-evening-gown-dress-1f77c65b1542428f89b10f538b771ce4). Nodes renamed so Silk still hits `body`. House authoring stays `pnpm garments`.
- `public/models/jacket.glb` — original evening jacket. Same panel names. CC0.
- Campus GLBs stay in `public/models/` and load only in **The house**.
- Board stills live in `public/stills/`. `pnpm stills`

Draco decoders live in `public/draco/` so first paint does not call gstatic.
