# Title screen pictures

The scripts that draw the four pixel pictures of the title screen (design E, the skyline) and turn them into the JSON
data the game ships in `src/ui/titleScreen/art/`. The game may not ship image files, so the PNG files are only a step
on the way and never go into the repository.

- `make.py` draws `scene-wide.png` (960 x 400), `scene-tall.png` (450 x 470), `logo-line.png` (496 x 62) and
  `logo-stack.png` (176 x 118). It reads the game's font (`src/assets/fonts/fredoka`) for the lettering.
- `export.py` writes one JSON file per picture (`{"w", "h", "palette", "rows"}`, runs of palette indices per row,
  `-1` = transparent), decodes each file again, checks it equals its PNG pixel for pixel, and prints the gzip sizes
  (the total must stay under 40,000 bytes).
- `palette.py` holds the colour ramps that `make.py` uses.

Needs Python 3 with Pillow. To make the JSON files again, from the repository root:

```sh
python3 tools/title-art/make.py /tmp/title-art
python3 tools/title-art/export.py /tmp/title-art
cp /tmp/title-art/json/*.json src/ui/titleScreen/art/
```

The game's layout (`src/ui/titleScreen/layout.ts`) depends on these facts of the pictures; a new drawing must keep
them: the four sizes; row 0 of both scenes is the sky colour `#ffe9bf`; wide scene: ride top row 134, promenade rows
288 to 300 with 99 lawn rows below it, the coaster's left foot at column 168, the middle of the skyline at column 330;
tall scene: ride top row 190, the promenade's bottom edge at row 314, lawn rows 315 to 469.

The design rules are in `docs/superpowers/specs/thrills-and-chills/phase-7-title-screen.md`.
