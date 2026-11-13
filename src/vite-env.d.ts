/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'real' only in the realistic-art test build (`/real-game/`); the website build leaves it unset. */
  readonly VITE_ART?: string;
}
