// Pure (no three.js, so vitest can load it): the motion of the Task 2 spinner rides as a function of the game's ride
// angle a (0-1 per revolution, src/render/anim.ts). The bake modules pose their three.js models from these functions,
// and each `*Parts(a)` composes the same numbers into ride-frame placements of the moving parts (x, y, z, yaw and a
// design tag), so a test can check numerically that the state at a + period / 32 is the state at a turned by
// `symmetry` (radians about the vertical): the frame fold the bake relies on.
//
// three.js convention: a child at (x, z) under a parent with rotation.y = phi sits at rotY((x, z), phi) in the parent's
// frame, and its yaw adds phi.
const TAU = Math.PI * 2;

export function rotY(p, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  return { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
}

// `d2Step` (flatRides.js cycleD2): density 2 floors a full frame's slot to this many slots. 4 for the round spinners
// (4 pictures per 180 degree period: each step turns 45 degrees, a quarter of it, and still reads forwards); 2 for the
// mill (its 4 pictures per 90 degree period stay: 2 would turn the sails half a period a step, with no direction).

// ------------------------------------------------------------------ teacup_twirl
export const TEACUP = {
  period: 16, d2Step: 4, symmetry: Math.PI, subRing: 2.95, cupRing: 0.9,
  subAngles: [0, 1, 2, 3].map((j) => (j / 4) * TAU + TAU / 8),
  cupAngles: [0, Math.PI],
};
/** Floor yaw; turntable yaw relative to the floor (beyond its base -th); cup yaw relative to its turntable (beyond -psi). */
export function teacupAngles(a) {
  return { floor: TAU * a, sub: -2 * TAU * a, cup: 2 * TAU * a };
}
export function teacupParts(a) {
  const A = teacupAngles(a);
  const out = [];
  TEACUP.subAngles.forEach((th, j) => {
    const subPos = { x: Math.cos(th) * TEACUP.subRing, z: Math.sin(th) * TEACUP.subRing };
    const subYaw = -th + A.sub;
    TEACUP.cupAngles.forEach((psi, k) => {
      const c = rotY({ x: Math.cos(psi) * TEACUP.cupRing, z: Math.sin(psi) * TEACUP.cupRing }, subYaw);
      const p = rotY({ x: subPos.x + c.x, z: subPos.z + c.z }, A.floor);
      out.push({ design: `cup${j % 2}${k}`, x: p.x, y: 0, z: p.z, yaw: A.floor + subYaw - psi + A.cup });
    });
  });
  return out;
}

// ------------------------------------------------------------------ rocket_rounds
export const ROCKET = {
  period: 16, d2Step: 4, symmetry: Math.PI, n: 6, pivotR: 1.2, pivotY: 1.55, arm: 3.25,
  aMin: (-12 * Math.PI) / 180, aMax: (32 * Math.PI) / 180,
};
/** Drum yaw and the arm angle of rocket i: up twice per revolution, each rocket its own share. */
export function rocketAngles(a, i) {
  const s = Math.sin(TAU * a) ** 2;
  const lift = s * (0.78 + 0.22 * Math.cos(TAU * (2 * a + i / 3)));
  return { spin: TAU * a, arm: ROCKET.aMin + (ROCKET.aMax - ROCKET.aMin) * lift };
}
export function rocketParts(a) {
  const out = [];
  for (let i = 0; i < ROCKET.n; i++) {
    const th = (i / ROCKET.n) * TAU;
    const A = rocketAngles(a, i);
    const r = ROCKET.pivotR + ROCKET.arm * Math.cos(A.arm);
    const p = rotY({ x: r, z: 0 }, A.spin - th);
    out.push({ design: `rocket${i % 3}`, x: p.x, y: ROCKET.pivotY + ROCKET.arm * Math.sin(A.arm), z: p.z, yaw: A.spin - th + Math.PI });
  }
  return out;
}

// ------------------------------------------------------------------ kiddie_cars
export const KIDDIE = { period: 16, d2Step: 4, symmetry: Math.PI, n: 6, lane: 3.9 };
export function kiddieAngles(a) {
  return { spin: TAU * a };
}
export function kiddieParts(a) {
  const out = [];
  for (let i = 0; i < KIDDIE.n; i++) {
    const th = (i / KIDDIE.n) * TAU;
    const p = rotY({ x: KIDDIE.lane, z: 0 }, kiddieAngles(a).spin - th);
    out.push({ design: `car${i % 3}`, x: p.x, y: 0, z: p.z, yaw: kiddieAngles(a).spin - th + Math.PI });
  }
  return out;
}

// ------------------------------------------------------------------ merry_mill (a front: baked per view turn)
export const MILL = { period: 8, d2Step: 2, symmetry: 0, sails: 4, sail: 4.8, hubY: 6.8 };
/** Sail wheel angle about the windshaft (rotation.z of the wheel). */
export function millAngles(a) {
  return { sails: -TAU * a + Math.PI / 4 };
}
/** Sail tips and gondolas in the mill's frame (x across the sail plane, y up); the gondolas hang level (yaw 0). */
export function millParts(a) {
  const out = [];
  for (let i = 0; i < MILL.sails; i++) {
    const beta = millAngles(a).sails + (i / MILL.sails) * TAU; // sail i: local +y turned by beta about z
    const t = beta + Math.PI / 2;
    out.push({ design: 'sail', x: Math.cos(t) * MILL.sail, y: MILL.hubY + Math.sin(t) * MILL.sail, z: 0, yaw: 0 });
    out.push({ design: 'gondola', x: Math.cos(t) * MILL.sail, y: MILL.hubY + Math.sin(t) * MILL.sail, z: 1, yaw: 0 });
  }
  return out;
}
