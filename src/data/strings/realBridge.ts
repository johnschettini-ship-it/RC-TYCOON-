/**
 * The title-to-play bridge (VITE_ART=real build with the realistic look; `src/ui/bridge/`): the welcome card and the
 * "Make the poster real" goal panel. `./en.ts` adds them only in the VITE_ART=real build, so the website's string
 * table is unchanged. No final period (master R4).
 */
export const realBridgeStrings: Record<string, string> = {
  /** The welcome card on a new park: "Welcome to" over the game's name (`ui.title.name`). */
  'ui.welcome.to': 'Welcome to',
  'ui.welcome.body': 'Your park is an empty field. Build the park on the poster!',
  'ui.welcome.go': "Let's go",
  /** The "Make the poster real" goal panel: its title, its count ("1 of 5"), the five goals and their states. */
  'ui.goal.title': 'Make the poster real',
  'ui.goal.count': '{n} of {total}',
  'ui.goal.wheel': 'Big wheel',
  'ui.goal.coaster': 'Coaster',
  'ui.goal.stalls': 'Striped stalls',
  'ui.goal.arch': 'Gate arch',
  'ui.goal.crowd': 'Happy crowd',
  'ui.goal.done': 'done',
  'ui.goal.todo': 'to do',
  /** The goals' hints, under each name while it is to do. */
  'ui.goal.wheelHint': 'Build a Big Wheel',
  'ui.goal.coasterHint': 'Build and test a coaster',
  'ui.goal.stallsHint': '{n} of {total} stalls',
  'ui.goal.archHint': 'Place a Ticket Arch',
  'ui.goal.crowdHint': '{n} of {total} guests',
  'ui.goal.complete': 'Poster complete',
  'ui.goal.toast': 'The poster is real!',
  'ui.goal.dismiss': 'Close the poster goal',
};
