// Bench (path item): the round 7 park bench, facing away from the tile edge it stands at.
import { pathItem, rootOf } from './scenery.js';
export default pathItem('bench', (K) => { K.bench(0, 0, 0, 0); return rootOf(K); });
