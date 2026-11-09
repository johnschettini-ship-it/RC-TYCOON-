import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  GestureRecognizer,
  LONG_PRESS_MS,
  type DragMode,
  type GestureAction,
  type GesturePointerEvent,
} from '../../../src/input/gestures';

type Ev = Partial<GesturePointerEvent> & Pick<GesturePointerEvent, 'type'>;

function make(mode: DragMode = 'pan'): { rec: GestureRecognizer; send: (e: Ev) => GestureAction[] } {
  const rec = new GestureRecognizer({ primaryDrag: () => mode });
  const send = (e: Ev): GestureAction[] =>
    rec.handle({ id: 1, x: 0, y: 0, t: 0, pointerType: 'touch', button: 0, ...e });
  return { rec, send };
}

const types = (acts: GestureAction[]): string[] => acts.map((a) => a.type);

describe('gesture recognizer: tap vs drag', () => {
  it('uses a 6 CSS px drag threshold and a 500 ms long press', () => {
    expect(DRAG_THRESHOLD_PX).toBe(6);
    expect(LONG_PRESS_MS).toBe(500);
  });

  it('a press that moves less than 6 px is a tap at the press point', () => {
    const { send } = make('build');
    send({ type: 'down', x: 100, y: 100 });
    expect(send({ type: 'move', x: 105, y: 100, t: 50 })).toEqual([]);
    expect(send({ type: 'up', x: 105, y: 100, t: 80 })).toEqual([{ type: 'tap', x: 100, y: 100, pointerType: 'touch' }]);
  });

  it('a move of exactly 6 px starts a build drag and release ends it (no tap)', () => {
    const { send } = make('build');
    send({ type: 'down', x: 100, y: 100 });
    expect(send({ type: 'move', x: 106, y: 100, t: 30 })).toEqual([
      { type: 'dragStart', x: 100, y: 100, pointerType: 'touch' },
      { type: 'dragMove', x: 106, y: 100 },
    ]);
    expect(send({ type: 'move', x: 140, y: 102, t: 40 })).toEqual([{ type: 'dragMove', x: 140, y: 102 }]);
    expect(send({ type: 'up', x: 140, y: 102, t: 60 })).toEqual([{ type: 'dragEnd', x: 140, y: 102, pointerType: 'touch' }]);
  });

  it('in pan mode a drag pans by the full finger movement and fires no tap', () => {
    const { send } = make('pan');
    send({ type: 'down', x: 10, y: 10 });
    expect(send({ type: 'move', x: 10, y: 18, t: 20 })).toEqual([
      { type: 'panStart', x: 10, y: 10 },
      { type: 'pan', dx: 0, dy: 8 },
    ]);
    expect(send({ type: 'move', x: 13, y: 20, t: 30 })).toEqual([{ type: 'pan', dx: 3, dy: 2 }]);
    expect(types(send({ type: 'up', x: 13, y: 20, t: 40 }))).toEqual(['panEnd']);
  });

  it('mouse left drag follows the tool mode; right and middle drags always pan without a tap', () => {
    const { send } = make('build');
    send({ type: 'down', pointerType: 'mouse', button: 2, x: 0, y: 0 });
    expect(types(send({ type: 'move', pointerType: 'mouse', x: 20, y: 0, t: 10 }))).toEqual(['panStart', 'pan']);
    expect(types(send({ type: 'up', pointerType: 'mouse', x: 20, y: 0, t: 20 }))).toEqual(['panEnd']);
    send({ type: 'down', pointerType: 'mouse', button: 1, x: 0, y: 0, t: 30 });
    expect(send({ type: 'up', pointerType: 'mouse', x: 0, y: 0, t: 40 })).toEqual([]);
    send({ type: 'down', pointerType: 'mouse', button: 0, x: 0, y: 0, t: 50 });
    expect(types(send({ type: 'move', pointerType: 'mouse', x: 0, y: 30, t: 60 }))).toEqual(['dragStart', 'dragMove']);
  });

  it('a mouse move with no button pressed is a hover', () => {
    const { send } = make();
    expect(send({ type: 'move', pointerType: 'mouse', x: 7, y: 9 })).toEqual([{ type: 'hover', x: 7, y: 9 }]);
  });

  it('cancel during a build drag cancels it and builds nothing', () => {
    const { send } = make('build');
    send({ type: 'down', x: 0, y: 0 });
    send({ type: 'move', x: 30, y: 0, t: 10 });
    expect(send({ type: 'cancel', x: 30, y: 0, t: 20 })).toEqual([{ type: 'dragCancel' }]);
  });
});

