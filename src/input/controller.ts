/**
 * Input controller (Phase 0 §4.10, Phase 1 §4.1 and §7). Owner: W1-B.
 * Turns gestures, wheel, and keys into camera moves, ToolState changes, and commands.
 * No DOM access: `index.ts` feeds it browser events, tests feed it plain objects.
 * It talks to the UI only through the shared ToolState and the `onIntent` callback.
 */
import type { Game } from '../game';
import { screenToWorld, zoomAt } from '../render/camera';
import { pickTile, screenToTileFlat } from '../render/iso';
import { defaultToolState, type ToolId } from '../render/types';
import type { Dir } from '../sim/map';
import { KEY_ZOOM_FACTOR, centerOnMap, clampToMap, panCamera, wheelZoomFactor } from './camera';
import { GestureRecognizer, type DragMode, type GestureAction, type GesturePointerEvent, type PointerKind } from './gestures';
import { keyAction, keyboardPan, type PanDir } from './keyboard';
import { computeGhost, pathKindOf, pathLineCost, pathLineEnd, pathLineTiles, pickEntity } from './tools';
import { refreshTrackTool, trackGesture, trackKeyDown } from './track';

/** Requests for the UI layer (it owns panels). */
export type UiIntent = 'finance' | 'closePanel';

export interface InputControllerOptions {
  /** Canvas size in CSS px. */
  viewport: () => { width: number; height: number };
  onIntent?: (intent: UiIntent) => void;
}

/** Longest frame step used for keyboard panning, so a stall does not jump the camera. */
const MAX_FRAME_MS = 250;

export class InputController {
  readonly gestures: GestureRecognizer;
  private lastTool: ToolId;
  private lastSpeed: 1 | 2 | 4 = 1;
  private lastUpdate: number | null = null;
  private readonly held = new Set<PanDir>();
  private lastPointer: PointerKind = 'mouse';

  constructor(
    private readonly game: Game,
    private readonly opts: InputControllerOptions,
  ) {
    this.gestures = new GestureRecognizer({ primaryDrag: () => this.primaryDrag() });
    this.lastTool = game.tool.tool;
  }

  /** Path tools build with a primary drag; every other tool pans. */
  primaryDrag(): DragMode {
    return pathKindOf(this.game.tool.tool) ? 'build' : 'pan';
  }

  pointer(ev: GesturePointerEvent): void {
    this.lastPointer = ev.pointerType;
    this.apply(this.gestures.handle(ev));
  }

