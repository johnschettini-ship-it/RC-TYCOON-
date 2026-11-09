/**
 * Gesture recognizer (Phase 0 §4.10, Phase 1 §4.1). Owner: W1-B.
 * Pure: a sequence of pointer events (plus a clock for long press) in, a list of actions out.
 * No DOM access, so every rule is unit-tested in Node.
 *
 * Rules:
 * - Drag threshold 6 CSS px. Below it a press is a tap (released) or a long press (500 ms, touch and pen only).
 * - A primary drag (left mouse button or one finger) pans or builds, as the active tool says.
 * - Right and middle mouse drags always pan and never tap.
 * - A second finger cancels the one-finger action (nothing gets built) and starts a pinch.
 * - After a pinch, the remaining fingers do nothing until all have lifted: no tap fires.
 */

export const DRAG_THRESHOLD_PX = 6;
export const LONG_PRESS_MS = 500;

export type PointerKind = 'mouse' | 'touch' | 'pen';
export type DragMode = 'pan' | 'build';

export interface GesturePointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  /** CSS px relative to the canvas. */
  x: number;
  y: number;
  /** Milliseconds (any monotonic clock, the same one passed to `update`). */
  t: number;
  pointerType: PointerKind;
  /** Mouse button on `down`: 0 left, 1 middle, 2 right. */
  button: number;
}

export type GestureAction =
  | { type: 'hover'; x: number; y: number }
  | { type: 'tap'; x: number; y: number; pointerType: PointerKind }
  | { type: 'longPress'; x: number; y: number; pointerType: PointerKind }
  | { type: 'panStart'; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'panEnd' }
  | { type: 'dragStart'; x: number; y: number }
  | { type: 'dragMove'; x: number; y: number }
  | { type: 'dragEnd'; x: number; y: number }
  | { type: 'dragCancel' }
  | { type: 'pinchStart'; cx: number; cy: number }
  | { type: 'pinch'; cx: number; cy: number; scale: number; dx: number; dy: number }
  | { type: 'pinchEnd' };

export interface GestureOptions {
  /** What a primary drag does for the active tool. Read when a press starts. */
  primaryDrag: () => DragMode;
  dragThreshold?: number;
  longPressMs?: number;
}

type Phase = 'idle' | 'pending' | 'panning' | 'dragging' | 'pinching' | 'consumed';

interface Tracked {
  x: number;
  y: number;
  pointerType: PointerKind;
}

export class GestureRecognizer {
  private readonly pointers = new Map<number, Tracked>();
  private phase: Phase = 'idle';
  private primary = -1;
  private mode: DragMode = 'pan';
  private tapAllowed = false;
  private longPressArmed = false;
  private primaryType: PointerKind = 'mouse';
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private lastX = 0;
  private lastY = 0;
  private pinchIds: [number, number] = [-1, -1];
  private pinchDist = 0;
  private pinchCx = 0;
  private pinchCy = 0;
  private readonly threshold: number;
  private readonly longPressMs: number;

  constructor(private readonly opts: GestureOptions) {
    this.threshold = opts.dragThreshold ?? DRAG_THRESHOLD_PX;
    this.longPressMs = opts.longPressMs ?? LONG_PRESS_MS;
  }

  /** True while any tracked pointer is down. */
  get active(): boolean {
    return this.pointers.size > 0;
  }

  handle(ev: GesturePointerEvent): GestureAction[] {
    switch (ev.type) {
      case 'down':
        return this.down(ev);
      case 'move':
        return this.move(ev);
      case 'up':
        return this.lift(ev, false);
      default:
        return this.lift(ev, true);
    }
  }

  /** Clock tick: fires a pending long press. */
  update(t: number): GestureAction[] {
    if (this.phase === 'pending' && this.longPressArmed && t - this.startT >= this.longPressMs) {
      return this.fireLongPress();
    }
    return [];
  }

  /** Drop every pointer and cancel the current action (tool change, blur, world change). */
  reset(): GestureAction[] {
    const out = this.endCurrent();
    this.pointers.clear();
    this.phase = 'idle';
    this.primary = -1;
    return out;
  }

  private down(ev: GesturePointerEvent): GestureAction[] {
    if (this.pointers.has(ev.id)) return [];
    if (this.pointers.size === 0) {
      this.pointers.set(ev.id, { x: ev.x, y: ev.y, pointerType: ev.pointerType });
      const secondary = ev.pointerType === 'mouse' && ev.button !== 0;
      this.phase = 'pending';
      this.primary = ev.id;
      this.primaryType = ev.pointerType;
      this.mode = secondary ? 'pan' : this.opts.primaryDrag();
      this.tapAllowed = !secondary;
      this.longPressArmed = !secondary && ev.pointerType !== 'mouse' && this.mode === 'pan';
      this.startX = this.lastX = ev.x;
      this.startY = this.lastY = ev.y;
      this.startT = ev.t;
      return [];
    }
    // Multi-touch only: a mouse never joins a pinch, and a touch never joins a mouse press.
    if (ev.pointerType === 'mouse' || this.primaryType === 'mouse') return [];
    this.pointers.set(ev.id, { x: ev.x, y: ev.y, pointerType: ev.pointerType });
    if (this.pointers.size !== 2) return [];
    const out = this.endCurrent();
    return [...out, ...this.startPinch()];
  }

