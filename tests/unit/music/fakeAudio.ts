/**
 * A fake Web Audio context for the music player tests (Node has no `AudioContext`). Not a test file. Owner: W4-B.
 * It records the graph (connections), parameter automation, and source start/stop times, and checks arguments the
 * way browsers do (finite times and values, no exponential ramp to 0, no negative start time).
 */

export type ParamEvent =
  | { type: 'set'; value: number; time: number }
  | { type: 'linear'; value: number; time: number }
  | { type: 'exp'; value: number; time: number }
  | { type: 'cancel'; time: number };

function finite(...xs: number[]): void {
  for (const x of xs) if (!Number.isFinite(x)) throw new TypeError(`non-finite value ${x}`);
}

export class FakeParam {
  events: ParamEvent[] = [];
  /** The plain `value` when the first automation event arrived. */
  private base: number;
  constructor(public value: number) {
    this.base = value;
  }
  private add(e: ParamEvent): void {
    if (this.events.length === 0) this.base = this.value;
    this.events.push(e);
  }
  setValueAtTime(value: number, time: number): this {
    finite(value, time);
    this.add({ type: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    finite(value, time);
    this.add({ type: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    finite(value, time);
    if (value === 0) throw new RangeError('exponential ramp to 0');
    this.add({ type: 'exp', value, time });
    return this;
  }
  cancelScheduledValues(time: number): this {
    finite(time);
    this.events = this.events.filter((e) => e.time < time);
    this.add({ type: 'cancel', time });
    return this;
  }
  /** Value at time `t` from the automation events (ramps interpolate from the previous event). */
  at(t: number): number {
    const evs = this.events.filter((e) => e.type !== 'cancel') as Exclude<ParamEvent, { type: 'cancel' }>[];
    if (evs.length === 0) return this.value;
    let v = this.base;
    let tPrev = 0;
    for (const e of evs) {
      if (e.time <= t) {
        v = e.value;
        tPrev = e.time;
        continue;
      }
      if (e.type === 'set') return v;
      const k = (t - tPrev) / (e.time - tPrev);
      return e.type === 'linear' ? v + (e.value - v) * k : v * Math.pow(e.value / v, k);
    }
    return v;
  }
}

type Dest = FakeNode | FakeParam;

export class FakeNode {
  outputs: Dest[] = [];
  /** Every destination ever connected (kept after a disconnect). */
  history: Dest[] = [];
  disconnected = false;
  constructor(
    public ctx: FakeContext,
    public kind: string,
  ) {
    ctx.nodes.push(this);
  }
  connect<T extends Dest>(dest: T): T {
    if (!this.outputs.includes(dest)) this.outputs.push(dest);
    if (!this.history.includes(dest)) this.history.push(dest);
    return dest;
  }
  disconnect(dest?: Dest): void {
    if (dest) this.outputs = this.outputs.filter((d) => d !== dest);
    else this.outputs = [];
    if (this.outputs.length === 0) this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
  constructor(ctx: FakeContext) {
    super(ctx, 'gain');
  }
}

export class FakeSource extends FakeNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  onended: (() => void) | null = null;
  ended = false;
  start(time = 0): void {
    finite(time);
    if (time < 0) throw new RangeError('negative start time');
    if (this.startTime !== null) throw new Error('started twice');
    this.startTime = time;
  }
  stop(time = 0): void {
    finite(time);
    if (time < 0) throw new RangeError('negative stop time');
    if (this.startTime === null) throw new Error('stop before start');
    this.stopTime = time;
  }
}

export class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  constructor(ctx: FakeContext) {
    super(ctx, 'oscillator');
  }
}

export class FakeBuffer {
  private data: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number): Float32Array {
    const d = this.data[c];
    if (!d) throw new RangeError('channel');
    return d;
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  constructor(ctx: FakeContext) {
    super(ctx, 'bufferSource');
  }
}

export class FakeBiquad extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
  constructor(ctx: FakeContext) {
    super(ctx, 'biquad');
  }
}

export class FakeDelay extends FakeNode {
  delayTime = new FakeParam(0);
  constructor(
    ctx: FakeContext,
    public maxDelayTime: number,
  ) {
    super(ctx, 'delay');
  }
}

export class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
  normalize = true;
  constructor(ctx: FakeContext) {
    super(ctx, 'convolver');
  }
}

export class FakeContext {
  currentTime = 0;
  sampleRate = 48_000;
  state: AudioContextState = 'running';
  nodes: FakeNode[] = [];
  destination: FakeNode;
  constructor() {
    this.destination = new FakeNode(this, 'destination');
  }
  createGain(): FakeGain {
    return new FakeGain(this);
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator(this);
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this);
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad(this);
  }
  createDelay(max = 1): FakeDelay {
    return new FakeDelay(this, max);
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver(this);
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    if (!(channels >= 1 && length >= 1 && rate > 0)) throw new RangeError('buffer');
    return new FakeBuffer(channels, length, rate);
  }
  /** Move the clock to `t` and fire `onended` of every source stopped by then (as the browser does). */
  advance(t: number): void {
    this.currentTime = t;
    for (const n of this.nodes)
      if (n instanceof FakeSource && !n.ended && n.stopTime !== null && n.stopTime <= t) {
        n.ended = true;
        n.onended?.();
      }
  }
  of<T extends FakeNode>(type: abstract new (...args: never[]) => T): T[] {
    return this.nodes.filter((n): n is T => n instanceof type);
  }
  asAudio(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
}

/** Does `from` reach `to` through node connections? */
export function reaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const stack: FakeNode[] = [from];
  while (stack.length > 0) {
    const n = stack.pop() as FakeNode;
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of n.outputs) if (d instanceof FakeNode) stack.push(d);
  }
  return false;
}

/** A manual 25 ms timer: the test fires it. */
export class FakeTimer {
  fn: (() => void) | null = null;
  ms = 0;
  sets = 0;
  clears = 0;
  set = (fn: () => void, ms: number): number => {
    this.fn = fn;
    this.ms = ms;
    this.sets++;
    return this.sets;
  };
  clear = (_handle: unknown): void => {
    this.fn = null;
    this.clears++;
  };
  fire(): void {
    this.fn?.();
  }
}
