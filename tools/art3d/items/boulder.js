// Boulder (scenery, 1 x 1): a displaced rock, sized to stay inside its tile.
import { sceneryItem, rootOf } from './scenery.js';
export default sceneryItem('boulder', (K) => { K.rock(0, 0, 1.25, 61); return rootOf(K); });
