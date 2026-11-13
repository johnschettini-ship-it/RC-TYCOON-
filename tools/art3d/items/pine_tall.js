// Tall Pine (scenery, 1 x 1, 9 m): the round 7 conifer.
import { sceneryItem, rootOf } from './scenery.js';
export default sceneryItem('pine_tall', (K) => { K.pine(0, 0, 9, 21, { R: 1.8 }); return rootOf(K); });
