# Fashion Leader Vote

A garment-first Create → Publish → Vote slice. The Informatics building is the atelier, not the product.

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

Building and tree GLBs live in `public/models/`. `informatics_5_4.glb` is just over GitHub's 50MB warning. Commit `public/` in the same change that removes `models/` — do not `git add -u` alone. Wave 1 L4 compresses these files.
