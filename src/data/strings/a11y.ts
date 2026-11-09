/**
 * Owner: W4-F. Accessibility strings (Phase 6 §4.7): map cursor, tile descriptions, shortcut list, live region.
 * Keys start with `a11y.`. Master R4: no final period.
 */
export const a11yStrings: Record<string, string> = {
  // Phase 6 §4.7 example: "Tile 12, 30: footpath, 3 guests, next to Carousel".
  'a11y.tile': 'Tile {x}, {y}: {what}',
  'a11y.offMap': 'Outside the map',
  'a11y.listSep': ', ',
  'a11y.listAnd': '{a} and {b}',
  'a11y.nextTo': 'next to {names}',
  'a11y.footpath': 'footpath',
  'a11y.queue': 'queue path',
  'a11y.entrance': 'park entrance',
  'a11y.building': 'building',
  'a11y.track': 'ride track',
  'a11y.trackOf': '{name} track',
  'a11y.scenery': 'scenery',
  'a11y.water': 'water',
  'a11y.terrain.0': 'grass',
  'a11y.terrain.1': 'sand',
  'a11y.terrain.2': 'dirt',
  'a11y.terrain.3': 'rock',
  'a11y.terrain.4': 'snow',
  'a11y.bench': 'bench',
  'a11y.bin': 'bin',
  'a11y.lamp': 'lamp',
  'a11y.elevatedFootpath': 'raised footpath above',
  'a11y.elevatedQueue': 'raised queue path above',
  'a11y.guestOne': '1 guest',
  'a11y.guestMany': '{n} guests',
  'a11y.staffOne': '1 staff member',
  'a11y.staffMany': '{n} staff members',
  'a11y.notOwned': 'not owned',
  'a11y.landForSale': 'land for sale',
  'a11y.rightsOwned': 'construction rights only',
  'a11y.rightsForSale': 'construction rights for sale',

  // Map cursor and canvas (Phase 6 §4.7, §7).
  'a11y.canvas': 'Park map: press C for the map cursor, then use the arrow keys and Enter',
  'a11y.cursorOn': 'Map cursor on',
  'a11y.cursorOff': 'Map cursor off',
  'a11y.cursorLine': 'Map cursor',
  'a11y.live': 'Announcements',

  // Month-end summary for the live region.
  'a11y.monthEnded': 'Month ended: profit {profit}',
  'a11y.monthEndedLoss': 'Month ended: loss {loss}',

  // Shortcut list (key `?`).
  'a11y.keys.title': 'Keyboard shortcuts',
  'a11y.keys.key': 'Key',
  'a11y.keys.action': 'Action',
  'a11y.keys.close': 'Close',
  'a11y.keys.cursor': 'Map cursor on or off',
  'a11y.keys.arrows': 'Move the map cursor (pan the map when the cursor is off)',
  'a11y.keys.enter': 'Click at the map cursor',
  'a11y.keys.shiftArrows': 'Drag a path line from the map cursor; let go of Shift to build',
  'a11y.keys.rotate': 'Rotate the item you place',
  'a11y.keys.escape': 'Cancel the tool, then close the panel',
  'a11y.keys.help': 'This list',
  'a11y.keys.pause': 'Pause or resume',
  'a11y.keys.speeds': 'Game speed 1×, 2×, 4×',
  'a11y.keys.zoom': 'Zoom in and out',
  'a11y.keys.tools': 'Footpath, queue path, demolish',
  'a11y.keys.panels': 'Finance, staff, office, messages',
  'a11y.keys.pathItems': 'Bench, bin',
  'a11y.keys.view': 'Turn the view',
  'a11y.keys.pathHeight': 'Path height up and down',
  'a11y.keys.overlays': 'Next map overlay',
  'a11y.keys.tab': 'Move between buttons and panels',
  'a11y.keys.pan': 'Pan the map',

  // Demolish confirmation (Settings → Gameplay → Confirm demolish).
  'a11y.demolish.confirm': 'Demolish this?',
  'a11y.demolish.yes': 'Demolish',
  'a11y.demolish.no': 'Keep it',
};
