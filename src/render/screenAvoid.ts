/**
 * Screen areas the in-world labels keep out of (review 2026-11-20): the UI publishes the boxes of controls that float
 * over the map (the phone's turn-view buttons), in CSS px relative to the canvas; the entrance banners move aside or
 * hide there. Leaf module: no imports, so the UI can write it without pulling in the renderer.
 */
export interface AvoidBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

let boxes: readonly AvoidBox[] = [];

export function setLabelAvoidBoxes(next: readonly AvoidBox[]): void {
  boxes = next;
}

export function labelAvoidBoxes(): readonly AvoidBox[] {
  return boxes;
}
