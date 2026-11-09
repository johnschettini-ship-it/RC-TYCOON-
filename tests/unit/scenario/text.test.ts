/** Scenario strings (master R4) and the goal, deadline, and end-reason texts (Phase 5 §4.3, §4.4, §7). */
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../../src/data/scenarios';
import { text } from '../../../src/data/strings/en';
import { SCENARIO_ERR, scenarioStrings } from '../../../src/data/strings/scenario';
import { deadlineText, endReasonText, objectiveText, plainMoney, ratingText } from '../../../src/sim/scenario/text';

const say = (ref: { id: string; params: Record<string, string | number> }): string => text(ref.id, ref.params);

describe('scenario strings (master R4)', () => {
  it('every key starts with scenario. and no message ends with a period', () => {
    for (const [k, v] of Object.entries(scenarioStrings)) {
      expect(k.startsWith('scenario.'), k).toBe(true);
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
    for (const v of Object.values(SCENARIO_ERR)) expect(/\.$/.test(v)).toBe(false);
    for (const s of SCENARIOS) expect(/\.$/.test(s.description), s.id).toBe(false);
  });

  it('spec strings are exact', () => {
    expect(text('scenario.sandbox.largeMapWarning')).toBe('Large maps can run slowly on phones');
    expect(say(deadlineText(11, 3))).toBe('8 months left');
    expect(text('scenario.difficulty.relaxed')).toBe('Relaxed');
  });
});

describe('goal texts', () => {
  it('every scenario goal has a sentence with all its numbers filled in', () => {
    for (const s of SCENARIOS) {
      for (const obj of s.objectives) {
        const line = say(objectiveText(obj));
        expect(line, `${s.id} ${obj.type}`).not.toMatch(/[{}]|scenario\./);
      }
    }
  });

  it('reads like the scenario table', () => {
    const [meadow] = SCENARIOS[0]!.objectives;
    expect(say(objectiveText(meadow!))).toBe('Have 250 guests in the park with a park rating of at least 500');
    expect(say(objectiveText(SCENARIOS[3]!.objectives[0]!))).toBe('Open 2 coasters with an excitement of at least 6.50 and an intensity of at most 8.50');
    expect(say(objectiveText(SCENARIOS[4]!.objectives[0]!))).toBe('Have 3 spooky rides open');
    expect(say(objectiveText(SCENARIOS[5]!.objectives[2]!))).toBe('Reach a park value of $120,000');
    expect(say(objectiveText(SCENARIOS[1]!.objectives[1]!))).toBe('Make a profit of $5,000 in one month');
    expect(say(objectiveText(SCENARIOS[6]!.objectives[1]!))).toBe('Keep a park rating of at least 650 for 3 months in a row');
    expect(say(objectiveText({ type: 'ridesOpen', count: 4, tag: 'thrill' }))).toBe('Have 4 Thrill rides open');
    expect(say(objectiveText({ type: 'parkValue', value: 1 }, (c) => `${c}¢`))).toBe('Reach a park value of 1¢');
  });

  it('money and rating formats', () => {
    expect(plainMoney(12_000_000)).toBe('$120,000');
    expect(plainMoney(123_456)).toBe('$1,234.56');
    expect(plainMoney(-500)).toBe('-$5');
    expect(ratingText(650)).toBe('6.50');
    expect(ratingText(1005)).toBe('10.05');
  });
});

describe('deadline and end texts', () => {
  it('counts months left; the last month and past the deadline have their own lines', () => {
    expect(say(deadlineText(11, 10))).toBe('1 month left');
    expect(say(deadlineText(11, 11))).toBe('Last month');
    expect(say(deadlineText(11, 13))).toBe('Past the deadline');
    expect(say(deadlineText(null, 4))).toBe('No time limit');
    expect(say(endReasonText('timeUp'))).toBe('Time ran out');
    expect(say(endReasonText('bankrupt'))).toBe('The park went bankrupt');
    expect(say(endReasonText('ratingCollapse'))).toBe('The park rating stayed below 200 for too long');
  });
});
