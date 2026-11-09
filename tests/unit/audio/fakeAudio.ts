/**
 * A fake Web Audio context for unit tests (Node has no `AudioContext`). Owner: W4-A. It records nodes, connections,
 * source start/stop times, and parameter automation, and can evaluate an automated value at a time (a simplified
 * model of the Web Audio rules: set, linear, exponential, target, cancel).
 */

export interface Automation {
  kind: 'set' | 'linear' | 'exp' | 'target' | 'cancel';
  value: number;
  time: number;
  tc?: number;
}

export class FakeParam {
  events: Automation[] = [];
  constructor(
    readonly owner: FakeNode,
    readonly name: string,
    public value: number,
  ) {}

  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    if (!(value > 0) && !(value < 0)) throw new RangeError('exponential ramp to 0');
    this.events.push({ kind: 'exp', value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number, tc: number): this {
    this.events.push({ kind: 'target', value, time, tc });
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events = this.events.filter((e) => e.time < time);
    this.events.push({ kind: 'cancel', value: 0, time });
    return this;
  }

  /** The automated value at time `t` (simplified Web Audio rules). */
  at(t: number): number {
    let v = this.value;
    let vt = 0;
    let target: { value: number; time: number; tc: number } | null = null;
    const evs = this.events.filter((e) => e.kind !== 'cancel');
    const settle = (until: number): void => {
      if (target && until > target.time) {
        v = target.value + (v - target.value) * Math.exp(-(until - target.time) / target.tc);
        target = { ...target, time: until };
      }
    };
    for (const e of evs) {
      if (e.kind === 'set' || e.kind === 'target') {
        if (e.time > t) break;
        settle(e.time);
        if (e.kind === 'set') {
          v = e.value;
          target = null;
        } else {
          target = { value: e.value, time: e.time, tc: e.tc ?? 0.01 };
        }
        vt = e.time;
      } else {
        settle(Math.min(t, e.time));
        target = null;
        if (e.time <= t) {
          v = e.value;
          vt = e.time;
        } else {
          const f = (t - vt) / (e.time - vt);
          v = e.kind === 'linear' ? v + (e.value - v) * f : v * (e.value / v) ** f;
          return v;
        }
      }
    }
    settle(t);
    return v;
  }
}

export class FakeNode {
  outputs: (FakeNode | FakeParam)[] = [];
  params: Record<string, FakeParam> = {};
  disconnected = false;
  type = '';
  constructor(
    readonly ctx: FakeAudioContext,
    readonly kind: string,
  ) {
    ctx.nodes.push(this);
  }

  protected param(name: string, value: number): FakeParam {
    const p = new FakeParam(this, name, value);
    this.params[name] = p;
    return p;
  }

  connect<T extends FakeNode | FakeParam>(dest: T): T {
    this.outputs.push(dest);
    this.disconnected = false;
    return dest;
  }

  disconnect(dest?: FakeNode | FakeParam): void {
    if (dest === undefined) {
      this.outputs = [];
      this.disconnected = true;
    } else {
      this.outputs = this.outputs.filter((o) => o !== dest);
    }
  }
}

export class FakeGain extends FakeNode {
  readonly gain = this.param('gain', 1);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'gain');
  }
}

export class FakePanner extends FakeNode {
  readonly pan = this.param('pan', 0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'panner');
  }
}

export class FakeBiquad extends FakeNode {
  readonly frequency = this.param('frequency', 350);
  readonly Q = this.param('Q', 1);
  readonly gain = this.param('gain', 0);
  readonly detune = this.param('detune', 0);
  override type = 'lowpass';
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'biquad');
  }
}

export class FakeCompressor extends FakeNode {
  readonly threshold = this.param('threshold', -24);
  readonly knee = this.param('knee', 30);
  readonly ratio = this.param('ratio', 12);
  readonly attack = this.param('attack', 0.003);
  readonly release = this.param('release', 0.25);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'compressor');
  }
}

export class FakeSource extends FakeNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  startOffset = 0;
  startDuration: number | undefined;
  onended: (() => void) | null = null;

  start(when = 0, offset = 0, duration?: number): void {
    if (this.startTime !== null) throw new Error(`${this.kind} started twice`);
    this.startTime = when;
    this.startOffset = offset;
    this.startDuration = duration;
  }

  stop(when = 0): void {
    if (this.startTime === null) throw new Error(`${this.kind} stopped before start`);
    this.stopTime = this.stopTime === null ? when : Math.min(this.stopTime, when);
  }

  /** When the source is silent for good (stop, or the end of a one-off buffer). */
  get endTime(): number {
    const ends: number[] = [];
    if (this.stopTime !== null) ends.push(this.stopTime);
    if (this.startTime !== null && this.startDuration !== undefined) ends.push(this.startTime + this.startDuration);
    if (this instanceof FakeBufferSource && !this.loop && this.buffer && this.startTime !== null) ends.push(this.startTime + this.buffer.duration);
    return ends.length > 0 ? Math.min(...ends) : Infinity;
  }
}

export class FakeOscillator extends FakeSource {
  readonly frequency = this.param('frequency', 440);
  readonly detune = this.param('detune', 0);
  override type = 'sine';
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'oscillator');
  }
}

export class FakeBuffer {
  readonly duration: number;
  private data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.duration = length / sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c: number): Float32Array {
    const d = this.data[c];
    if (!d) throw new Error('bad channel');
    return d;
  }
  copyToChannel(src: Float32Array, c: number): void {
    this.getChannelData(c).set(src.subarray(0, this.length));
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = this.param('playbackRate', 1);
  readonly detune = this.param('detune', 0);
  constructor(ctx: FakeAudioContext) {
    super(ctx, 'bufferSource');
  }
}

export type FakeState = 'suspended' | 'running' | 'closed';

export class FakeAudioContext {
  nodes: FakeNode[] = [];
  currentTime = 0;
  readonly sampleRate: number;
  state: FakeState;
  resumeCalls = 0;
  suspendCalls = 0;
  readonly destination: FakeNode;

  constructor(opts: { state?: FakeState; sampleRate?: number } = {}) {
    this.state = opts.state ?? 'suspended';
    this.sampleRate = opts.sampleRate ?? 8_000;
    this.destination = new FakeNode(this, 'destination');
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspendCalls++;
    if (this.state !== 'closed') this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain(): FakeGain {
    return new FakeGain(this);
  }
  createStereoPanner(): FakePanner {
    return new FakePanner(this);
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad(this);
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor(this);
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator(this);
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this);
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(channels, length, sampleRate);
  }

  // ---- inspection helpers ----

  ofKind<T extends FakeNode>(kind: string): T[] {
    return this.nodes.filter((n) => n.kind === kind) as T[];
  }

  sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }

  /** Does audio from `from` reach `to`? A connection into a parameter (FM, vibrato, tremolo) flows on through its node. */
  reaches(from: FakeNode, to: FakeNode): boolean {
    const seen = new Set<FakeNode>();
    const stack: FakeNode[] = [from];
    while (stack.length > 0) {
      const n = stack.pop() as FakeNode;
      if (n === to) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const o of n.outputs) stack.push(o instanceof FakeNode ? o : o.owner);
    }
    return false;
  }
}

/** The fake as the engine's context factory expects it. */
export function asAudioContext(ctx: FakeAudioContext): AudioContext {
  return ctx as unknown as AudioContext;
}
