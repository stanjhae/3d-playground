# Fashion Leader Vote — send package

Live URL: https://3d-playground-vert.vercel.app/

## S3 Founder QA

Run as a person on the live URL, no repo. 31 Aug 2026.

| Check | Result | Notes |
| --- | --- | --- |
| Fashion Leader Vote on screen in ~3s; gown in frame; no pointer-lock on first paint | Pass | Wordmark and atelier chrome on first HTML. `garment.glb` is 22KB and arrives in ~0.5s. Walk overlay is off until chosen. |
| 60-second create: click a panel, Silk + a color, Enter the Vote | Pass | Publish lands on `/vote`. A new card appears among the seed community (Look 01 in this run). |
| Seed community visible; one vote can move Leader | Pass | Vote **Atelier Ivory** once. Rank is votes, then title. Atelier Ivory became Leader (7 vs Midnight Silk Column at 6). |
| `/look/$lookId` opens that look alone | Pass | Orbit, Vote this look, Remix in studio, Copy link. No fabric panel, no publish, no pointer-lock. |
| Incognito share | Pass | `/look/look-atelier-ivory` and `/look/look-midnight-silk` open the seed gowns in a fresh context. Use a seed id if a just-published look 404s. |
| Walk the atelier is optional and obviously optional | Pass | **Design look** is the default. **Walk the atelier** shows an overlay and Start walking. Esc returns the cursor. |
| No console errors on the happy path | Pass | Home, vote, look, and incognito look: no page errors. |
| Narrow `/vote` | Pass | 390px stacks the Leader card. Fashion Leader Vote copy, not Gallery. |
| `/?design=look-atelier-ivory` remix | Pass | Studio opens on the seed look. |
| Would you text this URL to a fashion person? | Pass | It is a fashion product with a gown, a Leader, and a share link. Not a campus tour and not a repo. |

### Leftover risk

Votes and publishes live in memory per function isolate. A cold start resets to the seven seed looks. Seed share links always work. A look published on instance A can 404 on instance B. Frozen product: no Postgres/KV.

## 90-second shot list

1. Open https://3d-playground-vert.vercel.app/ — ivory gown, Fashion Leader Vote, no captured cursor.
2. Click a panel on the gown. Click **Silk**.
3. **Enter the Vote** — the look sits on the board with seven others.
4. Vote **Atelier Ivory** — it becomes **Leader**.
5. Open `/look/look-midnight-silk` (or Copy link on a card). Orbit the look. Remix in studio.
6. Optional 8s: **Walk the atelier** → Start walking → Esc.

## Cover note

Subject: https://3d-playground-vert.vercel.app/

This is Create / Publish / Vote from the FLV answers, as a URL.

You land on a gown, not a building tour. Cloth names, not sliders. Publish puts the look on a board that already looks like a community. One vote names a Leader. The share link is a look you can forward on its own. Walk the old Informatics model if you want — it is the atelier, not the product.

I did not build CAD, pattern grading, cloth simulation, or AI. There is no login.

Next week on FLV is two more base garments and your first 25 users.
