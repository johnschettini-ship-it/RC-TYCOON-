/** Scenario names, goals, end reasons, sandbox options (Phase 5). Owner: W3-H. Exact spec text, no final period (master R4). */

/** Command and rule messages returned by the scenario sim (`reason` strings). */
export const SCENARIO_ERR = {
  notScenario: 'There is no scenario to continue',
  stillRunning: 'The scenario is still running',
  notSandbox: 'Only a sandbox has these options',
  notLive: 'This option cannot change during play',
  badValue: 'That value is not allowed here',
  afterDarkForced: 'After Dark is always on in this scenario',
  afterDarkOff: 'After Dark is off in this scenario',
} as const;

export const scenarioStrings: Record<string, string> = {
  // Goals (Phase 5 §4.3). Money params are formatted text; ratings 0–1000; excitement as "6.50".
  'scenario.goal.guestsInPark': 'Have {count} guests in the park',
  'scenario.goal.guestsInParkRating': 'Have {count} guests in the park with a park rating of at least {rating}',
  'scenario.goal.parkRatingHeld': 'Keep a park rating of at least {rating} for {months} months in a row',
  'scenario.goal.parkRatingHeld1': 'Keep a park rating of at least {rating} for a whole month',
  'scenario.goal.parkValue': 'Reach a park value of {value}',
  'scenario.goal.monthlyRideIncome': 'Earn {amount} from ride tickets every month for {months} months in a row',
  'scenario.goal.monthlyRideIncome1': 'Earn {amount} from ride tickets in one month',
  'scenario.goal.monthlyProfit': 'Make a profit of {amount} every month for {months} months in a row',
  'scenario.goal.monthlyProfit1': 'Make a profit of {amount} in one month',
  'scenario.goal.coasterExcitement': 'Open {count} coasters with an excitement of at least {excitement}',
  'scenario.goal.coasterExcitementIntensity': 'Open {count} coasters with an excitement of at least {excitement} and an intensity of at most {intensity}',
  'scenario.goal.coasterExcitement1': 'Open a coaster with an excitement of at least {excitement}',
  'scenario.goal.ridesOpen': 'Have {count} rides open',
  'scenario.goal.ridesOpenFlag': 'Have {count} {flag} rides open',
  'scenario.goal.ridesOpenTag': 'Have {count} {tag} rides open',
  'scenario.goal.repayLoan': 'Pay back the whole loan',
  'scenario.goal.temperamentBalance':
    'For {months} months, average {guests} guests with at least {share}% Thrill and {share}% Chill guests, both groups at happiness {happiness} or more',
  'scenario.goal.temperamentBalance1':
    'For a month, average {guests} guests with at least {share}% Thrill and {share}% Chill guests, both groups at happiness {happiness} or more',
  'scenario.goal.afterDarkHappiness': 'With After Dark on, average {guests} guests at night at happiness {happiness} or more for {months} months',
  'scenario.goal.afterDarkHappiness1': 'With After Dark on, average {guests} guests at night at happiness {happiness} or more for a month',
  'scenario.flag.spooky': 'spooky',
  'scenario.flag.covered': 'covered',
  'scenario.flag.tall': 'tall',
  'scenario.tag.thrill': 'Thrill',
  'scenario.tag.family': 'Family',
  'scenario.tag.chill': 'Chill',

  // Deadline (Phase 5 §7) and end reasons (§4.4).
  'scenario.monthsLeft': '{n} months left',
  'scenario.monthLeft': '1 month left',
  'scenario.lastMonth': 'Last month',
  'scenario.pastDeadline': 'Past the deadline',
  'scenario.noTimeLimit': 'No time limit',
  'scenario.won': 'Scenario complete',
  'scenario.lost': 'Scenario failed',
  'scenario.end.timeUp': 'Time ran out',
  'scenario.end.bankrupt': 'The park went bankrupt',
  'scenario.end.ratingCollapse': 'The park rating stayed below 200 for too long',

  // Difficulty presets (§4.8) and climates (§4.9).
  'scenario.difficulty.relaxed': 'Relaxed',
  'scenario.difficulty.standard': 'Standard',
  'scenario.difficulty.tough': 'Tough',
  'scenario.climate.temperate': 'Temperate',
  'scenario.climate.cold': 'Cold',
  'scenario.climate.hot': 'Hot',
  'scenario.climate.coastal': 'Coastal',

  // Sandbox options (§4.5).
  'scenario.sandbox.mapSize': 'Map size',
  'scenario.sandbox.terrainStyle': 'Terrain style',
  'scenario.sandbox.seed': 'Seed',
  'scenario.sandbox.randomSeed': 'Random',
  'scenario.sandbox.climate': 'Climate',
  'scenario.sandbox.afterDark': 'After Dark',
  'scenario.sandbox.unlimitedMoney': 'Unlimited money',
  'scenario.sandbox.allUnlocked': 'All items unlocked',
  'scenario.sandbox.guestsArrive': 'Guests arrive',
  'scenario.sandbox.breakdowns': 'Breakdowns',
  'scenario.sandbox.weather': 'Weather',
  'scenario.sandbox.weather.normal': 'Normal',
  'scenario.sandbox.weather.alwaysSunny': 'Always sunny',
  'scenario.sandbox.awards': 'Awards',
  'scenario.sandbox.on': 'On',
  'scenario.sandbox.off': 'Off',
  'scenario.sandbox.largeMapWarning': 'Large maps can run slowly on phones',
  'scenario.sandbox.unlimitedCash': '∞',
  'scenario.style.flat': 'Flat',
  'scenario.style.rollingHills': 'Rolling hills',
  'scenario.style.mountains': 'Mountains',
  'scenario.style.islands': 'Islands',
  'scenario.style.riverValley': 'River valley',

  // Command and rule messages (also in SCENARIO_ERR for the sim).
  'scenario.err.notScenario': SCENARIO_ERR.notScenario,
  'scenario.err.stillRunning': SCENARIO_ERR.stillRunning,
  'scenario.err.notSandbox': SCENARIO_ERR.notSandbox,
  'scenario.err.notLive': SCENARIO_ERR.notLive,
  'scenario.err.badValue': SCENARIO_ERR.badValue,
  'scenario.afterDark.forced': SCENARIO_ERR.afterDarkForced,
  'scenario.afterDark.off': SCENARIO_ERR.afterDarkOff,
};
