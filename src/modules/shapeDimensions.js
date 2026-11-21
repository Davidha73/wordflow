/**
 * CAD-style relative dimensioning and spacing tool for positioning shapes
 * accurately with respect to each other.
 */

const UNIT_PX = { px: 1, in: 96, mm: 96 / 25.4 };

export function formatDimension(pxVal, unit = 'mm') {
  const val = pxVal / (UNIT_PX[unit] || 1);
  if (unit === 'in') return Number(val.toFixed(2));
  if (unit === 'mm') return Number(val.toFixed(1));
  return Math.round(val);
}

export function parseDimensionToPx(rawVal, unit = 'mm') {
  const num = parseFloat(rawVal);
  if (!Number.isFinite(num)) return null;
  return unit === 'px' ? Math.round(num) : num * (UNIT_PX[unit] || 1);
}

function getAnchorX(shape, ref = 'edge', isSecond = false) {
  if (ref === 'left') return shape.x;
  if (ref === 'center') return shape.x + shape.w / 2;
  if (ref === 'right') return shape.x + shape.w;
  return isSecond ? shape.x : shape.x + shape.w;
}

function getAnchorY(shape, ref = 'edge', isSecond = false) {
  if (ref === 'top') return shape.y;
  if (ref === 'middle') return shape.y + shape.h / 2;
  if (ref === 'bottom') return shape.y + shape.h;
  return isSecond ? shape.y : shape.y + shape.h;
}

export function measureBetweenShapes(a, b, refX = 'edge', refY = 'edge') {
  if (!a || !b) return { gapX: 0, gapY: 0, dxCenter: 0, dyCenter: 0 };
  const aCx = a.x + a.w / 2;
  const bCx = b.x + b.w / 2;
  const aCy = a.y + a.h / 2;
  const bCy = b.y + b.h / 2;

  const firstX = bCx >= aCx ? a : b;
  const secondX = firstX === a ? b : a;
  const gapX = getAnchorX(secondX, refX, true) - getAnchorX(firstX, refX, false);

  const firstY = bCy >= aCy ? a : b;
  const secondY = firstY === a ? b : a;
  const gapY = getAnchorY(secondY, refY, true) - getAnchorY(firstY, refY, false);

  return {
    gapX,
    gapY,
    dxCenter: bCx - aCx,
    dyCenter: bCy - aCy,
  };
}

export function applyRelativeGap(shapes, axis, gapPx, ref = 'edge') {
  if (!Array.isArray(shapes) || shapes.length < 2 || !Number.isFinite(gapPx)) return false;
  const ordered = [...shapes].sort((a, b) =>
    axis === 'x' ? a.x + a.w / 2 - (b.x + b.w / 2) : a.y + a.h / 2 - (b.y + b.h / 2)
  );
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (axis === 'x') {
      const prevAnchor = getAnchorX(prev, ref, false);
      const currOffset =
        ref === 'center' ? curr.w / 2 : ref === 'right' ? curr.w : 0;
      curr.x = Math.max(0, prevAnchor + gapPx - currOffset);
    } else {
      const prevAnchor = getAnchorY(prev, ref, false);
      const currOffset =
        ref === 'middle' ? curr.h / 2 : ref === 'bottom' ? curr.h : 0;
      curr.y = Math.max(0, prevAnchor + gapPx - currOffset);
    }
  }
  return true;
}

export function renderDimensionGuides(layerEl, selected, unit = 'mm', refX = 'edge', refY = 'edge') {
  if (!layerEl || !Array.isArray(selected) || selected.length < 2) return;
  const a = selected[0];
  const b = selected[1];
  const { gapX, gapY } = measureBetweenShapes(a, b, refX, refY);

  const leftShape = a.x + a.w / 2 <= b.x + b.w / 2 ? a : b;
  const rightShape = leftShape === a ? b : a;
  const x1 = getAnchorX(leftShape, refX, false);
  const x2 = getAnchorX(rightShape, refX, true);
  const midY = Math.round(
    (Math.max(leftShape.y, rightShape.y) +
      Math.min(leftShape.y + leftShape.h, rightShape.y + rightShape.h)) /
      2 || (leftShape.y + leftShape.h / 2 + rightShape.y + rightShape.h / 2) / 2
  );

  const hxStart = Math.min(x1, x2);
  const hxWidth = Math.max(1, Math.abs(x2 - x1));
  const hLine = document.createElement('div');
  hLine.className = 'shape-dim-line-x';
  hLine.style.left = `${hxStart}px`;
  hLine.style.top = `${midY}px`;
  hLine.style.width = `${hxWidth}px`;

  const hLabel = document.createElement('span');
  hLabel.className = 'shape-dim-label shape-dim-label-x';
  hLabel.textContent = `ΔX: ${formatDimension(gapX, unit)}${unit}`;
  hLine.appendChild(hLabel);
  layerEl.appendChild(hLine);

  const topShape = a.y + a.h / 2 <= b.y + b.h / 2 ? a : b;
  const bottomShape = topShape === a ? b : a;
  const y1 = getAnchorY(topShape, refY, false);
  const y2 = getAnchorY(bottomShape, refY, true);
  const midX = Math.round(
    (Math.max(topShape.x, bottomShape.x) +
      Math.min(topShape.x + topShape.w, bottomShape.x + bottomShape.w)) /
      2 || (topShape.x + topShape.w / 2 + bottomShape.x + bottomShape.w / 2) / 2
  );

  const vyStart = Math.min(y1, y2);
  const vyHeight = Math.max(1, Math.abs(y2 - y1));
  const vLine = document.createElement('div');
  vLine.className = 'shape-dim-line-y';
  vLine.style.left = `${midX}px`;
  vLine.style.top = `${vyStart}px`;
  vLine.style.height = `${vyHeight}px`;

  const vLabel = document.createElement('span');
  vLabel.className = 'shape-dim-label shape-dim-label-y';
  vLabel.textContent = `ΔY: ${formatDimension(gapY, unit)}${unit}`;
  vLine.appendChild(vLabel);
  layerEl.appendChild(vLine);
}
