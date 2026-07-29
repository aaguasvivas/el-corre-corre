// flag.ts: la bandera dominicana, drawn once and reused everywhere a canvas
// needs it (the share card, the roadside flags in the world atlas).
//
// The whole point of this module is that the flag must never read as the
// French one. That means all four things: the white cross, blue at the upper
// hoist and lower fly, red at the upper fly and lower hoist, and el escudo in
// the middle. The escudo is simplified to what survives at small sizes, a
// wreath around a shield with the gold cross, the blue ribbon above and the
// red below, because the real one (Bible, spears, lettering) turns to mush
// below about 200 px.
//
// Authored in an 80 x 50 space, the flag's real 8:5 ratio, and scaled by
// width. The SVG twin of this lives in ui.ts as FLAG_SVG; keep them in step.

export const FLAG_ASPECT = 80 / 50;

export function drawDominicanFlag(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
): void {
  const u = w / 80;
  const S = (n: number): number => n * u;
  const px = (n: number): number => x + n * u;
  const py = (n: number): number => y + n * u;

  g.save();
  g.fillStyle = '#ffffff';
  g.fillRect(x, y, w, S(50));
  g.fillStyle = '#002d62';
  g.fillRect(px(0), py(0), S(36), S(21));
  g.fillRect(px(44), py(29), S(36), S(21));
  g.fillStyle = '#ce1126';
  g.fillRect(px(44), py(0), S(36), S(21));
  g.fillRect(px(0), py(29), S(36), S(21));

  // laurel on the left, palm on the right, hugging the shield
  g.lineCap = 'round';
  g.strokeStyle = '#2f7d32';
  g.lineWidth = S(1.9);
  g.beginPath();
  g.moveTo(px(39.4), py(33.2));
  g.bezierCurveTo(px(34.4), py(32.1), px(31.8), py(28), px(32.2), py(22.6));
  g.stroke();
  g.beginPath();
  g.moveTo(px(40.6), py(33.2));
  g.bezierCurveTo(px(45.6), py(32.1), px(48.2), py(28), px(47.8), py(22.6));
  g.stroke();
  g.lineWidth = S(1.2);
  for (const [ax, ay, bx, by] of [
    [33.6, 25.4, 31.7, 26.9],
    [33.0, 21.9, 30.9, 22.8],
    [33.4, 18.6, 31.5, 18.4],
  ]) {
    g.beginPath();
    g.moveTo(px(ax), py(ay));
    g.lineTo(px(bx), py(by));
    g.stroke();
    g.beginPath();
    g.moveTo(px(80 - ax), py(ay));
    g.lineTo(px(80 - bx), py(by));
    g.stroke();
  }

  // DIOS PATRIA LIBERTAD above, REPUBLICA DOMINICANA below
  g.fillStyle = '#002d62';
  g.fillRect(px(33.2), py(13.1), S(13.6), S(2.2));
  g.fillStyle = '#ce1126';
  g.fillRect(px(33.8), py(33.4), S(12.4), S(2.2));

  // el escudo
  g.beginPath();
  g.moveTo(px(35), py(16.9));
  g.lineTo(px(45), py(16.9));
  g.lineTo(px(45), py(25));
  g.lineTo(px(40), py(30.4));
  g.lineTo(px(35), py(25));
  g.closePath();
  g.fillStyle = '#f7f3e8';
  g.fill();
  g.strokeStyle = '#002d62';
  g.lineWidth = S(0.8);
  g.stroke();
  g.fillStyle = '#f4c430';
  g.fillRect(px(39.3), py(18.5), S(1.4), S(8));
  g.fillRect(px(37.1), py(20.8), S(5.8), S(1.4));
  g.restore();
}
