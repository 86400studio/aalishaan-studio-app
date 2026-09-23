# Current asset inventory

Updated 14 September 2026 for E1. All images and fonts are under assets/. M1 added responsive delivery copies of nine approved site visuals; E1 corrected their shared footer paths on nested pages.

| Folder | Files | Purpose |
|---|---:|---|
| assets/catalogue/ | 168 | Source framed mockups, paper images and style covers; full-size gallery/zoom sources |
| assets/web-artworks/ | 336 | Responsive 480/1200 WebP versions used by the catalogue and product galleries |
| assets/originals/ | 22 | Supplied full-resolution unframed artworks used for zoom |
| assets/artwork-originals/ | 22 | Display-sized versions of the same unframed artworks |
| assets/site/ | 50 | 23 approved site visuals plus 27 responsive WebP copies under responsive/ |
| assets/rooms/ | 7 | Retained room and lifestyle images |
| assets/size-guides/ | 7 | Size and room-fit guides |
| assets/product/ | 5 | Lantern product visuals retained by the current prototype |
| assets/product-references/ | 14 | Materials, framing and packaging visuals |
| assets/brand/ | 2 | Final supplied Studio PNG logo and retained legacy asset |
| assets/fonts/ | 2 | Active local font and its supplied licence |

Total: **635 files**. E8 (15 September 2026) adds the exact owner-supplied 2172 x 724 PNG as assets/brand/aalishaan-studio.png for all public header/footer logos. Full-resolution sources and smaller display versions have different jobs; both are retained to preserve zoom quality and normal page loading.

## Mapping and preparation

- [products.json](../data/products.json): product images, original artwork and moodboard choices.
- [catalogue.json](../data/catalogue.json): generated listing records.
- [web-artwork-map.json](../data/web-artwork-map.json): source-to-responsive image mapping.
- [original-artworks.json](../data/original-artworks.json): unframed artwork provenance.
- scripts/artwork-images.cjs: confirmed paper-image aliases and mapping helpers.
- scripts/prepare-artwork-web.cjs and scripts/prepare-originals.cjs: optional image regeneration when supplied artwork changes; require the documented browser dependencies.
- data/mobile-site-assets.json and scripts/prepare-mobile-site.cjs: three responsive widths for nine approved Home/index heroes and cards. These are delivery copies, not new artwork or creative edits.

The source collection/style hierarchy is retained inside assets/catalogue, so filenames remain traceable to the supplied artwork. The separate duplicate 1. Artwork Mockups folder, loose root PNGs, numbered source folders and unused inspiration images are no longer scattered through the repository.

Do not remove an image solely because it is absent from an HTML src attribute: frame switching, zoom, inline backgrounds and data maps also load assets. Run npm run build:site and npm run check:static after changing paths; the static check also validates metadata paths and exact filename casing for Linux hosting.
