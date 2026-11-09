/** Step helpers for W1-H tests. Import after the vi.mock calls of the test file. */
import type { World } from '../../../src/sim/types';
import { updateStaff, hourlyStaff } from '../../../src/sim/staff/update';
import { updateBreakdowns } from '../../../src/sim/breakdowns/update';
import { isHourStart } from '../../../src/sim/time';

/** Run only this workstream's systems, in tick.ts order, so other systems cannot change the result. */
export function stepStaffSystems(world: World, n = 1): void {
  for (let k = 0; k < n; k++) {
    updateStaff(world);
    updateBreakdowns(world);
    if (isHourStart(world.state.tick)) hourlyStaff(world);
    world.state.tick += 1;
  }
}

