/**
 * The title-to-play bridge (VITE_ART=real build with the realistic look; `src/ui/bridge/`): the welcome card.
 * `./en.ts` adds them only in the VITE_ART=real build, so the website's string table is unchanged. No final period (master R4).
 */
export const realBridgeStrings: Record<string, string> = {
  /** The welcome card on a new park: "Welcome to" over the game's name (`ui.title.name`). */
  'ui.welcome.to': 'Welcome to',
  'ui.welcome.body': "Your park is an empty field. Let's build something amazing!",
  'ui.welcome.go': "Let's go",
};
