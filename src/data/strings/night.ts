/** After Dark switch, help line, warning toast (Phase 4 §4.7, §7). Owner: W3-F. Exact spec text, no final period (master R4). */
export const nightStrings: Record<string, string> = {
  /** Phase 4 §4.7: toast when After Dark is turned on with litShare < 0.5. */
  'night.warnDarkPaths': 'Guests dislike dark paths. Build lamps',
  // Park panel (Phase 4 §7): the After Dark switch with a short help line.
  'night.title': 'After Dark',
  'night.switchOn': 'After Dark: On',
  'night.switchOff': 'After Dark: Off',
  'night.help': 'Day and night cycle. At night guests want lit paths and love spooky rides',
  'night.helpOff': 'Always daytime. Lamps still work as decoration',
  'night.litPaths': 'Lit paths',
  'night.litPathsValue': '{percent}%',
  'night.locked': 'Set by this scenario',
  // Light overlay legend (W3-E shows it with the overlay chip row; values from `render/lighting/legend.ts`).
  'night.legend.title': 'Light',
  'night.legend.dark': 'Dark',
  'night.legend.lit': 'Lit',
  'night.legend.bright': 'Bright',
  'night.legend.value': 'Light {value}',
};