  /** Once per frame: long-press clock, keyboard pan, tool changes made by the UI, ghost refresh. */
  update(nowMs: number): void {
    const dt = this.lastUpdate === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, nowMs - this.lastUpdate));
    this.lastUpdate = nowMs;
    this.apply(this.gestures.update(nowMs));
    if (this.held.size > 0 && dt > 0) {
      const cam = this.game.camera;
      const { dx, dy } = keyboardPan(this.held, dt, cam.zoom);
      cam.centerX += dx;
      cam.centerY += dy;
      clampToMap(cam, this.game.world.state.map);
    }
    if (this.game.tool.tool !== this.lastTool) this.toolChanged();
    this.refreshGhost();
  }

  wheel(x: number, y: number, deltaY: number, deltaMode: number): void {
    const f = wheelZoomFactor(deltaY, deltaMode);
    if (f === 1) return;
    const v = this.opts.viewport();
    zoomAt(this.game.camera, f, x, y, v.width, v.height);
    clampToMap(this.game.camera, this.game.world.state.map);
  }

  /** The mouse left the map. A place-tool ghost stays put so the Confirm and Rotate buttons can be reached. */
  hoverOut(): void {
    const t = this.game.tool;
    if (this.gestures.active || t.tool === 'placeRide' || t.tool === 'placeStall') return;
    t.hoverTile = null;
  }

  /** Returns true when the key was used (the caller then prevents the browser default). */
  keyDown(key: string): boolean {
    if (this.game.tool.tool === 'track' && trackKeyDown(this.game, key)) return true;
    const a = keyAction(key);
    if (!a) return false;
    const game = this.game;
    switch (a.kind) {
      case 'pan':
        this.held.add(a.dir);
        break;
      case 'zoom': {
        const v = this.opts.viewport();
        zoomAt(game.camera, a.dir === 'in' ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR, v.width / 2, v.height / 2, v.width, v.height);
        clampToMap(game.camera, game.world.state.map);
        break;
      }
      case 'togglePause':
        if (game.speed === 0) {
          game.setSpeed(this.lastSpeed);
        } else {
          this.lastSpeed = game.speed;
          game.setSpeed(0);
        }
        break;
      case 'speed':
        game.setSpeed(a.speed);
        this.lastSpeed = a.speed;
        break;
      case 'tool':
        this.setTool(a.tool);
        break;
      case 'rotate':
        game.tool.rotation = ((game.tool.rotation + 1) % 4) as Dir;
        this.refreshGhost();
        break;
      case 'cancel':
        if (game.tool.tool !== 'inspect') this.setTool('inspect');
        else this.opts.onIntent?.('closePanel');
        break;
      case 'finance':
        this.opts.onIntent?.('finance');
        break;
    }
    return true;
  }

  keyUp(key: string): void {
    const a = keyAction(key);
    if (a?.kind === 'pan') this.held.delete(a.dir);
  }

  /** Window lost focus: release held keys and drop pointers. */
  blur(): void {
    this.held.clear();
    this.apply(this.gestures.reset());
  }

  setTool(tool: ToolId): void {
    const t = this.game.tool;
    t.tool = tool;
    if (tool !== 'placeRide' && tool !== 'placeStall') t.defId = null;
    this.toolChanged();
  }

  /** A new or loaded world: reset the tool and centre the camera on the map. */
  worldChanged(): void {
    this.apply(this.gestures.reset());
    Object.assign(this.game.tool, defaultToolState());
    this.lastTool = this.game.tool.tool;
    centerOnMap(this.game.camera, this.game.world.state.map);
  }

  private toolChanged(): void {
    const t = this.game.tool;
    this.lastTool = t.tool;
    this.apply(this.gestures.reset());
    t.drag = null;
    t.ghost = null;
    // Touch has no hover: a new placement starts at the screen centre, not at an old tap.
    if ((t.tool === 'placeRide' || t.tool === 'placeStall') && this.lastPointer !== 'mouse') t.hoverTile = null;
    this.refreshGhost();
  }

  private apply(actions: GestureAction[]): void {
    for (const a of actions) this.act(a);
  }

  private act(a: GestureAction): void {
    if (this.game.tool.tool === 'track' && trackGesture(this.game, a, this.tileAtFn)) return;
    const game = this.game;
    const tool = game.tool;
    const map = game.world.state.map;
    switch (a.type) {
      case 'hover':
        tool.hoverTile = this.tileAt(a.x, a.y);
        break;
      case 'tap':
        this.tap(a.x, a.y, a.pointerType === 'mouse');
        break;
      case 'longPress': {
        const tile = this.tileAt(a.x, a.y);
        tool.selectedTile = tile;
        tool.selectedEntity = pickEntity(game.world, tile);
        break;
      }
      case 'pan':
        panCamera(game.camera, a.dx, a.dy, map);
        break;
      case 'pinch': {
        const v = this.opts.viewport();
        panCamera(game.camera, a.dx, a.dy, map);
        zoomAt(game.camera, a.scale, a.cx, a.cy, v.width, v.height);
        clampToMap(game.camera, map);
        break;
      }
      case 'dragStart': {
        const kind = pathKindOf(tool.tool);
        if (!kind) break;
        const start = this.tileAtClamped(a.x, a.y);
        tool.drag = { startTile: start, endTile: start, tiles: [start], cost: pathLineCost(map, [start], kind) };
        tool.hoverTile = start;
        break;
      }
      case 'dragMove': {
        const kind = pathKindOf(tool.tool);
        if (!kind || !tool.drag) break;
        const cur = this.tileAtClamped(a.x, a.y);
        const tiles = pathLineTiles(map, tool.drag.startTile, cur);
        tool.drag = { startTile: tool.drag.startTile, endTile: pathLineEnd(map, tool.drag.startTile, cur), tiles, cost: pathLineCost(map, tiles, kind) };
        tool.hoverTile = tool.drag.endTile;
        break;
      }
      case 'dragEnd': {
        const kind = pathKindOf(tool.tool);
        const drag = tool.drag;
        tool.drag = null;
        if (!kind || !drag) break;
        const w = map.width;
        game.dispatch({
          type: 'buildPathLine',
          x0: drag.startTile % w,
          y0: Math.floor(drag.startTile / w),
          x1: drag.endTile % w,
          y1: Math.floor(drag.endTile / w),
          kind,
        });
        break;
      }
      case 'dragCancel':
        tool.drag = null;
        break;
      default:
        break;
    }
  }

  private tap(x: number, y: number, mouse: boolean): void {
    const game = this.game;
    const tool = game.tool;
    const tile = this.tileAt(x, y);
    const w = game.world.state.map.width;
    switch (tool.tool) {
      case 'footpath':
      case 'queue': {
        if (tile === null) return;
        const tx = tile % w;
        const ty = Math.floor(tile / w);
        game.dispatch({ type: 'buildPathLine', x0: tx, y0: ty, x1: tx, y1: ty, kind: tool.tool });
        return;
      }
      case 'placeRide':
      case 'placeStall': {
        if (tile === null) return;
        tool.hoverTile = tile;
        this.refreshGhost();
        // Touch: a tap only moves the ghost; the Confirm button places it.
        if (!mouse) return;
        const g = tool.ghost;
        if (!g) return;
        const gx = g.tile % w;
        const gy = Math.floor(g.tile / w);
        if (g.kind === 'ride') game.dispatch({ type: 'placeRide', defId: g.defId, x: gx, y: gy, rotation: g.rotation });
        else game.dispatch({ type: 'placeStall', defId: g.defId, x: gx, y: gy, rotation: g.rotation });
        return;
      }
      case 'demolish':
        if (tile !== null) game.dispatch({ type: 'demolish', x: tile % w, y: Math.floor(tile / w) });
        return;
      default:
        // Touch has no hover: the highlight follows the tapped tile (Phase 0 §10).
        tool.hoverTile = tile;
        tool.selectedTile = tile;
        tool.selectedEntity = pickEntity(game.world, tile);
    }
  }

  /** Ghost for place tools at the hover tile, or at the screen centre before any pointer input. */
  private refreshGhost(): void {
    const t = this.game.tool;
    refreshTrackTool(this.game, this.opts.viewport(), this.tileAtClampedFn);
    if (t.tool === 'track') return;
    if ((t.tool !== 'placeRide' && t.tool !== 'placeStall') || !t.defId) {
      t.ghost = null;
      return;
    }
    const v = this.opts.viewport();
    const anchor = t.hoverTile ?? this.tileAtClamped(v.width / 2, v.height / 2);
    t.ghost = computeGhost(this.game.world, t.tool === 'placeRide' ? 'ride' : 'stall', t.defId, anchor, t.rotation);
  }

  /** Track tool helpers, bound once (no per-frame closures). */
  private readonly tileAtFn = (x: number, y: number): number | null => this.tileAt(x, y);
  private readonly tileAtClampedFn = (x: number, y: number): number => this.tileAtClamped(x, y);

  private tileAt(x: number, y: number): number | null {
    const v = this.opts.viewport();
    const p = screenToWorld(this.game.camera, x, y, v.width, v.height);
    return pickTile(this.game.world.state.map, p.x, p.y);
  }

  /** Tile under the point, clamped into the map (drags may leave the map). */
  private tileAtClamped(x: number, y: number): number {
    const hit = this.tileAt(x, y);
    if (hit !== null) return hit;
    const map = this.game.world.state.map;
    const v = this.opts.viewport();
    const p = screenToWorld(this.game.camera, x, y, v.width, v.height);
    const t = screenToTileFlat(p.x, p.y, map.heights[0] ?? 0);
    const tx = Math.max(0, Math.min(map.width - 1, t.x));
    const ty = Math.max(0, Math.min(map.height - 1, t.y));
    return ty * map.width + tx;
  }
}
