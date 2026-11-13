/** Screen px per height step; live binding, set once at start-up per look (classic 8, real 9.8). Leaf module so view.ts can read it without an import cycle through iso.ts. */
export let STEP_PX = 8;

export function setStepPx(px: number): void {
  STEP_PX = px;
}
