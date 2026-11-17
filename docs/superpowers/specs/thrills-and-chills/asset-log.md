# Asset log

Assets the project did not make itself: where each came from and under what terms. Every file here was chosen by
the owner. A file whose licence is not confirmed is shipped only in the realistic build, and the release check lists it
as an owner item until the licence column is filled in. Nothing in this repository claims a licence for these files
until then.

The release check (`scripts/check-release.ts`, item 7) reads the table below: a raster file outside the project's own
places is allowed only when it is listed here, and each row whose licence is "pending owner confirmation" is reported
as an OWNER row.

| File | Source | Tool | Licence | Date | Used by |
|---|---|---|---|---|---|
| `art-src/title/poster-wide.webp` | supplied by owner | pending owner confirmation | pending owner confirmation | 2026-11-17 | Realistic title cover, wide and tall framing (`art/real/title/poster-wide.webp`, copied by `tools/art3d/cover.mjs`). A stand-in (1376 x 768): the owner will supply larger wide and tall versions. |
