/** Phase 8b stage 0b test (never merged): the art packs module of the sheet plugin (`tools/sheets/plugin.ts`). */

/** True in the app output, Node tests and the sheet tool; false in the website build (fix round 1, B8). */
declare const __TC_APP__: boolean;
declare module 'virtual:tc-art' {
  /** One index per pack; `url` is relative to `base`. Empty in the website build. */
  export const packs: Array<{ name: string; url: string; hash: string }>;
  /** The sheet build report (`tools/sheets/build.ts` `ArtReport`); null in the website build. */
  export const report: {
    packs: Record<string, { pictures: number; unique: number; sheets: number; pngBytes: number; decodedBytes: number }>;
    kinds: Record<string, { pictures: number; unique: number; pngBytes: number }>;
    totalPngBytes: number;
    appArtBytesFull: number;
    appArtBytesCoarseOnly: number;
    buildMs: number;
  } | null;
}
