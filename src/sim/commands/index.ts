/** Command dispatch (master 5.3). Owner: integrator. */
import type { World } from '../types';
import { buildHandlers } from './build';
import { priceHandlers } from './prices';
import { trackHandlers } from '../rides/track/commands';
import { staffHandlers } from '../staff/commands';
import { managementHandlers } from '../management/commands';
import { terrainHandlers } from '../terrain/commands';
import { landHandlers } from '../land/commands';
import { sceneryHandlers } from '../scenery/commands';
import { afterDarkHandlers } from '../lighting/commands';
import { scenarioHandlers } from '../scenario/commands';
import { tutorialAfterCommand, tutorialHandlers } from '../tutorial/commands';
import { markFieldsDirty } from '../fields/api';
import type { Command, CommandContext, CommandResult, Handler, HandlerMap } from './types';

const handlers: HandlerMap<Command> = {
  ...buildHandlers,
  ...priceHandlers,
  ...trackHandlers,
  ...staffHandlers,
  ...managementHandlers,
  // Build 2 (Wave 3).
  ...terrainHandlers,
  ...landHandlers,
  ...sceneryHandlers,
  ...afterDarkHandlers,
  ...scenarioHandlers,
  ...tutorialHandlers,
};

export function executeCommand(world: World, cmd: Command, opts?: { setup?: boolean }): CommandResult {
  const ctx: CommandContext = { setup: opts?.setup === true };
  const handler = handlers[cmd.type] as Handler<Command> | undefined;
  if (!handler) return { ok: false, reason: `Unknown command ${String((cmd as { type: unknown }).type)}` };
  const result = handler(world, cmd, ctx);
  // Phase 5 §4.11: tutorial `sim` checks run after every successful command.
  if (result.ok) {
    // Calm and Buzz read after this command must see its change (W3-E: fields sync once per tick otherwise).
    markFieldsDirty(world, -1);
    tutorialAfterCommand(world, cmd, result);
  }
  return result;
}

export type { Command, CommandResult } from './types';
