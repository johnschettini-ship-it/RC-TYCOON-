// Realistic look phone test: draws the pre-rendered park (bake.cjs) with Canvas 2D, no framework, no 3D at run time.
// Ground chunks first, then static objects and guests sorted by depth (x' + z' of their ground anchor), the carousel
// ring animating. No localStorage / IndexedDB / cookies: this page shares its origin with the game and its saves.
(() => {
  'use strict';
  const PPM = 104 / (3 * Math.SQRT2); // zoom-1 CSS px per metre (1 tile = 3 m = 104 x 52 px)
  const C30 = Math.cos(Math.PI / 6);
  const FEET_Y = 0.05; // paving height
  const SEQ = [ // the 30 s benchmark
    { crowd: 100, zoom: 1, dur: 4000 }, { crowd: 300, zoom: 1, dur: 4000 }, { crowd: 600, zoom: 1, dur: 4000 }, { crowd: 1000, zoom: 1, dur: 4000 },
    { crowd: 300, zoom: 2, dur: 3000 }, { crowd: 1000, zoom: 2, dur: 3000 },
    { crowd: 300, zoom: 1, dur: 4000, turns: 4, bucket: 'z1-300 while turning' }, { crowd: 600, zoom: 2, dur: 4000 },
  ];
  const WARMUP = 300; // ms after each segment change that is not counted
  const BANDS = { frame: [33, 50], decoded: [120, 200], turn: [250, 250] };

  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const ctx = canvas.getContext('2d', { alpha: false });
  const hud = $('hud'), status = $('status');

  // ---------------------------------------------------------------- loading
  let M = null;
  const IMG = Object.create(null);
  // Memory mode: "on demand" (default) keeps only the sets the view needs: the sprite zoom's shared set (objects
  // that need no turn, carousel, guests) and the current turn's set. ?all=1 loads everything up front (result 1).
  const ALL = /[?&]all=1/.test(location.search);
  const load = { ms: 0, bytes: 0, files: 0, decoded: 0, decodedZ: { 1: 0, 2: 0 }, decodedRot: {}, resident: 0, peak: 0, setMs: {}, blobBytes: 0 };
  const SETS = Object.create(null); // key -> { files: [], state: 'none'|'loading'|'ready', promise }
  const setOf = (n) => { const rm = /-r(\d)-/.exec(n); return 'z' + n[1] + (rm ? '-r' + rm[1] : '-shared'); };
  async function bitmap(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    return img;
  }
  async function fetchManifest() {
    const r = await fetch('dist/manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('dist/manifest.json not found: run bake.cjs first');
    const txt = await r.text();
    load.bytes += new Blob([txt]).size;
    M = JSON.parse(txt);
    for (const n of Object.keys(M.files)) { const k = setOf(n); (SETS[k] = SETS[k] || { files: [], state: 'none', promise: null }).files.push(n); }
  }
  const seen = new Set(); // files downloaded (download bytes counted once)
  // Compressed files are kept in memory once downloaded (a few MB), so a turn only decodes and never waits on the
  // network. Result 3 on the owner's phone: a turn waited 6.7 s for a download; decoding alone takes about 0.3 s.
  const BLOBS = new Map();
  async function getBlob(n) {
    if (BLOBS.has(n)) return BLOBS.get(n);
    const res = await fetch('dist/' + n);
    if (!res.ok) throw new Error('missing ' + n);
    const blob = await res.blob();
    if (!seen.has(n)) { seen.add(n); load.bytes += blob.size; load.blobBytes += blob.size; }
    BLOBS.set(n, blob);
    return blob;
  }
  async function downloadZoom(zs) {
    const names = Object.keys(M.files).filter((n) => n[1] === String(zs));
    let next = 0;
    const worker = async () => { while (next < names.length) await getBlob(names[next++]); };
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  function ensureSet(k) {
    const S = SETS[k];
    if (!S) return Promise.resolve();
    if (S.state === 'ready') return Promise.resolve();
    if (S.promise) return S.promise;
    S.state = 'loading';
    const t0 = performance.now();
    S.promise = (async () => {
      let next = 0;
      const worker = async () => {
        while (next < S.files.length) {
          const n = S.files[next++];
          const blob = await getBlob(n);
          const bm = await bitmap(blob);
          IMG[n] = bm;
          const px = bm.width * bm.height * 4;
          load.resident += px; load.peak = Math.max(load.peak, load.resident);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      let px = 0; for (const n of S.files) px += IMG[n].width * IMG[n].height * 4;
      if (load.decodedRot[k] === undefined) { load.decodedRot[k] = px; load.decoded += px; load.decodedZ[k[1]] += px; }
      S.state = 'ready'; S.promise = null;
      (load.setMs[k] = load.setMs[k] || []).push(Math.round(performance.now() - t0));
    })();
    return S.promise;
  }
  function releaseSet(k) {
    const S = SETS[k];
    if (!S || S.state !== 'ready') return;
    for (const n of S.files) { const bm = IMG[n]; if (!bm) continue; load.resident -= bm.width * bm.height * 4; if (bm.close) bm.close(); delete IMG[n]; }
    S.state = 'none';
  }
  const needed = (zs, rot) => ['z' + zs + '-shared', 'z' + zs + '-r' + rot];
  // The next turn in the Turn button's direction is loaded in the background, so a turn is usually instant.
  const PREFETCH = !/[?&]prefetch=0/.test(location.search);
  const ahead = (zs, rot) => 'z' + zs + '-r' + ((rot + 1) % 4);
  async function ensureView(zs, rot) {
    await Promise.all(needed(zs, rot).map(ensureSet));
    if (ALL) return;
    const keep = new Set(needed(zs, rot));
    if (PREFETCH) keep.add(ahead(zs, rot));
    for (const k of Object.keys(SETS)) if (!keep.has(k)) releaseSet(k);
    if (PREFETCH) ensureSet(ahead(zs, rot)).catch(() => {});
  }
  async function loadAll() {
    const t0 = performance.now();
    await fetchManifest();
    status.textContent = 'Loading sprites…';
    if (ALL) await Promise.all(Object.keys(SETS).map(ensureSet));
    else { const zs = view.dpr >= 1.5 ? 2 : 1; await downloadZoom(zs); await ensureView(zs, 0); }
    load.files = seen.size + 1;
    load.ms = Math.round(performance.now() - t0);
  }

  // ---------------------------------------------------------------- park paths and guests (deterministic)
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const NODES = { W: [-20, 0], A: [-10, 0], P: [0, 0], B: [10.5, 0], E: [20, 0], S1: [0, 7.95], S2: [0, 9], S3: [0, 20], K: [-6.6, 7.95], O: [3.4, 9], C: [10.5, -3.8] };
  const EDGES = [['W', 'A', 1.05], ['A', 'P', 1.05], ['P', 'B', 1.05], ['B', 'E', 1.05], ['P', 'S1', 1.05], ['S1', 'S2', 1.05], ['S2', 'S3', 1.05], ['S1', 'K', 0.45], ['S2', 'O', 0.5], ['B', 'C', 0.95]]
    .map(([a, b, lat]) => { const A = NODES[a], B = NODES[b], dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz); return { a, b, A, B, len, ux: dx / len, uz: dz / len, lat }; });
  const AT = {}; EDGES.forEach((e, i) => { (AT[e.a] = AT[e.a] || []).push(i); (AT[e.b] = AT[e.b] || []).push(i); });
  const GUESTS = [];
  function makeGuests() {
    const r = rng(20261113);
    const outfits = M.guests.outfits;
    const total = EDGES.reduce((s, e) => s + e.len, 0);
    for (let i = 0; i < 1000; i++) {
      let pick = r() * total, e = 0;
      while (pick > EDGES[e].len) { pick -= EDGES[e].len; e++; }
      const o = (r() * outfits) | 0;
      const child = o === 2 || o === 5;
      GUESTS.push({ e, fwd: r() < 0.5, t: pick, lat: r() * 2 - 1, speed: (child ? 1.0 : 1.15) + r() * 0.35, o, stride: child ? 1.1 : 1.45, dist: r() * 10, rnd: rng(1000 + i), x: 0, z: 0, vx: 0, vz: 0 });
    }
  }
  function stepGuest(g, dt) {
    let move = g.speed * dt;
    g.dist += move;
    let e = EDGES[g.e];
    while (move > 0) {
      const left = e.len - g.t;
      if (move < left) { g.t += move; move = 0; break; }
      move -= left;
      const node = g.fwd ? e.b : e.a;
      const opts = AT[node].filter((i) => i !== g.e);
      const ni = opts.length ? opts[(g.rnd() * opts.length) | 0] : g.e;
      const ne = EDGES[ni];
      g.fwd = ne.a === node; g.e = ni; g.t = 0; e = ne;
    }
    const s = g.fwd ? g.t : e.len - g.t;
    const dir = g.fwd ? 1 : -1;
    g.x = e.A[0] + e.ux * s - e.uz * g.lat * e.lat;
    g.z = e.A[1] + e.uz * s + e.ux * g.lat * e.lat;
    g.vx = e.ux * dir; g.vz = e.uz * dir;
  }

  // ---------------------------------------------------------------- view
  const view = { rot: 0, zoom: 1, cx: 0, cy: 40, crowd: 300, sharp: true, dpr: 1, W: 0, H: 0 };
  const turnXZ = (x, z, q) => { const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; };
  const proj = (x, y, z) => [PPM * (x - z) / Math.SQRT2, PPM * (0.5 * (x + z) / Math.SQRT2 - C30 * y)];
  const unproj = (sx, sy) => { const d = sx * Math.SQRT2 / PPM, s = 2 * Math.SQRT2 * sy / PPM; return [(s + d) / 2, (s - d) / 2]; }; // ground (y = 0)
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 4);
    const w = window.innerWidth, h = window.innerHeight;
    view.W = Math.round(w * view.dpr); view.H = Math.round(h * view.dpr);
    canvas.width = view.W; canvas.height = view.H;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  const spriteZoom = () => (view.zoom === 1 && view.sharp && view.dpr >= 1.5 ? 2 : view.zoom);
  let bounds = null;
  function computeBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of M.z[1].ground[view.rot]) { x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y); x1 = Math.max(x1, g.x + g.w); y1 = Math.max(y1, g.y + g.h); }
    bounds = { x0, y0, x1, y1 };
  }
  function clampView() {
    view.cx = Math.max(bounds.x0 + 100, Math.min(bounds.x1 - 100, view.cx));
    view.cy = Math.max(bounds.y0 + 100, Math.min(bounds.y1 - 100, view.cy));
  }
  function turn() {
    const [x, z] = unproj(view.cx, view.cy);
    const [px, pz] = turnXZ(x, z, -view.rot);
    view.rot = (view.rot + 1) % 4;
    const [nx, nz] = turnXZ(px, pz, view.rot);
    [view.cx, view.cy] = proj(nx, 0, nz);
    computeBounds(); clampView();
  }

  // ---------------------------------------------------------------- drawing
  const items = [];
  let lastDrawMs = 0, carouselT = 0;
  function draw() {
    const t0 = performance.now();
    const zs = spriteZoom(), Z = M.z[zs], k = view.dpr * view.zoom / zs;
    const ox = view.W / 2 - view.cx * view.zoom * view.dpr, oy = view.H / 2 - view.cy * view.zoom * view.dpr;
    const W = view.W, H = view.H;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#d8e4ec';
    ctx.fillRect(0, 0, W, H);
    for (const g of Z.ground[view.rot]) {
      const x0 = Math.round(ox + g.x * k), y0 = Math.round(oy + g.y * k), x1 = Math.round(ox + (g.x + g.w) * k), y1 = Math.round(oy + (g.y + g.h) * k);
      if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
      const im = IMG[g.f]; if (im) ctx.drawImage(im, x0, y0, x1 - x0, y1 - y0);
    }
    // statics are pre-sorted; guests are sorted and merged in
    items.length = 0;
    const n = view.crowd;
    for (let i = 0; i < n; i++) {
      const g = GUESTS[i];
      const [x, z] = turnXZ(g.x, g.z, view.rot);
      const [sx, sy] = proj(x, FEET_Y, z);
      g.sx = sx * zs; g.sy = sy * zs; g.d = x + z;
      const dx = ox + g.sx * k, dy = oy + g.sy * k;
      if (dx < -120 * k || dx > W + 120 * k || dy < -120 * k || dy > H + 60 * k) continue;
      const [vx, vz] = turnXZ(g.vx, g.vz, view.rot);
      g.dir = ((Math.round(Math.atan2(vx, vz) / (Math.PI / 4)) % 8) + 8) % 8;
      g.f = Math.floor((g.dist / g.stride) * 8) % 8;
      items.push(g);
    }
    items.sort((a, b) => a.d - b.d);
    const statics = Z.objects[view.rot];
    const gn = M.guests;
    const ringF = Z.ring[Math.floor(carouselT / 2400 * M.carousel.frames) % M.carousel.frames];
    let gi = 0;
    const drawGuest = (g) => {
      const fr = Z.guests.frames[(g.o * gn.dirs + g.dir) * gn.frames + g.f];
      const im = IMG[fr.a]; if (!im) return;
      ctx.drawImage(im, fr.sx, fr.sy, fr.w, fr.h, ox + (g.sx + fr.ox) * k, oy + (g.sy + fr.oy) * k, fr.w * k, fr.h * k);
    };
    for (const s of statics) {
      while (gi < items.length && items[gi].d < s.d) drawGuest(items[gi++]);
      let src = s, x = s.x, y = s.y;
      if (s.k === 'carousel-ring') { src = ringF; x = s.x + ringF.ox; y = s.y + ringF.oy; }
      const dx = ox + x * k, dy = oy + y * k, dw = src.w * k, dh = src.h * k;
      if (dx + dw < 0 || dy + dh < 0 || dx > W || dy > H) continue;
      const im = IMG[src.a]; if (!im) continue;
      ctx.drawImage(im, src.sx, src.sy, src.w, src.h, dx, dy, dw, dh);
    }
    while (gi < items.length) drawGuest(items[gi++]);
    lastDrawMs = performance.now() - t0;
  }

  // ---------------------------------------------------------------- loop, benchmark
  let last = 0, fpsAcc = 0, fpsN = 0, fpsShown = 0;
  let pendingTurn = 0, turnDrawn = false;
  const turnTimes = [];
  let bench = null;
  function frame(ts) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    const delta = last ? ts - last : 0;
    last = ts;
    if (pendingTurn && turnDrawn) { turnTimes.push(Math.round(performance.now() - pendingTurn)); pendingTurn = 0; turnDrawn = false; }
    if (bench) benchStep(ts, delta);
    for (let i = 0; i < view.crowd; i++) stepGuest(GUESTS[i], dt);
    carouselT += dt * 1000;
    draw();
    if (pendingTurn && turnApplied) { turnDrawn = true; turnApplied = false; }
    fpsAcc += delta; fpsN++;
    if (fpsAcc > 500) { fpsShown = Math.round(1000 * fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    hud.textContent = `${fpsShown} fps  draw ${lastDrawMs.toFixed(1)} ms\n${view.crowd} guests  zoom ${view.zoom}x  turn ${view.rot * 90}°\nsprites ${spriteZoom()}x  canvas ${view.W}×${view.H}`;
    requestAnimationFrame(frame);
  }
  let turning = false;
  function doTurn() {
    if (turning) return;
    turning = true; pendingTurn = performance.now(); turnDrawn = false;
    const nextRot = (view.rot + 1) % 4;
    ensureView(spriteZoom(), nextRot).then(() => { turn(); turnApplied = true; turning = false; })
      .catch((e) => { turning = false; pendingTurn = 0; status.style.display = 'block'; status.textContent = 'Could not load a turn: ' + e.message; });
  }
  let turnApplied = false;
  function setZoom(z) {
    if (z === view.zoom) return;
    const zsNew = z === 1 && view.sharp && view.dpr >= 1.5 ? 2 : z;
    if (!needed(zsNew, view.rot).every((k) => SETS[k] && SETS[k].state === 'ready')) {
      ensureView(zsNew, view.rot).then(() => setZoom(z));
      return;
    }
    view.zoom = z;
    $('z1').setAttribute('aria-pressed', String(z === 1)); $('z2').setAttribute('aria-pressed', String(z === 2));
  }
  function setCrowd(n) {
    view.crowd = n;
    for (const b of $('crowd').children) b.setAttribute('aria-pressed', String(+b.dataset.n === n));
  }

  function startBench() {
    if (bench) return;
    $('card').classList.remove('open');
    for (const b of document.querySelectorAll('#controls button')) b.disabled = true;
    turnTimes.length = 0;
    bench = { t0: 0, seg: -1, segStart: 0, buckets: {}, turnsDone: 0, cpu: {}, rot0: view.rot };
  }
  function benchStep(ts, delta) {
    const b = bench;
    if (!b.t0) { b.t0 = ts; }
    const el = ts - b.t0;
    let acc = 0, seg = SEQ.length;
    for (let i = 0; i < SEQ.length; i++) { if (el < acc + SEQ[i].dur) { seg = i; break; } acc += SEQ[i].dur; }
    if (seg >= SEQ.length) { finishBench(); return; }
    const S = SEQ[seg];
    if (seg !== b.seg) { b.seg = seg; b.segStart = ts; b.turnsDone = 0; setCrowd(S.crowd); setZoom(S.zoom); }
    const inSeg = ts - b.segStart;
    // pan: a slow figure-eight over the park
    const tt = el / 1000;
    view.cx = 330 * Math.sin(2 * Math.PI * tt / 9);
    view.cy = 30 + 170 * Math.sin(2 * Math.PI * tt / 6.5);
    clampView();
    if (S.turns && !pendingTurn && b.turnsDone < S.turns && inSeg > (b.turnsDone + 0.2) * (S.dur / S.turns)) { b.turnsDone++; doTurn(); }
    if (inSeg > WARMUP && delta > 0) {
      const key = S.bucket || `z${S.zoom}-${S.crowd}`;
      (b.buckets[key] = b.buckets[key] || []).push(delta);
      (b.cpu[key] = b.cpu[key] || []).push(lastDrawMs);
    }
  }
  const pct = (arr, p) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
  const band = (v, [p, w]) => (v === null ? 'FAIL' : v <= p ? 'PASS' : v <= w ? 'WARN' : 'FAIL');
  const mb = (b) => +(b / 1048576).toFixed(1);
  let results = null;
  function finishBench() {
    const b = bench; bench = null;
    if (view.rot !== b.rot0) ensureView(spriteZoom(), b.rot0).then(() => { while (view.rot !== b.rot0) turn(); });
    for (const x of document.querySelectorAll('#controls button')) x.disabled = false;
    if (view.dpr < 1.5) $('sharp').disabled = true;
    const rows = Object.entries(b.buckets).map(([k, arr]) => ({
      bucket: k, frames: arr.length, p50: +pct(arr, 50).toFixed(1), p95: +pct(arr, 95).toFixed(1), p99: +pct(arr, 99).toFixed(1),
      dropped: arr.filter((d) => d > 33.4).length, drawCpuP95: +pct(b.cpu[k], 95).toFixed(1),
    }));
    const key = rows.find((r) => r.bucket === 'z1-300');
    const decodedMB = mb(ALL ? load.decoded : load.peak);
    const turnMax = turnTimes.length ? Math.max(...turnTimes) : null;
    const checks = {
      frame: { value: key ? key.p95 : null, unit: 'ms p95 at 300 guests, zoom 1x', band: band(key ? key.p95 : null, BANDS.frame), limits: 'PASS ≤ 33, WARN ≤ 50' },
      decoded: { value: decodedMB, unit: ALL ? 'MB decoded (estimate, everything loaded)' : 'MB peak images in memory (estimate, on demand)', band: band(decodedMB, BANDS.decoded), limits: 'PASS ≤ 120, WARN ≤ 200' },
      turn: { value: turnMax, unit: 'ms slowest turn', band: band(turnMax, BANDS.turn), limits: 'PASS ≤ 250 (no WARN band)' },
    };
    const order = ['PASS', 'WARN', 'FAIL'];
    const verdict = Object.values(checks).reduce((v, c) => (order.indexOf(c.band) > order.indexOf(v) ? c.band : v), 'PASS');
    const heap = performance.memory ? mb(performance.memory.usedJSHeapSize) : 'not available';
    const residentZ = {}; for (const z of [1, 2]) residentZ['zoom' + z] = mb(load.decodedZ[z]);
    const perRot = {}; for (const [k, v] of Object.entries(load.decodedRot)) perRot[k] = mb(v);
    results = {
      test: 'Realistic look phone test', look: M.look, verdict, checks,
      device: { userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, viewportCss: [window.innerWidth, window.innerHeight], canvasPx: [view.W, view.H], sharp1x: view.sharp && view.dpr >= 1.5 },
      mode: ALL ? 'everything loaded' : PREFETCH ? 'on demand (current zoom and turn, next turn loaded ahead)' : 'on demand (current zoom and turn only)',
      load: { ms: load.ms, files: load.files, downloadMB: mb(load.bytes), decodedMB, peakResidentMB: mb(load.peak), compressedHeldMB: mb(load.blobBytes), residentNowMB: mb(load.resident), setLoadMs: load.setMs, decodedByZoomMB: residentZ, decodedByZoomAndRotationMB: perRot, note: 'decoded = sum of width x height x 4 of every loaded image; an estimate, the browser may hold more (GPU copies) or less' },
      frames: rows, turnMs: turnTimes.slice(), jsHeapMB: heap,
      bake: { seconds: M.bakeSecondsTotal, generated: M.generated },
      when: new Date().toISOString(),
    };
    window.__results = results;
    showCard();
  }
  function showCard() {
    const r = results;
    const c = r.checks;
    const tr = (name, ch) => `<tr><td>${name}</td><td class="n">${ch.value === null ? 'n/a' : ch.value}</td><td>${ch.unit}<br><span class="note">${ch.limits}</span></td><td class="${ch.band}"><b>${ch.band}</b></td></tr>`;
    $('cardBody').innerHTML = `
      <div class="verdict ${r.verdict}">${r.verdict}</div>
      <p class="note">Mode: ${r.mode}.</p>
      <table><tr><th>Check</th><th>Value</th><th></th><th></th></tr>${tr('Frame time', c.frame)}${tr('Images in memory', c.decoded)}${tr('Turn', c.turn)}</table>
      <table>
        <tr><th>Device pixel ratio</th><td>${r.device.devicePixelRatio}</td></tr>
        <tr><th>Canvas</th><td>${r.device.canvasPx.join(' × ')} px (${r.device.viewportCss.join(' × ')} CSS)${r.device.sharp1x ? ', 1x drawn from 2x sprites' : ''}</td></tr>
        <tr><th>Load</th><td>${r.load.ms} ms, ${r.load.files} files, ${r.load.downloadMB} MB downloaded</td></tr>
        <tr><th>Images in memory (estimate)</th><td>peak ${r.load.peakResidentMB} MB, now ${r.load.residentNowMB} MB; sets loaded: ${Object.entries(r.load.decodedByZoomAndRotationMB).map(([k, v]) => k + ' ' + v + ' MB').join(', ')}</td></tr>
        <tr><th>JS heap</th><td>${typeof r.jsHeapMB === 'number' ? r.jsHeapMB + ' MB (usedJSHeapSize)' : 'not available (Chrome only)'}</td></tr>
        <tr><th>Turns</th><td>${r.turnMs.join(', ')} ms</td></tr>
      </table>
      <table><tr><th>Crowd / zoom</th><th class="n">frames</th><th class="n">p50</th><th class="n">p95</th><th class="n">p99</th><th class="n">&gt;33 ms</th></tr>
        ${r.frames.map((f) => `<tr><td>${f.bucket}</td><td class="n">${f.frames}</td><td class="n">${f.p50}</td><td class="n">${f.p95}</td><td class="n">${f.p99}</td><td class="n">${f.dropped}</td></tr>`).join('')}
      </table>
      <p class="note">Frame times are the gaps between screen refreshes in ms (16.7 = 60 fps). "&gt;33 ms" counts dropped frames. The first ${WARMUP} ms after each change are not counted. Image memory is width × height × 4 bytes of the images the page holds (on demand: only the current zoom and turn; a turn loads the next turn first, then frees the old one); it is an estimate, not a measurement. Turn time includes loading and decoding the next turn.</p>`;
    $('copyText').style.display = 'none';
    $('card').classList.add('open');
  }
  function resultsText() {
    const r = results;
    const lines = [`Realistic look phone test (${r.mode}): ${r.verdict}`,
      `frame p95 @300 z1: ${r.checks.frame.value} ms (${r.checks.frame.band}); decoded: ${r.checks.decoded.value} MB (${r.checks.decoded.band}); slowest turn: ${r.checks.turn.value} ms (${r.checks.turn.band})`,
      `DPR ${r.device.devicePixelRatio}, canvas ${r.device.canvasPx.join('x')}, load ${r.load.ms} ms, ${r.load.downloadMB} MB down, turns ${r.turnMs.join('/')} ms`, ''];
    return lines.join('\n') + JSON.stringify(r, null, 2);
  }

  // ---------------------------------------------------------------- input
  const pointers = new Map();
  let pinch0 = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || bench || !M) return;
    const p = pointers.get(e.pointerId);
    if (pointers.size === 1) { view.cx -= (e.clientX - p[0]) / view.zoom; view.cy -= (e.clientY - p[1]) / view.zoom; clampView(); }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d / pinch0 > 1.35) { setZoom(2); pinch0 = d; } else if (d / pinch0 < 0.74) { setZoom(1); pinch0 = d; }
    }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!bench) setZoom(e.deltaY < 0 ? 2 : 1); }, { passive: false });
  $('z1').onclick = () => setZoom(1);
  $('z2').onclick = () => setZoom(2);
  $('turn').onclick = () => doTurn();
  for (const b of $('crowd').children) b.onclick = () => setCrowd(+b.dataset.n);
  $('sharp').onclick = () => {
    const want = !view.sharp;
    const zs = view.zoom === 1 && want && view.dpr >= 1.5 ? 2 : view.zoom;
    ensureView(zs, view.rot).then(() => { view.sharp = want; $('sharp').setAttribute('aria-pressed', String(view.sharp)); });
  };
  $('bench').onclick = startBench;
  $('close').onclick = () => $('card').classList.remove('open');
  $('copy').onclick = () => {
    const text = resultsText();
    const fallback = () => { const ta = $('copyText'); ta.value = text; ta.style.display = 'block'; ta.focus(); ta.select(); try { document.execCommand('copy'); $('copy').textContent = 'Copied (select all if not)'; } catch { $('copy').textContent = 'Select the text and copy'; } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => { $('copy').textContent = 'Copied'; }, fallback);
    else fallback();
  };
  window.addEventListener('resize', resize);
  window.__test = { view, startBench, turn: doTurn, setZoom, setCrowd, ready: false };

  resize();
  view.sharp = view.dpr >= 1.5;
  loadAll().then(() => {
    makeGuests();
    $('sharp').setAttribute('aria-pressed', String(view.sharp));
    if (view.dpr < 1.5) $('sharp').disabled = true;
    computeBounds(); clampView();
    status.style.display = 'none';
    window.__test.ready = true;
    window.__test.load = load;
    requestAnimationFrame(frame);
  }).catch((e) => { status.textContent = 'Could not load the sprites: ' + e.message; console.error(e); });
})();
