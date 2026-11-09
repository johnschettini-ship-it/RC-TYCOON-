/** View rotation buttons, Buy Land tool and its errors, map sizes (Phase 4 §4.8–4.9, §7). Owner: W3-G. Exact spec text, no final period (master R4). */

/** `buyLand` errors (Phase 4 §4.9). */
export const LAND_ERR = {
  nothingToBuy: 'Nothing to buy here',
  notForSale: 'This land is not for sale',
  notEnoughCash: 'Not enough cash',
} as const;

export const landStrings: Record<string, string> = {
  'land.view.rotateLeft': 'Rotate view counter-clockwise',
  'land.view.rotateRight': 'Rotate view clockwise',
  'land.view.group': 'View rotation',
  'land.tool.buyLand': 'Buy Land',
  'land.buy.hint': 'Drag over land for sale',
  'land.buy.hintTouch': 'Drag over land for sale, then Confirm',
  /** Drag total: tiles of land and of construction rights, and the price. */
  'land.buy.total': '{land} land, {rights} rights: {cost}',
  'land.buy.nothing': 'Nothing to buy here',
  'land.buy.confirm': 'Confirm',
  'land.buy.cancel': 'Cancel',
  'land.buy.label': 'Buy Land',
  'land.legend.forSale': 'Land for sale',
  'land.legend.rightsForSale': 'Construction rights for sale',
  'land.legend.rightsOwned': 'Construction rights owned',
  'land.mapSize': '{size} × {size}',
};
