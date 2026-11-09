/**
 * Owner: W4-C. After Dark show strings (Phase 6 §4.4, §6, §7). Keys start with `shows.`. Master R4: no final period.
 * Texts the spec gives are exact. Command reasons (`SHOW_ERR`) are table entries too, so the client can map a reason
 * back to its id (`localizeReason`, W4-G); the block strings shared with terrain keep the Phase 4 §4.1 text.
 */
import { TERRAIN_ERR } from './terrain';

export const showStrings: Record<string, string> = {
  // Phase 6 §4.4: the toast when a show is cancelled at its start.
  'shows.notEnoughCash': 'Not enough cash for the show',

  // Command reasons (Phase 6 §6). "Not in the spec" ones answer bad command data or rules the spec leaves open.
  'shows.err.unknown': 'Unknown show site',
  'shows.err.notUnlocked': 'Not unlocked',
  'shows.err.badRotation': 'Unknown rotation',
  'shows.err.outsidePark': TERRAIN_ERR.outsidePark,
  'shows.err.onlyRights': TERRAIN_ERR.onlyRights,
  'shows.err.pathInWay': TERRAIN_ERR.pathInWay,
  'shows.err.rideOrStallInWay': TERRAIN_ERR.rideOrStallInWay,
  'shows.err.trackInWay': TERRAIN_ERR.trackInWay,
  'shows.err.entranceInWay': TERRAIN_ERR.entranceInWay,
  'shows.err.sceneryInWay': TERRAIN_ERR.sceneryInWay,
  'shows.err.notFlat': TERRAIN_ERR.landNotFlat,
  'shows.err.inWater': 'Show sites cannot go in water',
  'shows.err.noClearance': TERRAIN_ERR.noClearance,
  'shows.err.notEnoughCash': TERRAIN_ERR.notEnoughCash,
  'shows.err.noSite': 'No such show site',
  'shows.err.hour': 'Shows start between 20:00 and 23:30',
  'shows.err.minute': 'Shows start on the hour or at half past',
  'shows.err.days': 'Shows run every 1, 2, or 3 days',
  'shows.err.badValue': 'Unknown setting',

  // Toolbar and picker (Phase 6 §7).
  'shows.tool': 'Shows',
  'shows.picker.title': 'After Dark shows',
  'shows.picker.close': 'Close show picker',
  'shows.picker.help': 'Shows run at night with After Dark on. Walking guests nearby gather on footpaths to watch',
  'shows.picker.card': '{name}, {cost}, {perShow} per show',
  'shows.picker.perShow': '{cost} per show',
  'shows.picker.facts': '{radius} tile view · {seconds} s show',
  'shows.picker.locked': 'Research Scenery to unlock',
  'shows.picker.lockedShort': 'Locked',
  'shows.picker.afterDarkOff': 'After Dark is off: shows will not run until it is on (park panel)',

  // Placement status bar.
  'shows.status.label': 'Show site tool',
  'shows.status.pick': 'Pick a show site',
  'shows.status.place': '{name}: {cost}',
  'shows.status.valid': 'Ready to build',
  'shows.status.hintMouse': 'Click the map to build',
  'shows.status.hintTouch': 'Tap the map, then Confirm',
  'shows.btn.rotate': 'Rotate',
  'shows.btn.confirm': 'Confirm',
  'shows.btn.sites': 'Sites',
  'shows.btn.done': 'Done',

  // Show site panel (Phase 6 §7).
  'shows.panel.state': 'Status',
  'shows.panel.schedule': 'Schedule',
  'shows.panel.startTime': 'Start time',
  'shows.panel.hourDown': 'Start an hour earlier',
  'shows.panel.hourUp': 'Start an hour later',
  'shows.panel.minuteDown': 'Start half an hour earlier',
  'shows.panel.minuteUp': 'Start half an hour later',
  'shows.panel.hour': 'Hour',
  'shows.panel.minute': 'Minute',
  'shows.panel.every': 'How often',
  'shows.panel.days.1': 'Every day',
  'shows.panel.days.2': 'Every 2 days',
  'shows.panel.days.3': 'Every 3 days',
  'shows.panel.on': 'Shows: On',
  'shows.panel.off': 'Shows: Off',
  'shows.panel.costPerShow': 'Cost per show',
  'shows.panel.lastWatchers': 'Last show watchers',
  'shows.panel.totalCost': 'Total cost',
  'shows.panel.showsRun': 'Shows run',
  'shows.panel.runningCost': 'Running cost',
  'shows.panel.perMonth': '{cost} a month',
  'shows.panel.viewArea': 'Viewing area',
  'shows.panel.viewTiles': '{n} footpath tiles',

  // Show state lines (panel status row).
  'shows.state.off': 'Off',
  'shows.state.noAfterDark': 'Waiting for After Dark (park panel)',
  'shows.state.next': 'Next show {when}',
  'shows.state.announced': 'Guests are gathering for the {time} show',
  'shows.state.running': 'Show running',
  'shows.state.done': 'Show over',
  'shows.when.today': 'today at {time}',
  'shows.when.tomorrow': 'tomorrow at {time}',
  'shows.when.days': 'in {n} days at {time}',

  // Event toasts.
  'shows.toast.announced': '{name} show at {time}: guests are gathering',
};

/** Command reasons of the show commands (the same texts as the table entries above). */
export const SHOW_ERR = {
  unknown: showStrings['shows.err.unknown'] as string,
  notUnlocked: showStrings['shows.err.notUnlocked'] as string,
  badRotation: showStrings['shows.err.badRotation'] as string,
  outsidePark: TERRAIN_ERR.outsidePark,
  onlyRights: TERRAIN_ERR.onlyRights,
  pathInWay: TERRAIN_ERR.pathInWay,
  rideOrStallInWay: TERRAIN_ERR.rideOrStallInWay,
  trackInWay: TERRAIN_ERR.trackInWay,
  entranceInWay: TERRAIN_ERR.entranceInWay,
  sceneryInWay: TERRAIN_ERR.sceneryInWay,
  notFlat: TERRAIN_ERR.landNotFlat,
  inWater: showStrings['shows.err.inWater'] as string,
  noClearance: TERRAIN_ERR.noClearance,
  notEnoughCash: TERRAIN_ERR.notEnoughCash,
  noSite: showStrings['shows.err.noSite'] as string,
  hour: showStrings['shows.err.hour'] as string,
  minute: showStrings['shows.err.minute'] as string,
  days: showStrings['shows.err.days'] as string,
  badValue: showStrings['shows.err.badValue'] as string,
} as const;
