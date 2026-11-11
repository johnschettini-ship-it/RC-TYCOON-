/**
 * Card drag (Phase 7 §4.6): a mouse or a pen drags a flat ride or stall card from the hand to the map and builds it
 * there on release. Touch never drags a card (a sideways touch move scrolls the hand), and a track ride card is
 * pressed (its station builder places it).
 *
 * During a drag the card is the held card and the pointer is captured. Over the map the drag sets the hover tile, and
 * the input controller makes the ghost for it as it does for a mouse move. A release over the map builds when the ghost
 * is valid (the command of Confirm); with an invalid ghost the ghost stays on that tile, so the tool status bar shows
 * the reason. A release over the interface, `pointercancel`, and a lost pointer capture build nothing. The card stays
 * held in every case.
 */
import { CARD_DRAG_PX } from '../../data/tuning/interface';
import { tileAtClient } from '../../input';
import { heldGhostAt } from '../../input/tools';
import type { UiContext } from '../context';
import { toggleClass } from '../dom';
import { heldCardId, type CardSpec } from './model';
import { holdCard } from './toolCards';

/** A pointer that can drag a card. */
const dragPointer = (pointerType: string): boolean => pointerType === 'mouse' || pointerType === 'pen';

/** A press that moved (dx, dy) px with the button down starts a drag of the card. Pure. */
export function dragStarts(dx: number, dy: number, pointerType: string, kind: CardSpec['kind']): boolean {
  return Math.hypot(dx, dy) >= CARD_DRAG_PX && dragPointer(pointerType) && kind !== 'track';
}

/** The map canvas when it is the top element at the pointer (no part of the interface covers the point), else null. */
function mapUnder(e: PointerEvent): HTMLCanvasElement | null {
  const top = document.elementFromPoint(e.clientX, e.clientY);
  return top instanceof HTMLCanvasElement && top.id === 'game' ? top : null;
}

/**
 * Makes the card `el` of a flat ride or stall a card that drags to the map (class `drag-card`; `dragging` during a
 * drag). It must be attached before the click listener of the card: it drops the click that follows a drag.
 */
export function attachCardDrag(ctx: UiContext, el: HTMLElement, spec: CardSpec): void {
  if (spec.kind === 'track') return;
  const { game } = ctx;
  el.classList.add('drag-card');
  /** The press on the card: the pointer, where it went down, and whether it has become a drag. */
  let press: { id: number; x: number; y: number; dragging: boolean } | null = null;
  /** The next click on the card is the end of a drag, not a press. */
  let dropClick = false;

  const end = (): void => {
    if (!press) return;
    const { id } = press;
    press = null;
    toggleClass(el, 'dragging', false);
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  };

  el.addEventListener('pointerdown', (e) => {
    dropClick = false;
    if (e.button !== 0 || !dragPointer(e.pointerType)) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
    // The card gets every move of this press, also when the pointer leaves the card before the drag starts.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot always be captured.
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    // A move with no button down: the release of this press did not reach the card.
    if ((e.buttons & 1) === 0) {
      end();
      return;
    }
    if (!press.dragging) {
      if (!dragStarts(e.clientX - press.x, e.clientY - press.y, e.pointerType, spec.kind)) return;
      press.dragging = true;
      // The card becomes the held card. A card that is held already keeps the rotation that the player chose.
      if (heldCardId(game.tool) !== spec.id) holdCard(ctx, spec);
      toggleClass(el, 'dragging', true);
      // No focus stays on the card: Space pauses the game and does not press the card.
      el.blur();
    }
    const map = mapUnder(e);
    if (map) game.tool.hoverTile = tileAtClient(game, map, e.clientX, e.clientY);
  });

  el.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dragged = press.dragging;
    end();
    // A press that did not move far is a press: its click holds the card or puts it back.
    if (!dragged) return;
    dropClick = true;
    const map = mapUnder(e);
    const tile = map ? tileAtClient(game, map, e.clientX, e.clientY) : null;
    // Over the interface, or off the map: nothing is built.
    if (tile === null) return;
    game.tool.hoverTile = tile;
    const ghost = heldGhostAt(game.world, game.tool, game.camera.rotation, tile);
    // An invalid ghost stays on the tile, and the tool status bar shows its reason.
    if (!ghost?.valid) return;
    const w = game.world.state.map.width;
    const x = ghost.tile % w;
    const y = Math.floor(ghost.tile / w);
    if (ghost.kind === 'ride') game.dispatch({ type: 'placeRide', defId: ghost.defId, x, y, rotation: ghost.rotation });
    else game.dispatch({ type: 'placeStall', defId: ghost.defId, x, y, rotation: ghost.rotation });
  });

  const stop = (e: PointerEvent): void => {
    if (press && e.pointerId === press.id) end();
  };
  el.addEventListener('pointercancel', stop);
  el.addEventListener('lostpointercapture', stop);

  // The click that follows a drag must not put the card back. A click from the keyboard (detail 0) is a press.
  el.addEventListener(
    'click',
    (e) => {
      if (!dropClick) return;
      dropClick = false;
      if (e.detail === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
}
