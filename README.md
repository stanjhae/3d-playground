# Fashion Leader Vote

The garment is the product. The building is the atelier. FLV garments swap in without rewriting the app.

Live: [https://3d-playground-vert.vercel.app/](https://3d-playground-vert.vercel.app/)

## Develop

```bash
pnpm install
pnpm dev
```

Open the local URL. You should see **Fashion Leader Vote**, not the old campus walkthrough.

```bash
pnpm test
pnpm build
```

`pnpm build` regenerates `src/routeTree.gen.ts` before typecheck. Keep that generated file in git so a clean checkout typechecks.

## Assets

Building and tree GLBs live in `public/models/`. L4 compresses them with Draco + WebP (`scripts/compress-models.sh`). First paint is the 22KB gown; the campus files are ~9MB combined. Draco decoders live in `public/draco/` (from three.js r185 / Google Draco) so first paint does not call gstatic. Commit `public/models/garment.glb`, `public/fabrics/`, and `public/draco/` with the campus GLB shrinks — do not `git add -u` alone.

### Hero garment

`public/models/garment.glb` is an original ivory silk column gown authored for this demo (`body`, `collar`, `lining`, `hardware`). License: CC0 1.0 (public domain). Mesh names are stable for Design-mode picking. Regenerate with `node scripts/build-garment.mjs` if you change the silhouette.
