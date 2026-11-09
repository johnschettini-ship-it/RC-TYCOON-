/**
 * Small mascot portraits for tutorial bubbles, award toasts, and the end screen (master §2.3): Frost the friendly
 * yeti (cool colours) and Spark the fire fox (warm colours), happy or sad. Drawn in code, deterministic: the same
 * size and mood give the same pixels. Owner: W3-I.
 */
export type Mascot = 'frost' | 'spark';
export type Mood = 'happy' | 'sad';

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 2): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function eyes(c: CanvasRenderingContext2D, x: number, y: number, gap: number, r: number, mood: Mood): void {
  for (const s of [-1, 1]) {
    ellipse(c, x + s * gap, y, r, r * 1.15, '#1b2433');
    ellipse(c, x + s * gap + r * 0.35, y - r * 0.4, r * 0.35, r * 0.35, '#ffffff');
    if (mood === 'sad') {
      // Brows slope down at the outer ends.
      c.beginPath();
      c.moveTo(x + s * (gap - r * 1.2), y - r * 2.1);
      c.lineTo(x + s * (gap + r * 1.3), y - r * 1.5);
      c.lineWidth = Math.max(1.5, r * 0.45);
      c.strokeStyle = '#1b2433';
      c.lineCap = 'round';
      c.stroke();
    }
  }
}

function mouth(c: CanvasRenderingContext2D, x: number, y: number, w: number, mood: Mood, colour: string): void {
  c.beginPath();
  if (mood === 'happy') c.arc(x, y - w * 0.35, w, 0.15 * Math.PI, 0.85 * Math.PI);
  else c.arc(x, y + w * 0.75, w, 1.2 * Math.PI, 1.8 * Math.PI);
  c.lineWidth = Math.max(1.5, w * 0.28);
  c.strokeStyle = colour;
  c.lineCap = 'round';
  c.stroke();
}

/** Frost's head centred at (x, y) with radius r. */
export function drawFrost(c: CanvasRenderingContext2D, x: number, y: number, r: number, mood: Mood): void {
  const fur = '#f4f8ff';
  const line = '#8fbde0';
  // Horns.
  c.fillStyle = '#c9dcef';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + s * r * 0.55, y - r * 0.6);
    c.quadraticCurveTo(x + s * r * 0.95, y - r * 1.05, x + s * r * 0.8, y - r * 1.25);
    c.quadraticCurveTo(x + s * r * 0.7, y - r * 0.85, x + s * r * 0.3, y - r * 0.72);
    c.closePath();
    c.fill();
  }
  ellipse(c, x, y, r, r * 0.95, fur, line, Math.max(1.5, r * 0.06));
  for (const [dx, rr] of [[-0.35, 0.28], [0, 0.34], [0.35, 0.28]] as const) ellipse(c, x + dx * r, y - r * 0.78, rr * r, rr * r, fur);
  ellipse(c, x, y + r * 0.12, r * 0.66, r * 0.52, '#cfe6f7');
  eyes(c, x, y + r * 0.02, r * 0.24, r * 0.1, mood);
  ellipse(c, x, y + r * 0.2, r * 0.11, r * 0.08, '#6f8fb3');
  mouth(c, x, y + r * 0.42, r * 0.2, mood, '#3d5a7a');
  if (mood === 'happy') {
    ellipse(c, x - r * 0.45, y + r * 0.27, r * 0.11, r * 0.07, 'rgba(150, 180, 240, 0.7)');
    ellipse(c, x + r * 0.45, y + r * 0.27, r * 0.11, r * 0.07, 'rgba(150, 180, 240, 0.7)');
  } else {
    ellipse(c, x + r * 0.32, y + r * 0.2, r * 0.05, r * 0.09, '#7cc4ff');
  }
}

/** Spark's head centred at (x, y) with radius r. */
export function drawSpark(c: CanvasRenderingContext2D, x: number, y: number, r: number, mood: Mood): void {
  const fur = '#f07a3a';
  const dark = '#b9471c';
  // Ears with flame tips.
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + s * r * 0.25, y - r * 0.7);
    c.lineTo(x + s * r * 0.75, y - r * 1.3);
    c.lineTo(x + s * r * 0.85, y - r * 0.45);
    c.closePath();
    c.fillStyle = fur;
    c.fill();
    c.beginPath();
    c.moveTo(x + s * r * 0.6, y - r * 1.05);
    c.lineTo(x + s * r * 0.75, y - r * 1.3);
    c.lineTo(x + s * r * 0.8, y - r * 0.95);
    c.closePath();
    c.fillStyle = '#ffd23f';
    c.fill();
  }
  ellipse(c, x, y, r, r * 0.9, fur, dark, Math.max(1.5, r * 0.06));
  // White cheeks and muzzle.
  ellipse(c, x - r * 0.42, y + r * 0.32, r * 0.36, r * 0.28, '#fff4e6');
  ellipse(c, x + r * 0.42, y + r * 0.32, r * 0.36, r * 0.28, '#fff4e6');
  ellipse(c, x, y + r * 0.36, r * 0.3, r * 0.26, '#fff4e6');
  eyes(c, x, y - r * 0.12, r * 0.3, r * 0.1, mood);
  ellipse(c, x, y + r * 0.2, r * 0.1, r * 0.07, '#2a1a12');
  mouth(c, x, y + r * 0.42, r * 0.18, mood, '#7a2e12');
  if (mood === 'sad') ellipse(c, x - r * 0.38, y + r * 0.08, r * 0.05, r * 0.09, '#7cc4ff');
}

/** A canvas with one or both mascots side by side (Frost left, Spark right). Height in CSS px. */
export function mascotCanvas(who: 'frost' | 'spark' | 'both', mood: Mood, heightCss: number, label: string): HTMLCanvasElement {
  const n = who === 'both' ? 2 : 1;
  const w = Math.round(heightCss * (n === 2 ? 1.9 : 1));
  const canvas = document.createElement('canvas');
  canvas.className = 'tc-mascot';
  canvas.style.width = `${w}px`;
  canvas.style.height = `${heightCss}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(heightCss * dpr);
  const c = canvas.getContext('2d');
  if (c) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = heightCss * 0.36;
    const cy = heightCss * 0.56;
    if (who === 'frost') drawFrost(c, w / 2, cy, r, mood);
    else if (who === 'spark') drawSpark(c, w / 2, cy, r, mood);
    else {
      drawFrost(c, w * 0.27, cy, r, mood);
      drawSpark(c, w * 0.73, cy, r, mood);
    }
  }
  return canvas;
}
