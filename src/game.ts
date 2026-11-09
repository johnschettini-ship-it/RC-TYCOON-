/** Game facade: world + loop + dispatch + event fan-out. Owner: integrator. */
import { executeCommand, type Command, type CommandResult } from './sim/commands';
import { drainEvents } from './sim/events';
import { stepTick } from './sim/tick';
import type { SimEvent, World } from './sim/types';
import { advance, alphaOf, type Speed } from './loop';
import { defaultToolState, type Camera, type Renderer, type ToolState } from './render/types';

export type EventListener = (events: SimEvent[]) => void;
export type CommandListener = (cmd: Command, result: CommandResult) => void;

export class Game {
  world: World;
  speed: Speed = 0;
  camera: Camera = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
  tool: ToolState = defaultToolState();
  /** Set when the state changed since the last save. */
  dirty = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private eventListeners: EventListener[] = [];
  private commandListeners: CommandListener[] = [];
  private frameListeners: Array<() => void> = [];
  private worldListeners: Array<(w: World) => void> = [];

  constructor(world: World, private renderer: Renderer | null = null) {
    this.world = world;
  }

  setRenderer(r: Renderer): void {
    this.renderer = r;
  }

  /** Replace the world (new game, load). The game starts paused. */
  setWorld(world: World): void {
    this.world = world;
    this.speed = 0;
    this.acc = 0;
    this.dirty = false;
    for (const l of this.worldListeners) l(world);
  }

  dispatch(cmd: Command): CommandResult {
    const result = executeCommand(this.world, cmd);
    if (result.ok) this.dirty = true;
    for (const l of this.commandListeners) l(cmd, result);
    return result;
  }

  onEvents(cb: EventListener): void {
    this.eventListeners.push(cb);
  }

  onCommand(cb: CommandListener): void {
    this.commandListeners.push(cb);
  }

  onFrame(cb: () => void): void {
    this.frameListeners.push(cb);
  }

  onWorldChanged(cb: (w: World) => void): void {
    this.worldListeners.push(cb);
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
  }

  /** Run `n` ticks now (tests and debug). */
  step(n: number): void {
    for (let i = 0; i < n; i++) stepTick(this.world);
    if (n > 0) this.dirty = true;
  }

  frame(nowMs: number): void {
    const elapsed = this.last === 0 ? 0 : nowMs - this.last;
    this.last = nowMs;
    const { ticks, accMs } = advance(this.acc, elapsed, this.speed);
    this.acc = accMs;
    for (let i = 0; i < ticks; i++) stepTick(this.world);
    if (ticks > 0) this.dirty = true;
    if (this.world.events.length > 0) {
      const evs = drainEvents(this.world);
      for (const l of this.eventListeners) l(evs);
    }
    this.renderer?.draw(this.world, this.camera, this.tool, alphaOf(this.acc, this.speed));
    for (const l of this.frameListeners) l();
  }

  start(): void {
    const loop = (t: number): void => {
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.raf);
      } else {
        this.last = 0;
        this.raf = requestAnimationFrame(loop);
      }
    });
  }
}
