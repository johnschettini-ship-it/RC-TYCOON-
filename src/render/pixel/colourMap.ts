/** Phase 8 stage 0 prototype (never merged): the hand-checked colour map, fixed entries of §6.4 and the scene entries (spec §5.2, §11.3). */

/** The queue slot (§15). Provisional: the stage 1a-ii colour sheet fixes it. It lives here, not in `palette.ts`, to avoid an import cycle. */
export const QUEUE_SLOT = 'n3';

/**
 * Lower-case `#rrggbb` → slot name, keys sorted. Stage 0 holds the fixed entries and the 12 shirts of §6.4;
 * Task 15 adds the scene entries. No entry names `i3` (a dark fill stays one tone above ink).
 *
 * Scene entries (Task 15): every literal and `shade` output that the scene's objects draw (§11.2). A literal takes
 * the proposal rule of §6.4 "How it is made" item 2: inside the hue family of §6.5, the family ramp whose lightness
 * span holds the colour (the nearest mid-tone hue among them), else the family ramp with the nearest lightness; then
 * the tone of nearest lightness, never `i3`. A `shade(base, f)` output moves the base's slot by
 * `-round(ln f / ln 1.18)` tones (positive: darker; §6.5 item 2). The comment names the rule and its inputs.
 */
export const COLOUR_MAP: Readonly<Record<string, string>> = {
  '#000000': 'i2', // shade of an rgb(…) string
  '#0f190f': 'l5', // rgba(15,25,15,0.25) literal, L 0.078
  '#19482c': 't5', // shade(#1f5a37, 0.8): t5 +1
  '#1e5432': 't5', // shade(#25693f, 0.8): t5 +1
  '#1f1f24': 'i2', // literal, L 0.131
  '#1f5a37': 't5', // literal, L 0.237
  '#1f7464': 't5', // shade(#2fb39a, 0.65): t2 +3
  '#217d6c': 't4', // shade(#2fb39a, 0.7): t2 +2
  '#23603a': 't5', // shade(#2c7848, 0.8): t4 +1
  '#25693f': 't5', // literal, L 0.278
  '#296d8b': 'b4', // shade(#3fa7d6, 0.65): b3 +3
  '#2a6e42': 't4', // shade(#358a52, 0.8): t3 +1
  '#2c2420': 'w4', // literal, L 0.149
  '#2c3138': 'i2', // literal, L 0.196
  '#2c7596': 'b4', // shade(#3fa7d6, 0.7): b3 +2
  '#2c7848': 't4', // literal, L 0.322
  '#2d84ad': 'b3', // literal, L 0.427
  '#2f3b55': 'b4', // literal, L 0.259
  '#2f6f35': 'l4', // literal, L 0.310
  '#2f7a34': 'l4', // literal, L 0.331
  '#2fb39a': 't2', // shirt: teal
  '#30425a': 'i2', // shirt: navy
  '#33408d': 'b4', // shade(#4f63d9, 0.65): b3 +3
  '#358a52': 't3', // literal, L 0.375
  '#374598': 'b4', // shade(#4f63d9, 0.7): b3 +2
  '#378645': 'l4', // shade(#4fbf63, 0.7): l2 +2
  '#3a2f2a': 'w4', // literal, L 0.196
  '#3a3f47': 'n6', // literal, L 0.253
  '#3b2a1e': 'w4', // literal, L 0.175
  '#3b3833': 'n6', // literal, L 0.216
  '#3b4250': 'n5', // charcoal track
  '#3d9be0': 'b2', // shirt: sky blue
  '#3f8a3a': 'l4', // literal, L 0.384
  '#3fa7d6': 'b3', // literal, L 0.543
  '#4a9a3c': 'l3', // literal, L 0.420
  '#4aa6d6': 'b3', // literal, L 0.565
  '#4b9440': 'l3', // literal, L 0.416
  '#4f63d9': 'b3', // shirt: cobalt
  '#4fbf63': 'l2', // literal, L 0.529
  '#53331f': 'o6', // shade(#6a4128, 0.78): o6 +2
  '#55657a': 'b4', // literal, L 0.406
  '#56b4e9': 'b2', // ride art (phase6Rides.ts); skips rule 0
  '#5a3f29': 'k4', // shade(#6a4a30, 0.85): k4 +1
  '#5b4636': 'o6', // literal, L 0.284
  '#5c3b8c': 'v4', // shade(#8d5ad8, 0.65): v2 +3
  '#5f4028': 'w4', // shade(#7a5233, 0.78): w3 +2
  '#5fbf4a': 'l2', // literal, L 0.520
  '#616972': 'e6', // shade(#8a96a3, 0.7): e6 +2
  '#633f97': 'v4', // shade(#8d5ad8, 0.7): v2 +2
  '#647282': 'b4', // shade(#7d8ea3, 0.8): b3 +1
  '#64b049': 'g3', // grass, dark
  '#658c9c': 'b4', // shade(#9bd8f0, 0.65): b1 +3
  '#6a4128': 'o6', // literal, L 0.286
  '#6a4a30': 'k4', // literal, L 0.302
  '#6b4226': 'o6', // literal, L 0.284
  '#6c7d92': 'c4', // literal, L 0.498
  '#6d97a8': 'b3', // shade(#9bd8f0, 0.7): b1 +2
  '#6dbb4f': 'g2', // grass, light
  '#6e8028': 'g6', // rgba(110,128,40,0.9) literal, L 0.329
  '#6f8197': 'b3', // literal, L 0.514
  '#7a3e1d': 'o6', // literal, L 0.296
  '#7a4a2e': 'o6', // literal, L 0.329
  '#7a5233': 'w3', // literal, L 0.339
  '#7b5835': 'w3', // cliff, dark
  '#7b5a3a': 'k3', // literal, L 0.355
  '#7c6244': 's6', // shade(#9b7a55, 0.8): s5 +1
  '#7cc04b': 'l2', // shirt: leaf green
  '#7cc45a': 'l2', // literal, L 0.561
  '#7d8ea3': 'b3', // literal, L 0.565
  '#80c35c': 'l2', // literal, L 0.563
  '#8394a8': 'b2', // literal, L 0.586
  '#8a5a2b': 's6', // literal, L 0.355
  '#8a96a3': 'e6', // literal, L 0.590
  '#8d5ad8': 'v2', // shirt: violet
  '#8f7a55': 's5', // literal, L 0.447
  '#8fb34a': 'l2', // literal, L 0.496
  '#9a7148': 'w2', // cliff, light
  '#9b7a55': 's5', // literal, L 0.471
  '#9bd8f0': 'b1', // literal, L 0.775
  '#9cb44a': 'g3', // rgba(156,180,74,0.85) literal, L 0.498
  '#a0522d': 'w2', // shirt: sienna
  '#a23829': 'o6', // shade(#e8503a, 0.7): o4 +2
  '#a38c75': 'k1', // shade(#7b5a3a, 1.3): k3 -2
  '#a9c0d2': QUEUE_SLOT, // queue, never an `a` slot
  '#a9c95a': 'g2', // literal, L 0.571
  '#b53e2d': 'o6', // shade(#e8503a, 0.78): o4 +2
  '#b6b1a6': 's3', // shade(#f6efe0, 0.74): s1 +2
  '#b89c2c': 'o3', // shade(#f5d03b, 0.75): o1 +2
  '#b8b1a4': 'c3', // literal, L 0.682
  '#b97d55': 'o3', // literal, L 0.529
  '#b9c7d6': 'b1', // literal, L 0.782
  '#bab7af': 's3', // shade(#eeeae0, 0.78): s1 +2
  '#bee8ff': 'b1', // rgba(190,232,255,0.9) literal, L 0.873
  '#c4552c': 'o4', // literal, L 0.471
  '#c54431': 'o5', // shade(#e8503a, 0.85): o4 +1
  '#c5ced8': 'n3', // silver track
  '#c98a4b': 's4', // literal, L 0.541
  '#c9c2b4': 's2', // literal, L 0.747
  '#c9d6e3': 'b1', // literal, L 0.839
  '#cfe38a': 'g1', // literal, L 0.716
  '#cfe3f2': 'b1', // literal, L 0.880
  '#d457a8': 'p2', // shirt: pink
  '#d7d0c2': 's2', // literal, L 0.802
  '#d8c69c': 's2', // literal, L 0.729
  '#d8d2c5': 's2', // shade(#f6efe0, 0.88): s1 +1
  '#d8f2ff': 'b1', // literal, L 0.924
  '#d9472b': 'o3', // literal, L 0.510
  '#d98a3a': 's4', // literal, L 0.539
  '#d9b26a': 's3', // literal, L 0.633
  '#d9cdb6': 's2', // shade(#fff1d6, 0.85): s1 +1
  '#dcc79c': 's2', // path
  '#dfe8f0': 'b1', // literal, L 0.908
  '#e0a764': 's3', // literal, L 0.635
  '#e0ac85': 'o1', // literal, L 0.700
  '#e2dccf': 's1', // literal, L 0.849
  '#e6edf3': 'e2', // snow, dark
  '#e8503a': 'o4', // shirt: tomato
  '#e9eef5': 'b1', // literal, L 0.937
  '#ea624e': 'o3', // shade(#e8503a, 1.1): o4 -1
  '#eeeae0': 's1', // literal, L 0.906
  '#efe4c8': 's1', // literal, L 0.861
  '#f0643a': 'o2', // literal, L 0.584
  '#f0e2bf': 's1', // literal, L 0.845
  '#f2f2f2': 'c1', // shirt: white
  '#f2f6fa': 'e1', // snow, light
  '#f39a2b': 'o3', // shirt: orange
  '#f5c84b': 'g2', // literal, L 0.627
  '#f5d03b': 'o1', // shirt: sun yellow
  '#f6d3b3': 's1', // literal, L 0.833
  '#f6efe0': 's1', // literal, L 0.922
  '#f7d758': 'o1', // shade(#f5d03b, 1.15): o1 -1
  '#ffb36b': 'k2', // literal, L 0.710
  '#ffd166': 's3', // literal, L 0.700
  '#ffe27a': 's2', // literal, L 0.739
  '#fff1a8': 's1', // literal, L 0.829
  '#fff1d6': 's1', // literal, L 0.920
  '#fff3d6': 's1', // literal, L 0.920
  '#fffaf0': 's1', // literal, L 0.971
  '#ffffff': 'e1', // literal, L 1.000
};