  private move(ev: GesturePointerEvent): GestureAction[] {
    const p = this.pointers.get(ev.id);
    if (!p) {
      if (ev.pointerType === 'mouse' && this.pointers.size === 0) return [{ type: 'hover', x: ev.x, y: ev.y }];
      return [];
    }
    p.x = ev.x;
    p.y = ev.y;
    switch (this.phase) {
      case 'pending': {
        if (ev.id !== this.primary) return [];
        if (this.longPressArmed && ev.t - this.startT >= this.longPressMs) return this.fireLongPress();
        if (Math.hypot(ev.x - this.startX, ev.y - this.startY) < this.threshold) return [];
        this.lastX = ev.x;
        this.lastY = ev.y;
        if (this.mode === 'pan') {
          this.phase = 'panning';
          return [
            { type: 'panStart', x: this.startX, y: this.startY },
            { type: 'pan', dx: ev.x - this.startX, dy: ev.y - this.startY },
          ];
        }
        this.phase = 'dragging';
        return [
          { type: 'dragStart', x: this.startX, y: this.startY },
          { type: 'dragMove', x: ev.x, y: ev.y },
        ];
      }
      case 'panning': {
        if (ev.id !== this.primary) return [];
        const dx = ev.x - this.lastX;
        const dy = ev.y - this.lastY;
        this.lastX = ev.x;
        this.lastY = ev.y;
        return [{ type: 'pan', dx, dy }];
      }
      case 'dragging':
        if (ev.id !== this.primary) return [];
        return [{ type: 'dragMove', x: ev.x, y: ev.y }];
      case 'pinching': {
        if (ev.id !== this.pinchIds[0] && ev.id !== this.pinchIds[1]) return [];
        const g = this.pinchGeometry();
        const scale = this.pinchDist > 0 && g.dist > 0 ? g.dist / this.pinchDist : 1;
        const act: GestureAction = { type: 'pinch', cx: g.cx, cy: g.cy, scale, dx: g.cx - this.pinchCx, dy: g.cy - this.pinchCy };
        if (g.dist > 0) this.pinchDist = g.dist;
        this.pinchCx = g.cx;
        this.pinchCy = g.cy;
        return [act];
      }
      default:
        return [];
    }
  }

  private lift(ev: GesturePointerEvent, cancelled: boolean): GestureAction[] {
    if (!this.pointers.has(ev.id)) return [];
    this.pointers.delete(ev.id);
    let out: GestureAction[] = [];
    switch (this.phase) {
      case 'pending':
        if (ev.id === this.primary) {
          if (!cancelled && this.tapAllowed) {
            out = [{ type: 'tap', x: this.startX, y: this.startY, pointerType: this.primaryType }];
          }
          this.phase = 'consumed';
        }
        break;
      case 'panning':
        if (ev.id === this.primary) {
          out = [{ type: 'panEnd' }];
          this.phase = 'consumed';
        }
        break;
      case 'dragging':
        if (ev.id === this.primary) {
          out = cancelled ? [{ type: 'dragCancel' }] : [{ type: 'dragEnd', x: ev.x, y: ev.y }];
          this.phase = 'consumed';
        }
        break;
      case 'pinching':
        if (ev.id === this.pinchIds[0] || ev.id === this.pinchIds[1]) {
          out = [{ type: 'pinchEnd' }];
          this.phase = 'consumed';
          if (this.pointers.size >= 2) out.push(...this.startPinch());
        }
        break;
      default:
        break;
    }
    if (this.pointers.size === 0) {
      this.phase = 'idle';
      this.primary = -1;
    }
    return out;
  }

  /** End the current one-pointer action without a tap. */
  private endCurrent(): GestureAction[] {
    const phase = this.phase;
    this.phase = 'consumed';
    if (phase === 'dragging') return [{ type: 'dragCancel' }];
    if (phase === 'panning') return [{ type: 'panEnd' }];
    if (phase === 'pinching') return [{ type: 'pinchEnd' }];
    return [];
  }

  private startPinch(): GestureAction[] {
    const ids = [...this.pointers.keys()];
    this.pinchIds = [ids[0] ?? -1, ids[1] ?? -1];
    const g = this.pinchGeometry();
    this.pinchDist = g.dist;
    this.pinchCx = g.cx;
    this.pinchCy = g.cy;
    this.phase = 'pinching';
    return [{ type: 'pinchStart', cx: g.cx, cy: g.cy }];
  }

  private pinchGeometry(): { cx: number; cy: number; dist: number } {
    const a = this.pointers.get(this.pinchIds[0]);
    const b = this.pointers.get(this.pinchIds[1]);
    if (!a || !b) return { cx: this.pinchCx, cy: this.pinchCy, dist: this.pinchDist };
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y) };
  }

  private fireLongPress(): GestureAction[] {
    this.phase = 'consumed';
    const p = this.pointers.get(this.primary);
    return [{ type: 'longPress', x: p?.x ?? this.startX, y: p?.y ?? this.startY, pointerType: this.primaryType }];
  }
}
