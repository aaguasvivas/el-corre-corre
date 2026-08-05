// flag.ts: la bandera dominicana, drawn once and reused everywhere a canvas
// needs it (the share card, the roadside flags in the world atlas).
//
// The whole point of this module is that the flag must never read as the
// French one. That means all four things: the white cross, blue at the upper
// hoist and lower fly, red at the upper fly and lower hoist, and el escudo in
// the middle. The escudo keeps the real one's defining anatomy at the sizes
// we draw: the shield is itself quartered by a white cross with blue and red
// quarters (a small flag inside the flag), the open Bible sits at the
// center with the small gold cross above it, branches flank the shield, the
// blue ribbon rides above and the red below. Only the lettering is dropped;
// it turns to mush below about 200 px.
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

  // el escudo: the shield is quartered like the flag itself
  const shieldPath = (): void => {
    g.beginPath();
    g.moveTo(px(35), py(16.9));
    g.lineTo(px(45), py(16.9));
    g.lineTo(px(45), py(25));
    g.lineTo(px(40), py(30.4));
    g.lineTo(px(35), py(25));
    g.closePath();
  };
  g.save();
  shieldPath();
  g.clip();
  // white field, then the four quarters; the gaps between them ARE the cross
  g.fillStyle = '#ffffff';
  g.fillRect(px(35), py(16.9), S(10), S(13.5));
  g.fillStyle = '#002d62';
  g.fillRect(px(35), py(16.9), S(4.2), S(4.8)); // upper hoist blue
  g.fillRect(px(40.8), py(23.3), S(4.2), S(7.2)); // lower fly blue
  g.fillStyle = '#ce1126';
  g.fillRect(px(40.8), py(16.9), S(4.2), S(4.8)); // upper fly red
  g.fillRect(px(35), py(23.3), S(4.2), S(7.2)); // lower hoist red
  g.restore();
  shieldPath();
  g.strokeStyle = '#002d62';
  g.lineWidth = S(0.8);
  g.stroke();
  // la Biblia abierta at the center of the cross
  g.fillStyle = '#f7f3e8';
  g.strokeStyle = '#002d62';
  g.lineWidth = S(0.5);
  g.beginPath();
  g.moveTo(px(40), py(23.2));
  g.lineTo(px(37.4), py(22.5));
  g.lineTo(px(37.4), py(24.6));
  g.lineTo(px(40), py(25.4));
  g.lineTo(px(42.6), py(24.6));
  g.lineTo(px(42.6), py(22.5));
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(px(40), py(23.2));
  g.lineTo(px(40), py(25.4));
  g.stroke();
  // the small gold cross above the Bible
  g.fillStyle = '#f4c430';
  g.fillRect(px(39.6), py(18.2), S(0.8), S(3.6));
  g.fillRect(px(38.4), py(19.2), S(3.2), S(0.8));
  g.restore();
}