describe('gesture recognizer: second finger (Review Focus 4)', () => {
  it('second finger cancels a one-finger build drag and starts a pinch', () => {
    const { send } = make('build');
    send({ type: 'down', id: 1, x: 100, y: 100 });
    send({ type: 'move', id: 1, x: 150, y: 100, t: 20 });
    const acts = send({ type: 'down', id: 2, x: 250, y: 100, t: 40 });
    expect(acts).toEqual([{ type: 'dragCancel' }, { type: 'pinchStart', cx: 200, cy: 100 }]);
    // Lifting both fingers fires neither a drag end nor a tap.
    const lift = [...send({ type: 'up', id: 1, x: 150, y: 100, t: 60 }), ...send({ type: 'up', id: 2, x: 250, y: 100, t: 70 })];
    expect(types(lift)).toEqual(['pinchEnd']);
  });

  it('second finger during a pending press starts a pinch and no tap fires afterwards', () => {
    const { send } = make('pan');
    send({ type: 'down', id: 1, x: 100, y: 100 });
    expect(send({ type: 'down', id: 2, x: 200, y: 100, t: 10 })).toEqual([{ type: 'pinchStart', cx: 150, cy: 100 }]);
    const lift = [...send({ type: 'up', id: 2, x: 200, y: 100, t: 30 }), ...send({ type: 'up', id: 1, x: 100, y: 100, t: 40 })];
    expect(lift.some((a) => a.type === 'tap')).toBe(false);
  });

  it('second finger during a pan ends the pan and starts a pinch', () => {
    const { send } = make('pan');
    send({ type: 'down', id: 1, x: 0, y: 0 });
    send({ type: 'move', id: 1, x: 0, y: 20, t: 10 });
    expect(types(send({ type: 'down', id: 2, x: 100, y: 20, t: 20 }))).toEqual(['panEnd', 'pinchStart']);
  });

  it('pinch reports the zoom factor and the centre movement', () => {
    const { send } = make('pan');
    send({ type: 'down', id: 1, x: 100, y: 100 });
    send({ type: 'down', id: 2, x: 200, y: 100, t: 5 });
    // Spread to twice the distance, centre stays at (150, 100).
    expect(send({ type: 'move', id: 2, x: 300, y: 100, t: 10 })).toEqual([
      { type: 'pinch', cx: 200, cy: 100, scale: 2, dx: 50, dy: 0 },
    ]);
    const acts = send({ type: 'move', id: 1, x: 100, y: 120, t: 20 });
    expect(acts).toHaveLength(1);
    const p = acts[0] as Extract<GestureAction, { type: 'pinch' }>;
    expect(p.cy).toBe(110);
    expect(p.dy).toBe(10);
    expect(p.scale).toBeCloseTo(Math.hypot(200, 20) / 200, 10);
  });

  it('the remaining finger after a pinch neither pans, drags, nor taps', () => {
    const { send } = make('build');
    send({ type: 'down', id: 1, x: 0, y: 0 });
    send({ type: 'down', id: 2, x: 100, y: 0, t: 5 });
    expect(types(send({ type: 'up', id: 2, x: 100, y: 0, t: 10 }))).toEqual(['pinchEnd']);
    expect(send({ type: 'move', id: 1, x: 60, y: 0, t: 20 })).toEqual([]);
    expect(send({ type: 'up', id: 1, x: 60, y: 0, t: 30 })).toEqual([]);
    // A fresh press afterwards works normally.
    send({ type: 'down', id: 3, x: 0, y: 0, t: 40 });
    expect(types(send({ type: 'up', id: 3, x: 0, y: 0, t: 50 }))).toEqual(['tap']);
  });

  it('a second pointer that is a mouse is ignored (no pinch)', () => {
    const { send } = make('pan');
    send({ type: 'down', id: 1, x: 0, y: 0 });
    expect(send({ type: 'down', id: 9, pointerType: 'mouse', x: 50, y: 50, t: 5 })).toEqual([]);
  });
});

describe('gesture recognizer: long press', () => {
  it('fires after 500 ms without movement, then release fires no tap', () => {
    const { rec, send } = make('pan');
    send({ type: 'down', x: 40, y: 50, t: 1000 });
    expect(rec.update(1499)).toEqual([]);
    expect(rec.update(1500)).toEqual([{ type: 'longPress', x: 40, y: 50, pointerType: 'touch' }]);
    expect(rec.update(1600)).toEqual([]);
    expect(send({ type: 'move', x: 80, y: 50, t: 1700 })).toEqual([]);
    expect(send({ type: 'up', x: 80, y: 50, t: 1800 })).toEqual([]);
  });

  it('a move event after 500 ms still counts as a long press when the timer did not run', () => {
    const { send } = make('pan');
    send({ type: 'down', x: 0, y: 0, t: 0 });
    expect(types(send({ type: 'move', x: 2, y: 0, t: 520 }))).toEqual(['longPress']);
  });

  it('does not fire once the press became a drag', () => {
    const { rec, send } = make('pan');
    send({ type: 'down', x: 0, y: 0, t: 0 });
    send({ type: 'move', x: 20, y: 0, t: 100 });
    expect(rec.update(700)).toEqual([]);
  });

  it('does not fire for a build-mode press (path tools) or for a mouse', () => {
    const b = make('build');
    b.send({ type: 'down', x: 0, y: 0, t: 0 });
    expect(b.rec.update(900)).toEqual([]);
    expect(types(b.send({ type: 'up', x: 0, y: 0, t: 950 }))).toEqual(['tap']);
    const m = make('pan');
    m.send({ type: 'down', pointerType: 'mouse', x: 0, y: 0, t: 0 });
    expect(m.rec.update(900)).toEqual([]);
  });

  it('a quick tap before 500 ms is a tap', () => {
    const { rec, send } = make('pan');
    send({ type: 'down', x: 3, y: 4, t: 0 });
    expect(rec.update(300)).toEqual([]);
    expect(types(send({ type: 'up', x: 3, y: 4, t: 400 }))).toEqual(['tap']);
  });
});

describe('gesture recognizer: reset', () => {
  it('reset cancels an active build drag', () => {
    const { rec, send } = make('build');
    send({ type: 'down', x: 0, y: 0 });
    send({ type: 'move', x: 30, y: 0, t: 10 });
    expect(rec.reset()).toEqual([{ type: 'dragCancel' }]);
    expect(rec.active).toBe(false);
  });
});
