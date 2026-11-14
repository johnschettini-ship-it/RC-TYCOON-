// Round Oak (scenery, 1 x 1, 7 m): the round 7 leaf-card tree.
import { sceneryItem, rootOf } from './scenery.js';
export default sceneryItem('oak_round', (K) => { K.tree(0, 0, 7, 11, 2.3); return rootOf(K); });
