/**
 * Management strings (Phase 3 §4.6–4.9, §4.14, §6). Owner: W1-I.
 * Master R4: no final period. `{name}` style params are filled by `text()` in en.ts.
 * Weather and marketing guest thoughts (§4.16) use the guest module's ids and texts: `THOUGHT` in
 * `src/sim/guests/thoughts.ts`, texts in `./guests.ts`.
 */

/** Command failure reasons (§6), returned as `reason` and shown in a toast. */
export const MANAGEMENT_ERRORS = {
  unknownCategory: 'Unknown category',
  unknownBudget: 'Unknown budget level',
  notEnoughCash: 'Not enough cash',
  campaignRunning: 'Campaign already running',
  weekendsExclusive: 'Thrill and Chill Weekends cannot run together',
  pickTarget: 'Pick a target',
  unknownCampaign: 'Unknown campaign',
  loanLimit: 'Loan limit reached',
  loanStep: 'Amount must be a multiple of $1,000',
  noLoan: 'No loan to repay',
} as const;

/** Message log text ids (§4.14). */
export const MSG = {
  researchRide: 'msg.research.newRide',
  researchTrackRide: 'msg.research.newTrackRide',
  researchStall: 'msg.research.newStall',
  researchScenery: 'msg.research.newScenery',
  researchComplete: 'msg.research.complete',
  campaignEnded: 'msg.marketing.ended',
  campaignTargetRemoved: 'msg.marketing.targetRemoved',
  cashNegative: 'msg.finance.cashNegative',
  storm: 'msg.weather.storm',
} as const;

export const managementStrings: Record<string, string> = {
  [MSG.researchRide]: 'New ride available: {name}',
  [MSG.researchTrackRide]: 'New track ride available: {name}',
  [MSG.researchStall]: 'New stall available: {name}',
  [MSG.researchScenery]: 'New scenery available: {name}',
  [MSG.researchComplete]: 'All research is complete',
  [MSG.campaignEnded]: '{campaign} has ended',
  [MSG.campaignTargetRemoved]: '{campaign} ended early because its target was removed',
  [MSG.cashNegative]: 'Cash is negative. Repay costs or take a loan',
  [MSG.storm]: 'A storm is here. Tall rides pause until it passes',
  'weather.sunny': 'Sunny',
  'weather.cloudy': 'Cloudy',
  'weather.rain': 'Rain',
  'weather.storm': 'Storm',
  'weather.hot': 'Hot',
  'weather.cold': 'Cold',
  /** HUD tooltip, for example "Rain now · Cloudy next" (§7.1). */
  'weather.forecast': '{now} now · {next} next',
};
