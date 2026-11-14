// Guests (stage 1, spec §6 / plan F6 subset): 2 body types (b0 man, b1 woman) x 4 outfits, 4 facings (the game moves
// guests in 4 directions), standing, two opposite strides and a sitting pose. Set guest:b<B>o<O>, rot 'all' (facings
// are view directions), frames [`f<facing 0-3>`, `w0` (stand) | `w1` | `w2` (opposite strides) | `sit`]: only the
// frames the reader (look.ts `guest`) asks for, so no decoded byte is spent on unused pictures. Anchor: the feet point
// (renderer.ts collectGuests: the guest's interpolated map position at its height); a sitter's anchor is the seat's
// ground point, the body sits 0.47 m up (on the bench drawn under it). Shirts are baked light grey and marked in the
// mask so the game tints them to its 12 shirt colours. Each walking or standing picture carries its own soft shadow.
import { THREE, frameKey } from './common.js';
import { person, randomLook } from '../people.js';

const SHIRT = '#ededed';
const BODIES = [
  // b0: men
  [
    { female: false, child: false, hairStyle: 'short', bottomType: 'trousers', bottom: '#2c3a55', sleeves: 'short', skin: '#eac2a2', hair: '#2c1f17', hat: null },
    { female: false, child: false, hairStyle: 'crop', bottomType: 'shorts', bottom: '#b9ad92', sleeves: 'short', skin: '#8e5a3a', hair: '#1b1512', hat: 'cap', hatColor: '#1f2f4f' },
    { female: false, child: false, hairStyle: 'side', bottomType: 'trousers', bottom: '#1f1f22', sleeves: 'long', skin: '#dcaa84', hair: '#93602f', hat: null, backpack: '#3f4a2a' },
    { female: false, child: false, age: 2, hairStyle: 'short', bottomType: 'trousers', bottom: '#6b6f75', sleeves: 'short', skin: '#f3d9c6', hair: '#c9c4bd', hat: 'bucket', hatColor: '#e8d9b0' },
  ],
  // b1: women
  [
    { female: true, child: false, hairStyle: 'long', bottomType: 'trousers', bottom: '#3c4f74', sleeves: 'short', skin: '#f3d9c6', hair: '#6b4428', hat: null },
    { female: true, child: false, hairStyle: 'pony', bottomType: 'shorts', bottom: '#22324f', sleeves: 'none', skin: '#c99068', hair: '#1b1512', hat: null, bag: '#7b5a3c' },
    { female: true, child: false, hairStyle: 'bun', bottomType: 'skirt', bottom: '#4a5a3a', sleeves: 'short', skin: '#6e4329', hair: '#1b1512', hat: null },
    { female: true, child: false, hairStyle: 'bob', bottomType: 'trousers', bottom: '#5d6f8f', sleeves: 'long', skin: '#eac2a2', hair: '#dcc596', hat: 'sunhat', hatColor: '#d9b46a' },
  ],
];
// facing (view dir: 0 N = -y, 1 E = +x, 2 S = +y, 3 W = -x) -> rotation.y (a person faces +z at 0)
const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const isShirt = (mesh) => !Array.isArray(mesh.material) && mesh.material.color && `#${mesh.material.color.getHexString()}` === SHIRT;

export default {
  bake(B) {
    const bs = B.newScene();
    BODIES.forEach((outfits, b) => outfits.forEach((o, k) => {
      const look = randomLook(900 + b * 10 + k, { balloon: null, backpack: null, bag: null, ...o, top: SHIRT, h: b === 0 ? 1.76 : 1.64, build: 1 });
      const set = B.set('guest', `b${b}o${k}`, 'all', true);
      for (let f = 0; f < 4; f++) {
        // pictures: stand, the two opposite strides, sit. The renderer's walk values 0-2 (Task 8) are w0 = stand and
        // w1 / w2 = walk phases 0 and pi. A later 8-frame walk adds its phases here (and to the reader) together.
        const poses = [
          ['stand', ['w0'], { kind: 'stand' }],
          ['w1', ['w1'], { kind: 'walk', phase: 0 }],
          ['w2', ['w2'], { kind: 'walk', phase: Math.PI }],
          ['sit', ['sit'], { kind: 'sit' }],
        ];
        for (const [name, keys, pose] of poses) {
          const sit = name === 'sit';
          const p = person(look, pose);
          p.rotation.y = YAW[f];
          if (sit) p.position.y = 0.47;
          bs.world.add(p);
          B.setEnv(p);
          set.add(keys.map((k) => frameKey([`f${f}`, k])), B.shoot(bs, { target: p, masked: isShirt, ownShadow: !sit }));
          bs.world.remove(p);
        }
      }
      B.log(`guest b${b}o${k} done`);
    }));
  },
};
