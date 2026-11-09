/**
 * Title art: Frost (friendly yeti, cool colours) and Spark (fire fox, warm colours), drawn in code.
 * Deterministic: same size gives the same pixels. Owner: W1-B.
 */

/** Logical size of the drawing; the canvas scales it to fit. */
export const MASCOT_W = 360;
export const MASCOT_H = 200;

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 3): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ellipse(ctx, x, y, r, r * 1.15, '#1b2433');
  ellipse(ctx, x + r * 0.35, y - r * 0.4, r * 0.35, r * 0.35, '#ffffff');
}

function drawFrost(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const fur = '#f4f8ff';
  const line = '#8fbde0';
  // Feet and arms.
  ellipse(ctx, cx - 22, cy + 58, 18, 10, fur, line);
  ellipse(ctx, cx + 22, cy + 58, 18, 10, fur, line);
  ctx.save();
  ctx.translate(cx - 48, cy + 18);
  ctx.rotate(0.5);
  ellipse(ctx, 0, 0, 13, 26, fur, line);
  ctx.restore();
  ctx.save();
  ctx.translate(cx + 50, cy + 2);
  ctx.rotate(-0.9);
  ellipse(ctx, 0, 0, 13, 26, fur, line);
  ctx.restore();
  // Body.
  ellipse(ctx, cx, cy + 14, 48, 52, fur, line);
  // Fur tufts on the head.
  for (const [dx, r] of [[-16, 11], [0, 14], [16, 11]] as const) ellipse(ctx, cx + dx, cy - 36, r, r, fur);
  // Small horns.
  ctx.fillStyle = '#c9dcef';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 26, cy - 30);
    ctx.quadraticCurveTo(cx + s * 40, cy - 46, cx + s * 34, cy - 58);
    ctx.quadraticCurveTo(cx + s * 30, cy - 42, cx + s * 18, cy - 36);
    ctx.closePath();
    ctx.fill();
  }
  // Face.
  ellipse(ctx, cx, cy - 6, 30, 23, '#cfe6f7');
  eye(ctx, cx - 11, cy - 10, 4.5);
  eye(ctx, cx + 11, cy - 10, 4.5);
  ellipse(ctx, cx, cy + 0, 5, 3.5, '#6f8fb3');
  ctx.beginPath();
  ctx.arc(cx, cy + 3, 10, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#3d5a7a';
  ctx.stroke();
  // Blush.
  ellipse(ctx, cx - 21, cy + 2, 5, 3, 'rgba(150, 180, 240, 0.6)');
  ellipse(ctx, cx + 21, cy + 2, 5, 3, 'rgba(150, 180, 240, 0.6)');
  // Blue scarf with a hanging tail.
  ctx.fillStyle = '#2f7fd1';
  ctx.beginPath();
  ctx.moveTo(cx - 40, cy + 18);
  ctx.quadraticCurveTo(cx, cy + 32, cx + 40, cy + 18);
  ctx.lineTo(cx + 38, cy + 30);
  ctx.quadraticCurveTo(cx, cy + 44, cx - 38, cy + 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2669b0';
  ctx.beginPath();
  ctx.moveTo(cx + 14, cy + 30);
  ctx.lineTo(cx + 28, cy + 30);
  ctx.lineTo(cx + 26, cy + 62);
  ctx.lineTo(cx + 12, cy + 60);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9fd0ff';
  for (const y of [cy + 40, cy + 50]) ctx.fillRect(cx + 13, y, 14, 3);
}

function drawSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const orange = '#f27b2a';
  const cream = '#ffe8c9';
  const line = '#b84d14';
  // Flame tail behind the body.
  const grad = ctx.createLinearGradient(cx + 20, cy + 60, cx + 70, cy - 50);
  grad.addColorStop(0, '#e2401c');
  grad.addColorStop(0.5, '#ff9a2e');
  grad.addColorStop(1, '#ffe14d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx + 22, cy + 52);
  ctx.bezierCurveTo(cx + 80, cy + 50, cx + 86, cy - 4, cx + 62, cy - 52);
  ctx.bezierCurveTo(cx + 64, cy - 20, cx + 54, cy - 12, cx + 50, cy - 26);
  ctx.bezierCurveTo(cx + 50, cy - 6, cx + 40, cy + 2, cx + 38, cy - 8);
  ctx.bezierCurveTo(cx + 40, cy + 22, cx + 30, cy + 30, cx + 18, cy + 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3a6';
  ctx.beginPath();
  ctx.moveTo(cx + 34, cy + 44);
  ctx.bezierCurveTo(cx + 62, cy + 38, cx + 66, cy + 6, cx + 56, cy - 18);
  ctx.bezierCurveTo(cx + 54, cy + 10, cx + 44, cy + 22, cx + 30, cy + 30);
  ctx.closePath();
  ctx.fill();
  // Legs and body.
  ellipse(ctx, cx - 16, cy + 58, 11, 8, '#7a2a12');
  ellipse(ctx, cx + 14, cy + 58, 11, 8, '#7a2a12');
  ellipse(ctx, cx, cy + 26, 34, 36, orange, line);
  ellipse(ctx, cx, cy + 32, 18, 24, cream);
  // Ears with dark tips.
  for (const s of [-1, 1]) {
    ctx.fillStyle = orange;
    ctx.beginPath();
    ctx.moveTo(cx + s * 12, cy - 40);
    ctx.lineTo(cx + s * 32, cy - 76);
    ctx.lineTo(cx + s * 36, cy - 30);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = line;
    ctx.stroke();
    ctx.fillStyle = '#7a2a12';
    ctx.beginPath();
    ctx.moveTo(cx + s * 27, cy - 66);
    ctx.lineTo(cx + s * 32, cy - 76);
    ctx.lineTo(cx + s * 33.5, cy - 62);
    ctx.closePath();
    ctx.fill();
  }
  // Head with a cream muzzle.
  ellipse(ctx, cx, cy - 22, 34, 28, orange, line);
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy - 16);
  ctx.quadraticCurveTo(cx, cy - 26, cx + 30, cy - 16);
  ctx.quadraticCurveTo(cx + 18, cy + 6, cx, cy + 6);
  ctx.quadraticCurveTo(cx - 18, cy + 6, cx - 30, cy - 16);
  ctx.closePath();
  ctx.fill();
  eye(ctx, cx - 12, cy - 26, 4.5);
  eye(ctx, cx + 12, cy - 26, 4.5);
  ellipse(ctx, cx, cy - 12, 5, 4, '#2a1a14');
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy - 4);
  ctx.quadraticCurveTo(cx, cy + 1, cx, cy - 8);
  ctx.quadraticCurveTo(cx, cy + 1, cx + 7, cy - 4);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5a2a14';
  ctx.stroke();
  // A small flame tuft on the head.
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 46);
  ctx.quadraticCurveTo(cx - 4, cy - 62, cx + 2, cy - 64);
  ctx.quadraticCurveTo(cx - 1, cy - 54, cx + 8, cy - 50);
  ctx.quadraticCurveTo(cx + 4, cy - 44, cx - 8, cy - 46);
  ctx.fill();
}

