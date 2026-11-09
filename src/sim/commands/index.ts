/** Command dispatch (master 5.3). Owner: integrator. */
import type { World } from '../types';
import { buildHandlers } from './build';
import { priceHandlers } from './prices';
import { trackHandlers } from '../rides/track/commands';
import { staffHandlers } from '../staff/commands';
import { managementHandlers } from '../management/commands';
import type { Command, CommandContext, CommandResult, Handler, HandlerMap } from './types';

const handlers: HandlerMap<Command> = {
  ...buildHandlers,
  ...priceHandlers,
  ...trackHandlers,
  ...staffHandlers,
  ...managementHandlers,
};

export function executeCommand(world: World, cmd: Command, opts?: { setup?: boolean }): CommandResult {
  const ctx: CommandContext = { setup: opts?.setup === true };
  const handler = handlers[cmd.type] as Handler<Command> | undefined;
  if (!handler) return { ok: false, reason: `Unknown command ${String((cmd as { type: unknown }).type)}` };
  return handler(world, cmd, ctx);
}

export type { Command, CommandResult } from './types';
