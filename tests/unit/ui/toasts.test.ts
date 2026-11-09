import { describe, expect, it } from 'vitest';
import { TOAST_MS, ToastQueue, toastForResult } from '../../../src/ui/toasts';

describe('toast queue (Phase 1 §7: 3 s, one at a time, newest replaces oldest)', () => {
  it('shows a toast for 3 seconds', () => {
    expect(TOAST_MS).toBe(3000);
    const q = new ToastQueue();
    q.show('Not enough cash', 'error', 1000);
    expect(q.current(1000)?.message).toBe('Not enough cash');
    expect(q.current(3999)?.message).toBe('Not enough cash');
    expect(q.current(4000)).toBeNull();
  });

  it('a newer toast replaces the older one, which never comes back', () => {
    const q = new ToastQueue();
    q.show('first', 'error', 0);
    q.show('second', 'warning', 1000);
    expect(q.current(1500)).toMatchObject({ message: 'second', kind: 'warning' });
    expect(q.current(3500)?.message).toBe('second');
    expect(q.current(4000)).toBeNull();
    expect(q.current(100)).toBeNull();
  });

  it('each toast gets a new id so the view can restart its animation', () => {
    const q = new ToastQueue();
    const a = q.show('same', 'error', 0);
    const b = q.show('same', 'error', 10);
    expect(b.id).not.toBe(a.id);
  });

  it('dismiss hides the current toast', () => {
    const q = new ToastQueue();
    q.show('x', 'info', 0);
    q.dismiss();
    expect(q.current(1)).toBeNull();
  });
});

describe('toasts for command results', () => {
  it('a failed command shows its reason as an error', () => {
    expect(toastForResult({ ok: false, reason: 'Something is in the way' })).toEqual({ message: 'Something is in the way', kind: 'error' });
  });

  it('warnings show as a warning toast', () => {
    expect(toastForResult({ ok: true, cost: 100, warnings: ['The entrance needs a queue path', 'The exit needs a footpath'] })).toEqual({
      message: 'The entrance needs a queue path · The exit needs a footpath',
      kind: 'warning',
    });
  });

  it('a clean success shows nothing', () => {
    expect(toastForResult({ ok: true, cost: 100, warnings: [] })).toBeNull();
  });
});