/** Draw both mascots on a split cool/warm backdrop into a `w` × `h` area. */
export function drawMascots(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = Math.min(w / MASCOT_W, h / MASCOT_H);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate((w - MASCOT_W * s) / 2, (h - MASCOT_H * s) / 2);
  ctx.scale(s, s);
  // Split backdrop: Chill on the left, Thrill on the right.
  const cool = ctx.createRadialGradient(100, 110, 10, 100, 110, 110);
  cool.addColorStop(0, 'rgba(79, 179, 217, 0.55)');
  cool.addColorStop(1, 'rgba(79, 179, 217, 0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, MASCOT_W / 2, MASCOT_H);
  const warm = ctx.createRadialGradient(260, 110, 10, 260, 110, 110);
  warm.addColorStop(0, 'rgba(240, 122, 58, 0.55)');
  warm.addColorStop(1, 'rgba(240, 122, 58, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(MASCOT_W / 2, 0, MASCOT_W / 2, MASCOT_H);
  // Snowflakes and sparks.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  for (const [x, y] of [[30, 40], [58, 22], [150, 34], [24, 150], [160, 160]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 210, 63, 0.9)';
  for (const [x, y] of [[212, 30], [332, 40], [300, 18], [340, 150], [206, 160]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 2, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 2, y);
    ctx.closePath();
    ctx.fill();
  }
  drawFrost(ctx, 100, 112);
  drawSpark(ctx, 250, 112);
  ctx.restore();
}
