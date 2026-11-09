/**
 * Management strings (Phase 3 §4.6–4.9, §4.14, §4.16, §6). Owner: W1-I.
 * Master R4: no final period. `{name}` style params are filled by `text()` in en.ts.
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
  researchComplete: 'msg.research.complete',
  campaignEnded: 'msg.marketing.ended',
  campaignTargetRemoved: 'msg.marketing.targetRemoved',
  cashNegative: 'msg.finance.cashNegative',
  storm: 'msg.weather.storm',
} as const;

/** Weather thought ids (§4.16, master R5). */
export const WEATHER_THOUGHTS = {
  rainNoUmbrella: 'thought.rainNoUmbrella',
  umbrella: 'thought.goodUmbrella',
  tooHot: 'thought.tooHot',
  cold: 'thought.cold',
  stormClosed: 'thought.stormClosed',
} as const;

export const managementStrings: Record<string, string> = {
  [MSG.researchRide]: 'New ride available: {name}',
  [MSG.researchTrackRide]: 'New track ride available: {name}',
  [MSG.researchStall]: 'New stall available: {name}',
  [MSG.researchComplete]: 'All research is complete',
  [MSG.campaignEnded]: '{campaign} has ended',
  [MSG.campaignTargetRemoved]: '{campaign} ended early because its target was removed',
  [MSG.cashNegative]: 'Cash is negative. Repay costs or take a loan',
  [MSG.storm]: 'A storm is here. Tall rides pause until it passes',
  [WEATHER_THOUGHTS.rainNoUmbrella]: 'It is raining and I have no umbrella',
  [WEATHER_THOUGHTS.umbrella]: 'Good thing I have an umbrella',
  [WEATHER_THOUGHTS.tooHot]: 'It is too hot',
  [WEATHER_THOUGHTS.cold]: 'Brr, it is cold',
  [WEATHER_THOUGHTS.stormClosed]: 'They closed it for the storm',
  'weather.sunny': 'Sunny',
  'weather.cloudy': 'Cloudy',
  'weather.rain': 'Rain',
  'weather.storm': 'Storm',
  'weather.hot': 'Hot',
  'weather.cold': 'Cold',
  /** HUD tooltip, for example "Rain now · Cloudy next" (§7.1). */
  'weather.forecast': '{now} now · {next} next',
};
