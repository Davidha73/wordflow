/**
 * 2D polygon boolean operations (Union / Subtract) for WordFlow shapes.
 * Converts rect, ellipse, and merged path shapes to polygon rings,
 * performs segment-split boolean clipping, and emits normalized path rings.
 */

const EPS = 1e-6;

function rotatePoint(px, py, cx, cy, rad) {
  if (!rad) return { x: px, y: py };
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function buildRectRing(x, y, w, h, radius = 0) {
  const r = Math.min(Math.max(0, radius), w / 2, h / 2);
  if (r <= 0.5) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  const pts = [];
  const corners = [
    { cx: x + w - r, cy: y + r, start: -Math.PI / 2, end: 0 },
    { cx: x + w - r, cy: y + h - r, start: 0, end: Math.PI / 2 },
    { cx: x + r, cy: y + h - r, start: Math.PI / 2, end: Math.PI },
    { cx: x + r, cy: y + r, start: Math.PI, end: (3 * Math.PI) / 2 },
  ];
  const segs = 6;
  corners.forEach(({ cx, cy, start, end }) => {
    for (let i = 0; i <= segs; i++) {
      const a = start + ((end - start) * i) / segs;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  });
  return pts;
}

function buildEllipseRing(x, y, w, h, steps = 64) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

export function shapeToRings(shape) {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const rad = ((shape.rotation || 0) * Math.PI) / 180;

  let rings;
  if (shape.type === 'rect') {
    rings = [buildRectRing(shape.x, shape.y, shape.w, shape.h, shape.cornerRadius || 0)];
  } else if (shape.type === 'ellipse') {
    rings = [buildEllipseRing(shape.x, shape.y, shape.w, shape.h)];
  } else if (shape.type === 'path' && Array.isArray(shape.rings)) {
    rings = shape.rings.map((ring) =>
      ring.map((pt) => ({
        x: shape.x + pt.x * shape.w,
        y: shape.y + pt.y * shape.h,
      }))
    );
  } else {
    return [];
  }

  return rings.map((ring) => ring.map((pt) => rotatePoint(pt.x, pt.y, cx, cy, rad)));
}

function pointInRings(px, py, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x;
      const yi = ring[i].y;
      const xj = ring[j].x;
      const yj = ring[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

function segIntersectParams(a, b, c, d) {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const qpx = c.x - a.x;
  const qpy = c.y - a.y;
  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;
  if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) {
    return t;
  }
  return null;
}

function splitRingsAgainst(subjectRings, clipRings) {
  const segments = [];
  for (const ring of subjectRings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ts = [0, 1];
      for (const cRing of clipRings) {
        for (let j = 0; j < cRing.length; j++) {
          const c = cRing[j];
          const d = cRing[(j + 1) % cRing.length];
          const t = segIntersectParams(a, b, c, d);
          if (t !== null) ts.push(t);
        }
      }
      ts.sort((u, v) => u - v);
      const unique = [];
      for (const t of ts) {
        if (unique.length === 0 || t - unique[unique.length - 1] > 1e-5) {
          unique.push(t);
        }
      }
      for (let k = 0; k < unique.length - 1; k++) {
        const t0 = unique[k];
        const t1 = unique[k + 1];
        segments.push({
          a: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
          b: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
        });
      }
    }
  }
  return segments;
}

function keyPt(p) {
  return `${Math.round(p.x * 100)}:${Math.round(p.y * 100)}`;
}

function stitchSegments(segments) {
  const unused = segments.map((s, idx) => ({ ...s, idx, used: false }));
  const byStart = new Map();
  unused.forEach((s) => {
    const k = keyPt(s.a);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k).push(s);
  });

  const rings = [];
  for (const seg of unused) {
    if (seg.used) continue;
    const ring = [];
    let curr = seg;
    while (curr && !curr.used) {
      curr.used = true;
      ring.push(curr.a);
      const nextKey = keyPt(curr.b);
      if (ring.length > 2 && nextKey === keyPt(ring[0])) {
        break;
      }
      const candidates = (byStart.get(nextKey) || []).filter((c) => !c.used);
      curr = candidates[0] || null;
      if (!curr) {
        // Fallback nearest unused start within 1px
        let best = null;
        let bestDist = 1.5;
        for (const cand of unused) {
          if (cand.used) continue;
          const dist = Math.hypot(cand.a.x - ring[ring.length - 1].x, cand.a.y - ring[ring.length - 1].y);
          if (dist < bestDist) {
            bestDist = dist;
            best = cand;
          }
        }
        curr = best;
      }
    }
    if (ring.length >= 3) {
      rings.push(ring);
    }
  }
  return rings;
}

export function booleanShapes(shapeA, shapeB, operation = 'union') {
  const ringsA = shapeToRings(shapeA);
  const ringsB = shapeToRings(shapeB);
  if (ringsA.length === 0 || ringsB.length === 0) return null;

  const segsA = splitRingsAgainst(ringsA, ringsB);
  const segsB = splitRingsAgainst(ringsB, ringsA);

  const kept = [];
  for (const s of segsA) {
    const mx = (s.a.x + s.b.x) / 2;
    const my = (s.a.y + s.b.y) / 2;
    const inB = pointInRings(mx, my, ringsB);
    if (!inB) kept.push(s);
  }

  for (const s of segsB) {
    const mx = (s.a.x + s.b.x) / 2;
    const my = (s.a.y + s.b.y) / 2;
    const inA = pointInRings(mx, my, ringsA);
    if (operation === 'union') {
      if (!inA) kept.push(s);
    } else if (operation === 'subtract') {
      if (inA) kept.push({ a: s.b, b: s.a });
    }
  }

  const outRings = stitchSegments(kept);
  if (outRings.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of outRings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const w = Math.max(16, Math.round(maxX - minX));
  const h = Math.max(16, Math.round(maxY - minY));
  const normRings = outRings.map((ring) =>
    ring.map((p) => ({
      x: (p.x - minX) / Math.max(1, maxX - minX),
      y: (p.y - minY) / Math.max(1, maxY - minY),
    }))
  );

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    w,
    h,
    rings: normRings,
  };
}

export function buildPathDataFromRings(rings, w, h, cornerRadii = null, closed = true) {
  if (!Array.isArray(rings)) return '';
  return rings
    .map((ring, ringIdx) => {
      if (!ring || ring.length < 2) return '';
      const pts = ring.map((p) => ({ x: p.x * w, y: p.y * h }));
      const n = pts.length;
      const cmds = [];

      for (let i = 0; i < n; i++) {
        const curr = pts[i];
        const canFillet = n >= 3 && (closed || (i > 0 && i < n - 1));
        const rRaw = canFillet ? Number(cornerRadii?.[`${ringIdx}:${i}`]) || 0 : 0;
        if (rRaw <= 0.5) {
          cmds.push(`${i === 0 ? 'M' : 'L'} ${+curr.x.toFixed(2)} ${+curr.y.toFixed(2)}`);
          continue;
        }

        const prev = pts[(i - 1 + n) % n];
        const next = pts[(i + 1) % n];
        const lenIn = Math.hypot(prev.x - curr.x, prev.y - curr.y);
        const lenOut = Math.hypot(next.x - curr.x, next.y - curr.y);
        if (lenIn < 1 || lenOut < 1) {
          cmds.push(`${i === 0 ? 'M' : 'L'} ${+curr.x.toFixed(2)} ${+curr.y.toFixed(2)}`);
          continue;
        }

        const ux = (prev.x - curr.x) / lenIn;
        const uy = (prev.y - curr.y) / lenIn;
        const vx = (next.x - curr.x) / lenOut;
        const vy = (next.y - curr.y) / lenOut;
        const dot = Math.max(-1, Math.min(1, ux * vx + uy * vy));
        const theta = Math.acos(dot);

        if (theta < 0.01 || Math.PI - theta < 0.01) {
          cmds.push(`${i === 0 ? 'M' : 'L'} ${+curr.x.toFixed(2)} ${+curr.y.toFixed(2)}`);
          continue;
        }

        const tanHalf = Math.tan(theta / 2);
        const maxT = 0.48 * Math.min(lenIn, lenOut);
        const t = Math.min(rRaw / tanHalf, maxT);
        const rEff = t * tanHalf;

        const t1x = curr.x + ux * t;
        const t1y = curr.y + uy * t;
        const t2x = curr.x + vx * t;
        const t2y = curr.y + vy * t;

        const cross = -ux * vy - -uy * vx;
        const sweep = cross > 0 ? 1 : 0;

        cmds.push(`${i === 0 ? 'M' : 'L'} ${+t1x.toFixed(2)} ${+t1y.toFixed(2)}`);
        cmds.push(
          `A ${+rEff.toFixed(2)} ${+rEff.toFixed(2)} 0 0 ${sweep} ${+t2x.toFixed(2)} ${+t2y.toFixed(2)}`
        );
      }

      return closed ? `${cmds.join(' ')} Z` : cmds.join(' ');
    })
    .filter(Boolean)
    .join(' ');
}

export function mergeLinesToPath(lineShapes, snapTol = 6) {
  if (!Array.isArray(lineShapes) || lineShapes.length < 2) return null;
  const remaining = lineShapes.map((l) => ({
    a: { x: l.x1, y: l.y1 },
    b: { x: l.x2, y: l.y2 },
  }));

  const first = remaining.shift();
  const points = [first.a, first.b];

  while (remaining.length > 0) {
    const tail = points[points.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    let flip = false;

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const dA = Math.hypot(seg.a.x - tail.x, seg.a.y - tail.y);
      const dB = Math.hypot(seg.b.x - tail.x, seg.b.y - tail.y);
      if (dA < bestDist) {
        bestDist = dA;
        bestIdx = i;
        flip = false;
      }
      if (dB < bestDist) {
        bestDist = dB;
        bestIdx = i;
        flip = true;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    const startPt = flip ? next.b : next.a;
    const endPt = flip ? next.a : next.b;
    if (bestDist > snapTol) {
      points.push(startPt);
    }
    points.push(endPt);
  }

  if (points.length >= 3) {
    const firstPt = points[0];
    const lastPt = points[points.length - 1];
    if (Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y) <= snapTol) {
      points.pop();
    }
  }
  if (points.length < 3) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const normRing = points.map((p) => ({
    x: (p.x - minX) / spanX,
    y: (p.y - minY) / spanY,
  }));

  return {
    x: minX,
    y: minY,
    w: Math.max(16, spanX),
    h: Math.max(16, spanY),
    rings: [normRing],
  };
}
