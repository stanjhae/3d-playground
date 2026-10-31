# Canonical document v2: coordinates, transforms and hashing

Covers F04 #139 and F05 #140. The code is in `src/lib/canonical-document.ts` (contract and validator) and `src/lib/canonical-hash.ts` (normalization and hashing). The golden example is `src/lib/canonical-fixtures.ts`.

The 2D document is the source of truth. The renderer, saves and publication all derive from it. Nothing in it has a physical unit: no centimetres, sizes or fit. It describes a print layout on a fixed template.

## Coordinates

| Quantity | Unit and range | Matches the renderer today |
| --- | --- | --- |
| Point `x`, `y` (layer centre, stroke points) | Panel-normalized `[0, 1]`. **Origin bottom-left, y up.** | `panelPointToUv` maps `y` straight to `v`, and atlas rows are `(1 − v) · height` |
| Object `scale` | Fraction of **atlas width**, `(0, 1]` | Text font size and image size are `scale × atlas width` |
| Stroke `width` | Fraction of atlas width, `[0.002, 0.25]` | Same meaning as v1 `stroke.width` |
| Base pattern `period` | Fraction of atlas width, `[0.02, 0.5]` | New in v2: one stripe plus one gap (#161) |
| `rotation`, stripe `angle` | **Radians**, `(−π, π]`, stored as `(−3.141593, 3.141593]`. Positive turns clockwise on screen. | `context.rotate(rotation)` on a y-down canvas |

Panels are **wearer-oriented**: `left` is the wearer's left sleeve. Each panel's print region and render mapping come from the pinned template manifest (`src/lib/template-manifest.ts`, F07 #142). Front and back are the upper half of the atlas and the sleeves the lower half. Canonical `left` and `right` use the opposite `DEFAULT_PANEL_UV` sleeve ids, because the render path names sleeves by mesh side, not wearer side.

### Images: the aspect-ratio extension

An image layer stores `aspect = natural width / natural height`. The image is **contained** in a square whose side is `scale` (in atlas widths), centred on (`x`, `y`) and rotated about that centre (`imageBox`):

- `aspect ≥ 1`: width is `scale`, height is `scale / aspect`.
- `aspect < 1`: width is `scale × aspect`, height is `scale`.

`aspect = 1` reproduces the legacy renderer, which drew every graphic as a `scale × atlas width` square. So old square images look the same, and a non-square image never grows past the box a square one would occupy.

## Content hashing

`hashCanonicalDocument` returns `sha256:<hex>` over the UTF-8 bytes of `serializeCanonicalDocument`. The serialization:

1. normalizes strings to Unicode NFC;
2. rounds numbers to 6 decimals (`Math.round(n × 10⁶) / 10⁶`), writes `−0` as `0`, and rejects non-finite numbers;
3. sorts object keys by code unit and keeps array order (layer order is z-order, bottom first);
4. writes compact JSON with no whitespace.

Store the normalized form (`normalizeCanonicalDocument`), not the raw editor state. Then the hash is the same before save and after reload, and an identical revision is detectable by hash alone. The 6-decimal rounding is why the angle bound is 3.141593: raw π (3.14159265…) is valid and still valid after it rounds up.

Hash only a document that has passed `validateCanonicalDocument`. The validator rejects unknown fields, so no numeric-string keys can reorder the JSON.

## Example contract

`GOLDEN_DOCUMENT` has a striped base, a brush stroke and an eraser stroke on the front, a 3:2 image, and NFC text on the back. Its serialization hashes to:

```
sha256:e081116ffc8971eccb2c8b466f21bf289306bbec33a906e6bd173fc542843b56
```

`canonical-hash.test.ts` pins that value. Tests confirm the same hash for:
- a JSON save/reload round trip
- reordered keys
- decomposed text (`e` + combining accent)
- sub-precision numeric noise

Any visible content edit changes the hash. `shasum -a 256` over the serialized bytes produces the same digest, so the hash does not depend on JavaScript.

## Legacy v1 import (F06 #141)

`importLegacyDesign` in `src/lib/legacy-import.ts` reads a v1 document, an editor draft (`flv:draft:current`) or a snapshot (`flv:draft:mornings`). It never uses the permissive v1 parsers. Cloud saves accept only `validateCanonicalDocument`, and every import result passes it.

The adapter has three outcomes:
- **`warnings`:** content was imported, but something about it changed.
- **`unsupported`:** content was left out, each item with a path.
- **Rejection:** `corrupt`, `already-v2`, `unsupported-garment`, or `invalid` (the converted result failed v2 validation, for example because of duplicate IDs).

| v1 | v2 | Outcome |
| --- | --- | --- |
| `garmentId: 'tee'` | template `tee-crew-short@1` (v1 placement is render space, which `@1` keeps as stored) | Any other garment is rejected (`unsupported-garment`) |
| `garmentVersion` other than 2 | current template | Warning |
| `structural` other than neck `crew` and sleeve `short` | — | Unsupported |
| First `overrides[].color` | `base: solid` | Warning that names the material. Other part colors, `mapId`, `roughness` and `metalness` are unsupported. |
| Panel `left` / `right` | `right` / `left` | v1 ids name the render sleeve: v1 `left` is built at −x, the **wearer's right**. The same physical sleeve keeps its print, routed through the manifest's `renderPanel`. |
| Panel `sleeve` (before four panels) | `right` | Warning. **Documented mapping:** v1 had one sleeve panel, drawn on render panel `left`, which is the wearer's right sleeve. |
| Paint layer | One paint layer per panel that has strokes | If the strokes span several panels, IDs get a `--<panel>` suffix |
| Brush and eraser strokes | Same tool; points flattened to `[x, y, …]` | Pressure is dropped (warning if any point differs from 0.7, the old default). Off-panel points are clamped exactly as the old renderer clamped them (warning). |
| `fill` stroke | — | Unsupported |
| Graphic | `image`, `aspect: 1` | Gets a reserved `asset_legacy_<sha256(src)[0:32]>` ID and is listed in `pendingAssets` for upload (S01 #170). Tint is dropped (warning). |
| Text | Text | All content is kept. A warning appears when it was longer than the 32 characters the old preview showed. Over 280 characters is unsupported. |
| `scale` out of `(0, 1]`, width out of range, too many points | — | Unsupported (clamping would change the look) |
| `rotation` | Same angle wrapped into `(−π, π]` | Lossless |
| `pattern` layer, locked `art` layer | — | Unsupported |

Placement (`x`, `y`, `scale`, `rotation`) copies across unchanged, so `panelPointToUv` gives the same atlas position before and after import.

**Never overwriting owned work.** Imports are deterministic: the same source always produces the same document, `contentHash` and `importKey`. `importKey` is a UUID (version-8 layout) derived from the SHA-256 of the original. Pass it as the `mutation_key` to `flp_create_design`, and a repeated import returns the design it already made, instead of creating a duplicate or overwriting anything. `backup` holds the exact original input so that it can be kept alongside the import.

## Editor commands and the interim render projection (E01 #152)

`src/lib/canonical-commands.ts` defines the editor's v2 command stack.
- **Commands:**
  - add or remove strokes, and clear a single paint layer;
  - add, update, move, copy or remove layers;
  - set the base.
- **Purity:** commands are pure, and the caller supplies any new IDs.
- **Strict results:** every result must pass `validateCanonicalDocument`. An invalid result is rejected and leaves the stack unchanged, with no clamping, and a layer can only be patched with fields its kind allows.
- **History:** at most 100 undo steps; E09 needs at least 50.
- **Revisions:** `revision` increases on every change, undo and redo included, and loading a document drops history but keeps revisions increasing. The editor, renderer, history and save controller key on it.

`src/lib/render-projection.ts` is the **only** v2 → v1 conversion. It feeds the existing atlas, paint canvas and layer UI until R01 #164 renders from v2 directly.
- Panels map through the template manifest (`canonicalPanel` and `renderPanel`).
- The document's template version sets each panel's x direction. On `@2` the back is mirrored into render space (seen from behind), and `@1` keeps it as stored. The editor maps input back the same way. See docs/template-manifest.md (R02 #165).
- Images need an `assetSources` map. One without a source is reported in `missingAssets` and projected as a `missing` graphic with no `src`. The atlas, and so the 2D panel and the scene, draws it, or an image whose bytes failed to decode, as a placeholder at the layer's box: a hatched fill with a thin border in `#8c8478`, at full strength whatever the layer's opacity (#154). It cannot be copied, because there are no bytes to copy.
- Brush opacity is carried in the stroke colour as `#rrggbbaa`, the encoding the live stroke already uses, so the slider's value is stored as the 8-bit alpha it was drawn with. Paint layer opacity is carried as the layer's `opacity`. A translucent stroke is composited once, not dot by dot, so a 30% stroke is 30% along its whole length. A translucent layer is drawn on its own and then composited, so its erasers clear only its own strokes. An opaque layer's erasers still clear everything beneath them (#158).
- The base `period` becomes the base stamps' `period`. One stripe plus one gap spans `period` atlas widths, computed per atlas pixel, so the 512px atlas and the 256/160px published art agree. Switching stripes ↔ check keeps the period. Local drafts carry it back through the importer (#161).
- Known gaps until R01: a local v1 draft drops image `aspect` and placeholder images on reload (the v1 parser keeps neither). Cloud saves are canonical and keep both.

A test checks that a legacy design imported and then projected puts every supported layer and stroke back at the same atlas position.

### The editor store on v2 (E01 #152, part 2)

**The tee's source of truth** is the canonical stack in `src/lib/editor-canonical.ts`.
- The store still issues its existing commands. For the tee, `translateCommand` maps them onto canonical commands.
- `document` is derived through `toRenderDocument`.
- `revision` and `importNotes` are store state.
- Every load (`loadDesign`, `hydrateDocument`, `restoreMorning`) converts through `convertLegacyDesign`. That is the synchronous core of the legacy importer; it never uses the permissive v1 parser. Loading also resets undo.

**Input normalisation:** pointer and slider input is normalised in the translator. A drag past the panel edge pins to the edge, and angles wrap. Anything else invalid is refused by the validator.

**Concept garments** (gown, slip, coat, suit, mixed) keep the legacy v1 stack. On the v2 tee, the studio hides what v2 cannot hold:
- per-mesh fabrics and finishes
- the gradient base
- pattern stamps and the fill tool
- neck, hem and sleeve variants

`VITE_FLP_CONCEPT=true` shows concept garments in the silhouette switch. Remixing a concept look from the board still opens it.

**Pixel parity:** `editor-canonical.test.ts` renders the same store commands through the legacy stack (master's behaviour) and through v2 plus the projection. The atlases are pixel-identical for strokes on all four panels, erasing and graphics. One intentional change: a base stripe or check now always sits **under** prints, where v1 painted it over any ink drawn before it was picked.
