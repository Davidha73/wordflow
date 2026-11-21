import { booleanShapes, buildPathDataFromRings, mergeLinesToPath } from './shapeBoolean.js';
import {
  applyRelativeGap,
  formatDimension,
  measureBetweenShapes,
  parseDimensionToPx,
  renderDimensionGuides,
} from './shapeDimensions.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const STANDARD_COLORS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'Dark Red', hex: '#C00000' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Orange', hex: '#FFC000' },
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Light Green', hex: '#92D050' },
  { name: 'Green', hex: '#00B050' },
  { name: 'Light Blue', hex: '#00B0F0' },
  { name: 'Blue', hex: '#0070C0' },
  { name: 'Dark Blue', hex: '#002060' },
  { name: 'Purple', hex: '#7030A0' },
];

const LIGHT_FILLS = new Set(['none', '#ffffff', '#FFFF00', '#FFC000', '#92D050']);
const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const UNIT_PX = { px: 1, in: 96, mm: 96 / 25.4 };

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

export function createPageShapes({ wordEl, onMutate }) {
  const layerEl = document.getElementById('page-shapes-layer');
  const behindLayerEl = document.getElementById('page-shapes-behind-layer');
  const miniBarEl = document.getElementById('shape-mini-toolbar');
  const fillDropdownEl = document.getElementById('shape-fill-dropdown');
  const fillBtnEl = document.getElementById('btn-shape-fill');
  const fillPopoverEl = document.getElementById('shape-fill-popover');
  const fillGridEl = document.getElementById('shape-fill-grid');
  const fillIndicatorEl = document.getElementById('shape-fill-indicator');

  const borderBtnEl = document.getElementById('btn-shape-border');
  const borderLabelEl = document.getElementById('shape-border-label');
  const borderNoneBtnEl = document.getElementById('btn-shape-border-none');
  const borderPopoverEl = document.getElementById('shape-border-popover');
  const borderGridEl = document.getElementById('shape-border-grid');
  const borderIndicatorEl = document.getElementById('shape-border-indicator');
  const alignBtnEl = document.getElementById('btn-shape-align');
  const alignPopoverEl = document.getElementById('shape-align-popover');
  const endsDropdownEl = document.getElementById('shape-ends-dropdown');
  const endsBtnEl = document.getElementById('btn-shape-ends');
  const endsPopoverEl = document.getElementById('shape-ends-popover');
  const wrapDropdownEl = document.getElementById('shape-wrap-dropdown');
  const wrapBtnEl = document.getElementById('btn-shape-wrap');
  const wrapPopoverEl = document.getElementById('shape-wrap-popover');
  const orderBtnEl = document.getElementById('btn-shape-order');
  const orderPopoverEl = document.getElementById('shape-order-popover');
  const cornersDropdownEl = document.getElementById('shape-corners-dropdown');
  const cornersBtnEl = document.getElementById('btn-shape-corners');
  const cornersPopoverEl = document.getElementById('shape-corners-popover');
  const mergeDropdownEl = document.getElementById('shape-merge-dropdown');
  const mergeBtnEl = document.getElementById('btn-shape-merge');
  const mergePopoverEl = document.getElementById('shape-merge-popover');
  const sizeDropdownEl = document.getElementById('shape-size-dropdown');
  const sizeBtnEl = document.getElementById('btn-shape-size');
  const sizePopoverEl = document.getElementById('shape-size-popover');
  const sizeUnitSelectEl = document.getElementById('shape-size-unit');
  const dimWInputEl = document.getElementById('shape-dim-w');
  const dimHInputEl = document.getElementById('shape-dim-h');
  const dimXInputEl = document.getElementById('shape-dim-x');
  const dimYInputEl = document.getElementById('shape-dim-y');
  const shapeDimGridEl = document.getElementById('shape-dim-grid');
  const lineDimGridEl = document.getElementById('line-dim-grid');
  const lineLenInputEl = document.getElementById('line-dim-len');
  const lineAngInputEl = document.getElementById('line-dim-ang');
  const lineX1InputEl = document.getElementById('line-dim-x1');
  const lineY1InputEl = document.getElementById('line-dim-y1');
  const lineAnchorHBtnEl = document.getElementById('btn-line-anchor-h');
  const lineAnchorVBtnEl = document.getElementById('btn-line-anchor-v');
  const spacingDropdownEl = document.getElementById('shape-spacing-dropdown');
  const spacingBtnEl = document.getElementById('btn-shape-spacing');
  const spacingPopoverEl = document.getElementById('shape-spacing-popover');
  const spacingUnitLabelEl = document.getElementById('shape-spacing-unit-label');
  const gapXInputEl = document.getElementById('shape-gap-x');
  const gapYInputEl = document.getElementById('shape-gap-y');
  const gapRefXSelectEl = document.getElementById('shape-gap-ref-x');
  const gapRefYSelectEl = document.getElementById('shape-gap-ref-y');
  const textToggleEl = document.getElementById('shape-text-toggle');
  const textCheckboxEl = document.getElementById('chk-shape-text');
  const cropBtnEl = document.getElementById('btn-shape-crop');
  const cropToBtnEl = document.getElementById('btn-shape-crop-to');
  const unmergeBtnEl = document.getElementById('btn-shape-unmerge');
  const doneMergeBtnEl = document.getElementById('btn-shape-done-merge');
  const marqueeBtnEl = document.getElementById('btn-shape-marquee');

  let shapes = [];
  let selectedIds = new Set();
  let editingShapeId = null;
  let croppingShapeId = null;
  let liveMergeSession = null;
  let marqueeMode = false;
  let lastClickShapeId = null;
  let lastClickTime = 0;
  let dragOp = null;
  let activeSnapPoint = null;
  let activeAlignGuides = [];
  let shapeClipboard = [];
  let pasteCount = 0;
  let lastCopiedWasShape = false;

  function setMarqueeMode(active) {
    marqueeMode = Boolean(active);
    layerEl?.classList.toggle('is-marquee-mode', marqueeMode);
    if (marqueeBtnEl) {
      marqueeBtnEl.classList.toggle('is-active', marqueeMode);
      marqueeBtnEl.setAttribute('aria-pressed', marqueeMode ? 'true' : 'false');
    }
  }

  function toggleMarqueeMode() {
    setMarqueeMode(!marqueeMode);
  }

  function getShapeBounds(s) {
    if (s.type === 'line' || s.type === 'arrow') {
      return {
        left: Math.min(s.x1, s.x2),
        top: Math.min(s.y1, s.y2),
        right: Math.max(s.x1, s.x2),
        bottom: Math.max(s.y1, s.y2),
      };
    }
    return {
      left: s.x,
      top: s.y,
      right: s.x + s.w,
      bottom: s.y + s.h,
    };
  }

  function getSelectedShapes() {
    return shapes.filter((s) => selectedIds.has(s.id));
  }

  function getSelectedShape() {
    const selected = getSelectedShapes();
    return selected.length > 0 ? selected[0] : null;
  }

  function closeColorPopovers() {
    if (fillPopoverEl) fillPopoverEl.classList.remove('is-open');
    if (borderPopoverEl) borderPopoverEl.classList.remove('is-open');
    if (alignPopoverEl) alignPopoverEl.classList.remove('is-open');
    if (endsPopoverEl) endsPopoverEl.classList.remove('is-open');
    if (wrapPopoverEl) wrapPopoverEl.classList.remove('is-open');
    if (orderPopoverEl) orderPopoverEl.classList.remove('is-open');
    if (cornersPopoverEl) cornersPopoverEl.classList.remove('is-open');
    if (mergePopoverEl) mergePopoverEl.classList.remove('is-open');
    if (sizePopoverEl) sizePopoverEl.classList.remove('is-open');
    if (spacingPopoverEl) spacingPopoverEl.classList.remove('is-open');
  }

  function hideMiniBar() {
    closeColorPopovers();
    if (miniBarEl) {
      miniBarEl.classList.remove('is-visible');
    }
  }

  function updateIndicators(shape) {
    if (!shape) return;
    const selected = getSelectedShapes();
    const isMulti = selected.length > 1;
    const hasBox = selected.some((s) => s.type !== 'line' && s.type !== 'arrow');
    const hasFillable = selected.some(
      (s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'path'
    );
    const isLineOnly = selected.length > 0 && !hasBox;
    if (borderLabelEl) {
      borderLabelEl.textContent = isLineOnly ? 'Colour' : 'Border';
    }
    if (borderNoneBtnEl) {
      borderNoneBtnEl.textContent = isLineOnly ? 'No Colour' : 'No Border';
    }
    if (fillDropdownEl) {
      fillDropdownEl.classList.toggle('is-hidden', !hasFillable);
    }
    if (textToggleEl) {
      textToggleEl.classList.toggle(
        'is-hidden',
        isMulti || (shape.type !== 'rect' && shape.type !== 'ellipse' && shape.type !== 'path')
      );
    }
    if (textCheckboxEl) {
      textCheckboxEl.checked = Boolean(shape.textEnabled || shape.label);
    }
    if (cropBtnEl) {
      const isSingleImage = !isMulti && shape.type === 'image';
      cropBtnEl.classList.toggle('is-hidden', !isSingleImage);
      cropBtnEl.classList.toggle('is-active', isSingleImage && croppingShapeId === shape.id);
    }
    if (cropToBtnEl) {
      const imgCount = selected.filter((s) => s.type === 'image').length;
      const maskCount = selected.filter((s) => s.type === 'rect' || s.type === 'ellipse').length;
      const canCropToShape = selected.length === 2 && imgCount === 1 && maskCount === 1;
      cropToBtnEl.classList.toggle('is-hidden', !canCropToShape);
    }
    if (unmergeBtnEl) {
      const canUnmerge =
        !liveMergeSession &&
        !isMulti &&
        shape.type === 'path' &&
        Array.isArray(shape.sources) &&
        shape.sources.length >= 2;
      unmergeBtnEl.classList.toggle('is-hidden', !canUnmerge);
    }
    if (doneMergeBtnEl) {
      doneMergeBtnEl.classList.toggle('is-hidden', !liveMergeSession);
      doneMergeBtnEl.classList.toggle('is-active', Boolean(liveMergeSession));
    }
    if (fillIndicatorEl) {
      fillIndicatorEl.style.backgroundColor =
        shape.fillColor === 'none' ? 'transparent' : shape.fillColor;
    }
    if (borderIndicatorEl) {
      borderIndicatorEl.style.backgroundColor =
        shape.strokeColor === 'none' ? 'transparent' : shape.strokeColor;
    }
    if (endsDropdownEl) {
      endsDropdownEl.classList.toggle('is-hidden', !isLineOnly);
    }
    if (wrapDropdownEl) {
      wrapDropdownEl.classList.toggle('is-hidden', !hasBox);
    }
    if (mergeDropdownEl) {
      const mergeableBoxes = selected.filter(
        (s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'path'
      );
      const mergeableLines = selected.filter((s) => s.type === 'line' || s.type === 'arrow');
      const canMerge =
        selected.length >= 2 &&
        (mergeableBoxes.length === selected.length || mergeableLines.length === selected.length);
      mergeDropdownEl.classList.toggle('is-hidden', !canMerge);
    }
    if (sizeDropdownEl) {
      const isSingle = !isMulti && Boolean(shape);
      const isLine = isSingle && (shape.type === 'line' || shape.type === 'arrow');
      sizeDropdownEl.classList.toggle('is-hidden', !isSingle);
      if (shapeDimGridEl) shapeDimGridEl.classList.toggle('is-hidden', isLine);
      if (lineDimGridEl) lineDimGridEl.classList.toggle('is-hidden', !isLine);
      if (isSingle) syncDimensionInputs(shape);
    }
    if (spacingDropdownEl) {
      const boxSelected = selected.filter((s) => s.type !== 'line' && s.type !== 'arrow');
      const canSpace = selected.length >= 2 && boxSelected.length === selected.length;
      spacingDropdownEl.classList.toggle('is-hidden', !canSpace);
      if (canSpace) syncSpacingInputs(boxSelected);
    }
    if (cornersDropdownEl) {
      const hasRectLike = selected.some(
        (s) => s.type === 'rect' || (s.type === 'image' && s.clipShape !== 'ellipse')
      );
      cornersDropdownEl.classList.toggle('is-hidden', !hasRectLike);
      if (hasRectLike) {
        const activeRadius = String(shape.cornerRadius || 0);
        cornersPopoverEl?.querySelectorAll('[data-shape-radius]').forEach((btn) => {
          btn.classList.toggle('is-active', btn.dataset.shapeRadius === activeRadius);
        });
      }
    }
    if (hasBox) {
      const activeWrap = shape.wrapMode || 'front';
      wrapPopoverEl?.querySelectorAll('[data-shape-wrap]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.shapeWrap === activeWrap);
      });
    }
    if (isLineOnly) {
      const startStyle = getLineMarker(shape, 'start');
      const endStyle = getLineMarker(shape, 'end');
      endsPopoverEl?.querySelectorAll('[data-shape-end="start"]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.endStyle === startStyle);
      });
      endsPopoverEl?.querySelectorAll('[data-shape-end="end"]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.endStyle === endStyle);
      });
    }
    const activeWidth = String(shape.strokeWidth || 2);
    const activeStyle = shape.strokeStyle || 'solid';
    borderPopoverEl?.querySelectorAll('[data-shape-width]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.shapeWidth === activeWidth);
    });
    borderPopoverEl?.querySelectorAll('[data-shape-style]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.shapeStyle === activeStyle);
    });
  }

  function positionMiniBar(shape, { show = false } = {}) {
    if (!miniBarEl || !layerEl) return;
    if (!show && !miniBarEl.classList.contains('is-visible')) {
      const sel = shape || getSelectedShape();
      if (sel) updateIndicators(sel);
      return;
    }
    const selected = getSelectedShapes();
    const target = shape || selected[0];
    if (!target) return;

    let minTop = Infinity;
    let minLeft = Infinity;
    selected.forEach((s) => {
      const isLine = s.type === 'line' || s.type === 'arrow';
      const sTop = isLine ? Math.min(s.y1, s.y2) - 44 : s.y - 72;
      const sLeft = isLine ? Math.min(s.x1, s.x2) : s.x;
      if (sTop < minTop) minTop = sTop;
      if (sLeft < minLeft) minLeft = sLeft;
    });

    miniBarEl.style.top = `${Math.max(6, minTop)}px`;
    miniBarEl.style.left = `${Math.max(8, minLeft)}px`;
    miniBarEl.classList.add('is-visible');
    updateIndicators(target);
  }

  function selectShape(id, { toggle = false } = {}) {
    if (!id) {
      selectedIds.clear();
    } else if (toggle) {
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
    } else {
      selectedIds = new Set([id]);
    }
    render();
    const sel = getSelectedShape();
    if (sel) {
      updateIndicators(sel);
    } else {
      hideMiniBar();
    }
  }

  function makeRegularPolygonRing(sides, startAngleDeg = -90) {
    const ring = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = ((startAngleDeg + (360 / sides) * i) * Math.PI) / 180;
      ring.push([0.5 + 0.48 * Math.cos(angle), 0.5 + 0.48 * Math.sin(angle)]);
    }
    return ring;
  }

  function makeStarRing(points = 5) {
    const ring = [];
    for (let i = 0; i < points * 2; i += 1) {
      const r = i % 2 === 0 ? 0.48 : 0.2;
      const angle = ((-90 + (180 / points) * i) * Math.PI) / 180;
      ring.push([0.5 + r * Math.cos(angle), 0.5 + r * Math.sin(angle)]);
    }
    return ring;
  }

  const PATH_SHAPE_PRESETS = {
    triangle: {
      w: 130,
      h: 115,
      rings: [[[0.5, 0.04], [0.96, 0.96], [0.04, 0.96]]],
    },
    'right-triangle': {
      w: 130,
      h: 115,
      rings: [[[0.04, 0.04], [0.96, 0.96], [0.04, 0.96]]],
    },
    diamond: {
      w: 120,
      h: 120,
      rings: [[[0.5, 0.04], [0.96, 0.5], [0.5, 0.96], [0.04, 0.5]]],
    },
    pentagon: {
      w: 125,
      h: 120,
      rings: [makeRegularPolygonRing(5)],
    },
    hexagon: {
      w: 130,
      h: 115,
      rings: [makeRegularPolygonRing(6, 0)],
    },
    star: {
      w: 130,
      h: 130,
      rings: [makeStarRing(5)],
    },
    'block-arrow': {
      w: 160,
      h: 90,
      rings: [[[0.04, 0.28], [0.62, 0.28], [0.62, 0.06], [0.96, 0.5], [0.62, 0.94], [0.62, 0.72], [0.04, 0.72]]],
    },
    callout: {
      w: 170,
      h: 120,
      rings: [[[0.04, 0.06], [0.96, 0.06], [0.96, 0.72], [0.42, 0.72], [0.22, 0.96], [0.26, 0.72], [0.04, 0.72]]],
    },
    plus: {
      w: 115,
      h: 115,
      rings: [[
        [0.34, 0.04], [0.66, 0.04], [0.66, 0.34], [0.96, 0.34],
        [0.96, 0.66], [0.66, 0.66], [0.66, 0.96], [0.34, 0.96],
        [0.34, 0.66], [0.04, 0.66], [0.04, 0.34], [0.34, 0.34],
      ]],
    },
  };

  function insertShape(type) {
    const id = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const offset = (shapes.length % 5) * 20;
    const preset = PATH_SHAPE_PRESETS[type];
    const resolvedType = preset ? 'path' : type === 'rounded-rect' ? 'rect' : type;
    const base = {
      id,
      type: resolvedType,
      fillColor: '#ffffff',
      strokeColor: '#1a1a1a',
      strokeWidth: 2,
      strokeStyle: 'solid',
      rotation: 0,
      label: '',
    };

    if (resolvedType === 'line' || resolvedType === 'arrow') {
      shapes.push({
        ...base,
        startMarker: 'none',
        endMarker: resolvedType === 'arrow' ? 'arrow' : 'none',
        x1: 120 + offset,
        y1: 220 + offset,
        x2: 320 + offset,
        y2: 130 + offset,
      });
    } else if (preset) {
      shapes.push({
        ...base,
        textEnabled: false,
        wrapMode: 'front',
        x: 240 + offset,
        y: 160 + offset,
        w: preset.w,
        h: preset.h,
        rings: preset.rings.map((ring) => ring.map(([rx, ry]) => ({ x: rx, y: ry }))),
        closed: true,
      });
    } else {
      shapes.push({
        ...base,
        textEnabled: false,
        wrapMode: 'front',
        x: 240 + offset,
        y: 160 + offset,
        w: resolvedType === 'rect' ? 50 * UNIT_PX.mm : 180,
        h: resolvedType === 'rect' ? 30 * UNIT_PX.mm : 105,
        cornerRadius: type === 'rounded-rect' ? 12 : 0,
      });
    }

    selectShape(id);
    onMutate?.();
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    const removed = new Set(selectedIds);
    shapes = shapes.filter((s) => !removed.has(s.id));
    shapes.forEach((s) => {
      if (s.startAnchor && removed.has(s.startAnchor.shapeId)) s.startAnchor = null;
      if (s.endAnchor && removed.has(s.endAnchor.shapeId)) s.endAnchor = null;
    });
    selectedIds.clear();
    editingShapeId = null;
    hideMiniBar();
    render();
    onMutate?.();
  }

  function setFillColor(hex) {
    const selected = getSelectedShapes();
    if (selected.length === 0) return;
    selected.forEach((s) => {
      if (s.type !== 'line' && s.type !== 'arrow') {
        s.fillColor = hex;
      }
    });
    render();
    positionMiniBar(selected[0]);
    closeColorPopovers();
    onMutate?.();
  }

  function setBorderColor(hex) {
    const selected = getSelectedShapes();
    if (selected.length === 0) return;
    selected.forEach((s) => {
      s.strokeColor = hex;
    });
    render();
    positionMiniBar(selected[0]);
    closeColorPopovers();
    onMutate?.();
  }

  function setBorderWidth(width) {
    const selected = getSelectedShapes();
    if (selected.length === 0) return;
    const numeric = Math.max(1, Number(width) || 2);
    selected.forEach((s) => {
      s.strokeWidth = numeric;
      if (s.strokeColor === 'none') s.strokeColor = '#1a1a1a';
    });
    render();
    positionMiniBar(selected[0]);
    onMutate?.();
  }

  function setBorderStyle(style) {
    const selected = getSelectedShapes();
    if (selected.length === 0) return;
    selected.forEach((s) => {
      s.strokeStyle = style;
      if (s.strokeColor === 'none') s.strokeColor = '#1a1a1a';
    });
    render();
    positionMiniBar(selected[0]);
    onMutate?.();
  }

  function getLineMarker(shape, end) {
    if (end === 'start') return shape.startMarker || 'none';
    return shape.endMarker || (shape.type === 'arrow' ? 'arrow' : 'none');
  }

  function reorderSelectedShapes(direction) {
    if (selectedIds.size === 0) return;
    if (direction === 'front') {
      const rest = shapes.filter((s) => !selectedIds.has(s.id));
      const sel = shapes.filter((s) => selectedIds.has(s.id));
      shapes = [...rest, ...sel];
    } else if (direction === 'back') {
      const sel = shapes.filter((s) => selectedIds.has(s.id));
      const rest = shapes.filter((s) => !selectedIds.has(s.id));
      shapes = [...sel, ...rest];
    } else if (direction === 'forward') {
      for (let i = shapes.length - 2; i >= 0; i -= 1) {
        if (selectedIds.has(shapes[i].id) && !selectedIds.has(shapes[i + 1].id)) {
          [shapes[i], shapes[i + 1]] = [shapes[i + 1], shapes[i]];
        }
      }
    } else if (direction === 'backward') {
      for (let i = 1; i < shapes.length; i += 1) {
        if (selectedIds.has(shapes[i].id) && !selectedIds.has(shapes[i - 1].id)) {
          [shapes[i], shapes[i - 1]] = [shapes[i - 1], shapes[i]];
        }
      }
    }
    render();
    positionMiniBar();
    closeColorPopovers();
    onMutate?.();
  }

  function setWrapMode(mode) {
    const selected = getSelectedShapes().filter(
      (s) => s.type !== 'line' && s.type !== 'arrow'
    );
    if (selected.length === 0) return;
    selected.forEach((s) => {
      s.wrapMode = mode;
    });
    render();
    positionMiniBar(selected[0]);
    closeColorPopovers();
    onMutate?.();
  }

  function setLineEndpointStyle(end, style) {
    const selected = getSelectedShapes().filter(
      (s) => s.type === 'line' || s.type === 'arrow'
    );
    if (selected.length === 0) return;
    selected.forEach((s) => {
      if (end === 'start') s.startMarker = style;
      else s.endMarker = style;
    });
    render();
    positionMiniBar(selected[0]);
    onMutate?.();
  }

  function getStrokeDashArray(style, width) {
    if (style === 'dashed') {
      return `${Math.max(4, width * 3)},${Math.max(3, width * 2)}`;
    }
    if (style === 'dotted') {
      return `${Math.max(1.5, width)},${Math.max(2.5, width * 1.6)}`;
    }
    return '';
  }

  function alignSelectedShape(alignment) {
    const selected = getSelectedShapes();
    if (selected.length === 0 || !layerEl) return;

    if (selected.length > 1) {
      const bounds = selected.map((s) => {
        const isLine = s.type === 'line' || s.type === 'arrow';
        const minX = isLine ? Math.min(s.x1, s.x2) : s.x;
        const maxX = isLine ? Math.max(s.x1, s.x2) : s.x + s.w;
        return { s, isLine, minX, maxX, w: maxX - minX };
      });
      const groupLeft = Math.min(...bounds.map((b) => b.minX));
      const groupRight = Math.max(...bounds.map((b) => b.maxX));
      const groupCenter = (groupLeft + groupRight) / 2;

      bounds.forEach(({ s, isLine, minX, w }) => {
        let targetX = groupLeft;
        if (alignment === 'center') targetX = Math.round(groupCenter - w / 2);
        else if (alignment === 'right') targetX = Math.round(groupRight - w);
        else targetX = Math.round(groupLeft);

        if (isLine) {
          const dx = targetX - minX;
          s.x1 += dx;
          s.x2 += dx;
          s.startAnchor = null;
          s.endAnchor = null;
        } else {
          s.x = targetX;
          syncAttachedLines(s);
        }
      });

      render();
      positionMiniBar(selected[0]);
      closeColorPopovers();
      onMutate?.();
      return;
    }

    const shape = selected[0];
    const pageW = layerEl.clientWidth || 794;
    const wordStyle = wordEl ? window.getComputedStyle(wordEl) : null;
    const padLeft = wordStyle ? parseFloat(wordStyle.paddingLeft) || 0 : 0;
    const padRight = wordStyle ? parseFloat(wordStyle.paddingRight) || 0 : 0;

    const isLine = shape.type === 'line' || shape.type === 'arrow';
    const itemW = isLine ? Math.abs(shape.x2 - shape.x1) : shape.w;

    let targetX = padLeft;
    if (alignment === 'center') {
      targetX = Math.max(0, Math.round((pageW - itemW) / 2));
    } else if (alignment === 'right') {
      targetX = Math.max(0, Math.round(pageW - padRight - itemW));
    } else {
      targetX = Math.round(padLeft);
    }

    if (isLine) {
      const minX = Math.min(shape.x1, shape.x2);
      const dx = targetX - minX;
      shape.x1 += dx;
      shape.x2 += dx;
      shape.startAnchor = null;
      shape.endAnchor = null;
    } else {
      shape.x = targetX;
      syncAttachedLines(shape);
    }

    render();
    positionMiniBar(shape);
    closeColorPopovers();
    onMutate?.();
  }

  function syncShapeLabelFromEl(shape, labelEl) {
    if (!shape || !labelEl) return;
    shape.labelHtml = labelEl.innerHTML;
    shape.label = (labelEl.innerText || labelEl.textContent || '').trim();
  }

  function bindLabelEditor(shape, labelEl) {
    labelEl.contentEditable = 'true';
    labelEl.classList.add('is-editing');
    labelEl.dataset.placeholder = 'Type text...';

    labelEl.addEventListener('mousedown', (e) => e.stopPropagation());
    labelEl.addEventListener('input', (e) => {
      syncShapeLabelFromEl(shape, labelEl);
      onMutate?.({ inputType: e.inputType || '', data: e.data || '', coalesce: true });
    });
    labelEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        editingShapeId = null;
        syncShapeLabelFromEl(shape, labelEl);
        render();
        onMutate?.();
      }
    });
    labelEl.addEventListener('blur', (e) => {
      if (e.relatedTarget?.closest('.format-toolbar')) return;
      editingShapeId = null;
      syncShapeLabelFromEl(shape, labelEl);
      labelEl.contentEditable = 'false';
      labelEl.classList.remove('is-editing');
      onMutate?.();
    });
  }

  function openShapeTextEditor(shape, targetEl) {
    if (!shape || shape.type === 'line' || shape.type === 'arrow') return;
    if (!shape.textEnabled && !shape.label && !shape.labelHtml) return;
    editingShapeId = shape.id;
    const el = targetEl || layerEl?.querySelector(`[data-shape-id="${shape.id}"]`);
    if (!el) return;

    let labelEl = el.querySelector('.word-shape-label');
    if (!labelEl) {
      labelEl = document.createElement('div');
      labelEl.className = 'word-shape-label';
      labelEl.style.color = LIGHT_FILLS.has(shape.fillColor) ? '#1a1a1a' : '#ffffff';
      el.appendChild(labelEl);
    }
    if (!labelEl.classList.contains('is-editing')) {
      bindLabelEditor(shape, labelEl);
    }
    labelEl.focus();
  }

  function startGroupMove(event) {
    const items = getSelectedShapes().map((s) =>
      s.type === 'line' || s.type === 'arrow'
        ? { shape: s, isLine: true, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }
        : { shape: s, isLine: false, x: s.x, y: s.y }
    );
    dragOp = {
      mode: 'move-group',
      startX: event.clientX,
      startY: event.clientY,
      items,
    };
  }

  function handleShapeBodyMouseDown(shape, event) {
    const now = Date.now();
    const isDblClick =
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      lastClickShapeId === shape.id &&
      now - lastClickTime < 350;
    lastClickShapeId = shape.id;
    lastClickTime = now;
    if (isDblClick) {
      lastClickTime = 0;
      dragOp = null;
      if (shape.type === 'path' && Array.isArray(shape.sources) && shape.sources.length >= 2) {
        enterLiveMergeEdit(shape);
        return;
      }
      if (shape.textEnabled || shape.label) {
        openShapeTextEditor(shape);
        return;
      }
    }

    if (event.shiftKey) {
      selectShape(shape.id, { toggle: true });
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      dragOp = {
        mode: 'pending-ctrl',
        shape,
        startX: event.clientX,
        startY: event.clientY,
      };
      return;
    }
    if (!selectedIds.has(shape.id)) {
      selectShape(shape.id);
    }
    if (selectedIds.size > 1) {
      startGroupMove(event);
    } else if (shape.type === 'line' || shape.type === 'arrow') {
      dragOp = {
        mode: 'move-line',
        shape,
        startX: event.clientX,
        startY: event.clientY,
        origX1: shape.x1,
        origY1: shape.y1,
        origX2: shape.x2,
        origY2: shape.y2,
      };
    } else {
      dragOp = {
        mode: 'move-box',
        shape,
        startX: event.clientX,
        startY: event.clientY,
        origX: shape.x,
        origY: shape.y,
      };
    }
  }

  function duplicateShapesForDrag(sourceShapes, startX, startY) {
    const idMap = new Map();
    const clones = sourceShapes.map((s) => {
      const nextId = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      idMap.set(s.id, nextId);
      const copy = JSON.parse(JSON.stringify(s));
      copy.id = nextId;
      return copy;
    });

    clones.forEach((copy) => {
      if (copy.startAnchor) {
        copy.startAnchor = idMap.has(copy.startAnchor.shapeId)
          ? { shapeId: idMap.get(copy.startAnchor.shapeId), dir: copy.startAnchor.dir }
          : null;
      }
      if (copy.endAnchor) {
        copy.endAnchor = idMap.has(copy.endAnchor.shapeId)
          ? { shapeId: idMap.get(copy.endAnchor.shapeId), dir: copy.endAnchor.dir }
          : null;
      }
      shapes.push(copy);
    });

    selectedIds = new Set(clones.map((c) => c.id));

    if (clones.length > 1) {
      dragOp = {
        mode: 'move-group',
        startX,
        startY,
        items: clones.map((s) =>
          s.type === 'line' || s.type === 'arrow'
            ? { shape: s, isLine: true, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }
            : { shape: s, isLine: false, x: s.x, y: s.y }
        ),
      };
    } else {
      const target = clones[0];
      dragOp =
        target.type === 'line' || target.type === 'arrow'
          ? {
              mode: 'move-line',
              shape: target,
              startX,
              startY,
              origX1: target.x1,
              origY1: target.y1,
              origX2: target.x2,
              origY2: target.y2,
            }
          : {
              mode: 'move-box',
              shape: target,
              startX,
              startY,
              origX: target.x,
              origY: target.y,
            };
    }
  }

  function renderBoxShape(shape) {
    const isSelected = selectedIds.has(shape.id);
    const isSingleSelected = isSelected && selectedIds.size === 1;
    const fill = shape.fillColor === 'none' ? 'transparent' : shape.fillColor;
    const stroke = shape.strokeColor === 'none' ? 'none' : shape.strokeColor;
    const strokeWidth = shape.strokeColor === 'none' ? 0 : (shape.strokeWidth || 2);
    const dashArray = strokeWidth > 0 ? getStrokeDashArray(shape.strokeStyle, strokeWidth) : '';
    const labelColor = LIGHT_FILLS.has(shape.fillColor) ? '#1a1a1a' : '#ffffff';

    const el = document.createElement('div');
    const isCropping = shape.type === 'image' && croppingShapeId === shape.id && isSingleSelected;
    el.className = `word-shape word-shape-box${isSelected ? ' is-selected' : ''}${isCropping ? ' is-cropping' : ''}`;
    el.dataset.shapeId = shape.id;
    el.setAttribute('tabindex', '0');
    el.style.left = `${shape.x}px`;
    el.style.top = `${shape.y}px`;
    el.style.width = `${shape.w}px`;
    el.style.height = `${shape.h}px`;
    el.style.transform = `rotate(${shape.rotation || 0}deg)`;

    if (shape.type === 'image') {
      const crop = shape.crop || { left: 0, top: 0, right: 0, bottom: 0 };
      const visW = Math.max(0.08, 1 - (crop.left || 0) - (crop.right || 0));
      const visH = Math.max(0.08, 1 - (crop.top || 0) - (crop.bottom || 0));

      if (isCropping) {
        const ghostEl = document.createElement('img');
        ghostEl.className = 'word-shape-image-ghost';
        ghostEl.src = shape.src || '';
        ghostEl.alt = '';
        ghostEl.draggable = false;
        ghostEl.style.width = `${(1 / visW) * 100}%`;
        ghostEl.style.height = `${(1 / visH) * 100}%`;
        ghostEl.style.left = `${-((crop.left || 0) / visW) * 100}%`;
        ghostEl.style.top = `${-((crop.top || 0) / visH) * 100}%`;
        el.appendChild(ghostEl);
      }

      const clipEl = document.createElement('div');
      clipEl.className = 'word-shape-image-clip';
      if (shape.clipShape === 'ellipse') {
        clipEl.style.borderRadius = '50%';
      } else if (shape.cornerRadius) {
        clipEl.style.borderRadius = `${shape.cornerRadius}px`;
      }
      clipEl.style.border =
        shape.strokeColor === 'none'
          ? 'none'
          : `${strokeWidth}px ${shape.strokeStyle || 'solid'} ${stroke}`;

      const imgEl = document.createElement('img');
      imgEl.className = 'word-shape-image';
      imgEl.src = shape.src || '';
      imgEl.alt = shape.alt || 'Image';
      imgEl.draggable = false;
      imgEl.style.width = `${(1 / visW) * 100}%`;
      imgEl.style.height = `${(1 / visH) * 100}%`;
      imgEl.style.left = `${-((crop.left || 0) / visW) * 100}%`;
      imgEl.style.top = `${-((crop.top || 0) / visH) * 100}%`;

      clipEl.appendChild(imgEl);
      el.appendChild(clipEl);
    } else {
      const svg = createSvgEl('svg', {
        class: 'word-shape-svg',
        viewBox: `0 0 ${shape.w} ${shape.h}`,
        width: shape.w,
        height: shape.h,
      });

      if (shape.type === 'rect') {
        const radius = Number(shape.cornerRadius) || 0;
        const rectAttrs = {
          x: 1,
          y: 1,
          width: Math.max(2, shape.w - 2),
          height: Math.max(2, shape.h - 2),
          rx: radius,
          ry: radius,
          fill,
          stroke,
          'stroke-width': strokeWidth,
        };
        if (dashArray) rectAttrs['stroke-dasharray'] = dashArray;
        svg.appendChild(createSvgEl('rect', rectAttrs));
      } else if (shape.type === 'path') {
        const isClosed = shape.closed !== false;
        const d = buildPathDataFromRings(
          shape.rings,
          shape.w,
          shape.h,
          shape.cornerRadii,
          isClosed
        );
        const pathAttrs = {
          d,
          fill: isClosed ? fill : 'none',
          'fill-rule': 'evenodd',
          stroke,
          'stroke-width': strokeWidth,
          'stroke-linejoin': 'round',
        };
        if (dashArray) pathAttrs['stroke-dasharray'] = dashArray;
        svg.appendChild(createSvgEl('path', pathAttrs));
      } else {
        const ellipseAttrs = {
          cx: shape.w / 2,
          cy: shape.h / 2,
          rx: Math.max(1, shape.w / 2 - 1.5),
          ry: Math.max(1, shape.h / 2 - 1.5),
          fill,
          stroke,
          'stroke-width': strokeWidth,
        };
        if (dashArray) ellipseAttrs['stroke-dasharray'] = dashArray;
        svg.appendChild(createSvgEl('ellipse', ellipseAttrs));
      }

      el.appendChild(svg);
    }

    if (shape.textEnabled || shape.label || shape.labelHtml) {
      const labelEl = document.createElement('div');
      labelEl.className = 'word-shape-label';
      labelEl.style.color = labelColor;
      if (shape.fontFamily) labelEl.style.fontFamily = shape.fontFamily;
      if (shape.fontSize) labelEl.style.fontSize = shape.fontSize;
      if (shape.lineHeight) labelEl.style.lineHeight = shape.lineHeight;
      if (shape.textAlign) labelEl.style.textAlign = shape.textAlign;
      if (shape.labelHtml) {
        labelEl.innerHTML = shape.labelHtml;
      } else {
        labelEl.textContent = shape.label || '';
      }
      if (editingShapeId === shape.id) {
        bindLabelEditor(shape, labelEl);
      }
      el.appendChild(labelEl);
    }

    if (isSingleSelected) {
      const rotStem = document.createElement('div');
      rotStem.className = 'shape-rotate-stem';
      el.appendChild(rotStem);

      const rotHandle = document.createElement('div');
      rotHandle.className = 'shape-rotate-handle';
      rotHandle.title = 'Rotate';
      rotHandle.dataset.handle = 'rotate';
      rotHandle.textContent = '↻';
      el.appendChild(rotHandle);

      HANDLE_DIRS.forEach((dir) => {
        const handle = document.createElement('div');
        handle.className = `shape-handle shape-handle-${dir}`;
        handle.dataset.handle = dir;
        el.appendChild(handle);
      });
    }

    el.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      el.focus();
      const handle = event.target.dataset?.handle;

      if (handle === 'rotate') {
        const rect = el.getBoundingClientRect();
        dragOp = {
          mode: 'rotate',
          shape,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
        };
      } else if (handle) {
        if (shape.type === 'image' && croppingShapeId === shape.id) {
          const crop = shape.crop || { left: 0, top: 0, right: 0, bottom: 0 };
          const visW = Math.max(0.08, 1 - (crop.left || 0) - (crop.right || 0));
          const visH = Math.max(0.08, 1 - (crop.top || 0) - (crop.bottom || 0));
          const fullW = shape.w / visW;
          const fullH = shape.h / visH;
          dragOp = {
            mode: 'crop',
            shape,
            dir: handle,
            startX: event.clientX,
            startY: event.clientY,
            orig: {
              x: shape.x,
              y: shape.y,
              w: shape.w,
              h: shape.h,
              crop: { left: crop.left || 0, top: crop.top || 0, right: crop.right || 0, bottom: crop.bottom || 0 },
              fullW,
              fullH,
              fullX: shape.x - (crop.left || 0) * fullW,
              fullY: shape.y - (crop.top || 0) * fullH,
            },
          };
        } else {
          dragOp = {
            mode: 'resize',
            shape,
            dir: handle,
            startX: event.clientX,
            startY: event.clientY,
            orig: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
          };
        }
      } else {
        handleShapeBodyMouseDown(shape, event);
      }
    });

    el.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      if (shape.type === 'path' && Array.isArray(shape.sources) && shape.sources.length >= 2) {
        enterLiveMergeEdit(shape);
      } else if (shape.textEnabled || shape.label) {
        openShapeTextEditor(shape, el);
      }
    });

    return el;
  }

  function renderLineShape(shape) {
    const isSelected = selectedIds.has(shape.id);
    const isSingleSelected = isSelected && selectedIds.size === 1;
    const stroke = shape.strokeColor === 'none' ? 'transparent' : shape.strokeColor;
    const minX = Math.min(shape.x1, shape.x2) - 16;
    const minY = Math.min(shape.y1, shape.y2) - 16;
    const width = Math.max(32, Math.abs(shape.x2 - shape.x1) + 32);
    const height = Math.max(32, Math.abs(shape.y2 - shape.y1) + 32);

    const lx1 = shape.x1 - minX;
    const ly1 = shape.y1 - minY;
    const lx2 = shape.x2 - minX;
    const ly2 = shape.y2 - minY;

    const el = document.createElement('div');
    el.className = `word-shape word-shape-line${isSelected ? ' is-selected' : ''}`;
    el.dataset.shapeId = shape.id;
    el.setAttribute('tabindex', '0');
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    const svg = createSvgEl('svg', {
      class: 'word-shape-svg',
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
    });

    const startMarker = shape.strokeColor !== 'none' ? getLineMarker(shape, 'start') : 'none';
    const endMarker = shape.strokeColor !== 'none' ? getLineMarker(shape, 'end') : 'none';

    const buildMarkerDef = (id, style) => {
      const marker = createSvgEl('marker', {
        id,
        viewBox: '0 0 10 10',
        refX: style === 'dot' ? '5' : style === 'diamond' ? '5' : '8',
        refY: '5',
        markerWidth: '6',
        markerHeight: '6',
        orient: 'auto-start-reverse',
      });
      if (style === 'arrow') {
        marker.appendChild(createSvgEl('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: stroke }));
      } else if (style === 'open') {
        marker.appendChild(
          createSvgEl('path', {
            d: 'M 1.5 1.5 L 8.5 5 L 1.5 8.5',
            fill: 'none',
            stroke,
            'stroke-width': '1.6',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          })
        );
      } else if (style === 'dot') {
        marker.appendChild(createSvgEl('circle', { cx: '5', cy: '5', r: '3.2', fill: stroke }));
      } else if (style === 'diamond') {
        marker.appendChild(
          createSvgEl('path', { d: 'M 5 1 L 9 5 L 5 9 L 1 5 z', fill: stroke })
        );
      }
      return marker;
    };

    if (startMarker !== 'none' || endMarker !== 'none') {
      const defs = createSvgEl('defs');
      if (startMarker !== 'none') {
        defs.appendChild(buildMarkerDef(`word-start-${shape.id}`, startMarker));
      }
      if (endMarker !== 'none') {
        defs.appendChild(buildMarkerDef(`word-end-${shape.id}`, endMarker));
      }
      svg.appendChild(defs);
    }

    const hitLine = createSvgEl('line', {
      x1: lx1,
      y1: ly1,
      x2: lx2,
      y2: ly2,
      stroke: 'transparent',
      'stroke-width': 14,
      class: 'word-shape-hit',
    });

    const strokeWidth = shape.strokeColor === 'none' ? 0 : (shape.strokeWidth || 2.5);
    const dashArray = strokeWidth > 0 ? getStrokeDashArray(shape.strokeStyle, strokeWidth) : '';
    const lineAttrs = {
      x1: lx1,
      y1: ly1,
      x2: lx2,
      y2: ly2,
      stroke,
      'stroke-width': strokeWidth,
      'stroke-linecap': 'round',
    };
    if (dashArray) lineAttrs['stroke-dasharray'] = dashArray;
    const visibleLine = createSvgEl('line', lineAttrs);
    if (startMarker !== 'none') {
      visibleLine.setAttribute('marker-start', `url(#word-start-${shape.id})`);
    }
    if (endMarker !== 'none') {
      visibleLine.setAttribute('marker-end', `url(#word-end-${shape.id})`);
    }

    svg.appendChild(hitLine);
    svg.appendChild(visibleLine);
    el.appendChild(svg);

    if (isSingleSelected) {
      const h1 = document.createElement('div');
      h1.className = 'shape-handle shape-endpoint';
      h1.style.left = `${lx1}px`;
      h1.style.top = `${ly1}px`;
      h1.dataset.handle = 'start';

      const h2 = document.createElement('div');
      h2.className = 'shape-handle shape-endpoint';
      h2.style.left = `${lx2}px`;
      h2.style.top = `${ly2}px`;
      h2.dataset.handle = 'end';

      el.appendChild(h1);
      el.appendChild(h2);
    }

    el.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      el.focus();
      const handle = event.target.dataset?.handle;

      if (handle === 'start' || handle === 'end') {
        dragOp = {
          mode: 'endpoint',
          shape,
          end: handle,
          startX: event.clientX,
          startY: event.clientY,
          origX: handle === 'start' ? shape.x1 : shape.x2,
          origY: handle === 'start' ? shape.y1 : shape.y2,
        };
      } else {
        handleShapeBodyMouseDown(shape, event);
      }
    });

    return el;
  }

  function getBoxSnapPoints(shape) {
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    const rad = ((shape.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const localPoints = [
      { dir: 'nw', x: shape.x, y: shape.y },
      { dir: 'n', x: cx, y: shape.y },
      { dir: 'ne', x: shape.x + shape.w, y: shape.y },
      { dir: 'e', x: shape.x + shape.w, y: cy },
      { dir: 'se', x: shape.x + shape.w, y: shape.y + shape.h },
      { dir: 's', x: cx, y: shape.y + shape.h },
      { dir: 'sw', x: shape.x, y: shape.y + shape.h },
      { dir: 'w', x: shape.x, y: cy },
    ];

    if (!rad) return localPoints;
    return localPoints.map((pt) => {
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return {
        dir: pt.dir,
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
      };
    });
  }

  function findSnapAnchor(px, py, threshold = 12, excludeShapeId = null) {
    let best = null;
    let bestDist = threshold;
    shapes.forEach((s) => {
      if (s.id === excludeShapeId) return;
      if (s.type === 'line' || s.type === 'arrow') {
        [
          { dir: 'start', x: s.x1, y: s.y1 },
          { dir: 'end', x: s.x2, y: s.y2 },
        ].forEach((pt) => {
          const dist = Math.hypot(pt.x - px, pt.y - py);
          if (dist <= bestDist) {
            bestDist = dist;
            best = { ...pt, shapeId: s.id };
          }
        });
        return;
      }
      getBoxSnapPoints(s).forEach((pt) => {
        const dist = Math.hypot(pt.x - px, pt.y - py);
        if (dist <= bestDist) {
          bestDist = dist;
          best = { ...pt, shapeId: s.id };
        }
      });
    });
    return best;
  }

  function syncAttachedLines(boxShape) {
    if (!boxShape) return;
    const points = getBoxSnapPoints(boxShape);
    const byDir = Object.fromEntries(points.map((pt) => [pt.dir, pt]));

    shapes.forEach((s) => {
      if (s.type !== 'line' && s.type !== 'arrow') return;
      if (s.startAnchor?.shapeId === boxShape.id && byDir[s.startAnchor.dir]) {
        s.x1 = Math.round(byDir[s.startAnchor.dir].x);
        s.y1 = Math.round(byDir[s.startAnchor.dir].y);
      }
      if (s.endAnchor?.shapeId === boxShape.id && byDir[s.endAnchor.dir]) {
        s.x2 = Math.round(byDir[s.endAnchor.dir].x);
        s.y2 = Math.round(byDir[s.endAnchor.dir].y);
      }
    });
  }

  function getPageSnapMetrics(centerY) {
    const docWidth = layerEl?.clientWidth || wordEl?.clientWidth || 794;
    const cs = wordEl ? getComputedStyle(wordEl) : null;
    const marginLeft = (cs && parseFloat(cs.paddingLeft)) || 96;
    const marginRight = (cs && parseFloat(cs.paddingRight)) || 96;
    const marginTop = (cs && parseFloat(cs.paddingTop)) || 96;
    const marginBottom = (cs && parseFloat(cs.paddingBottom)) || 96;
    const rootStyle = getComputedStyle(document.documentElement);
    const pageHeight = parseFloat(rootStyle.getPropertyValue('--page-height')) || 1123;
    const pageGap = parseFloat(rootStyle.getPropertyValue('--page-gap')) || 24;
    const stride = pageHeight + pageGap;
    const pageIdx = Math.max(0, Math.floor(Math.max(0, centerY) / stride));
    const pageTop = pageIdx * stride;
    return {
      docWidth,
      pageTop,
      pageHeight,
      xTargets: [marginLeft, docWidth / 2, docWidth - marginRight],
      yTargets: [pageTop + marginTop, pageTop + pageHeight / 2, pageTop + pageHeight - marginBottom],
    };
  }

  function snapBoxToPeers(shape, rawX, rawY, threshold = 10) {
    let x = rawX;
    let y = rawY;
    const guides = [];
    const peers = shapes.filter(
      (s) => s.id !== shape.id && s.type !== 'line' && s.type !== 'arrow'
    );
    const pageSnap = getPageSnapMetrics(rawY + shape.h / 2);

    const xOffsets = [0, shape.w / 2, shape.w];
    let bestDx = threshold + 1;
    let bestXGuide = null;
    peers.forEach((p) => {
      const peerXs = [p.x, p.x + p.w / 2, p.x + p.w];
      xOffsets.forEach((off) => {
        peerXs.forEach((px) => {
          const diff = px - (rawX + off);
          if (Math.abs(diff) < Math.abs(bestDx)) {
            bestDx = diff;
            bestXGuide = {
              axis: 'x',
              pos: px,
              start: Math.min(rawY, p.y) - 8,
              end: Math.max(rawY + shape.h, p.y + p.h) + 8,
            };
          }
        });
      });
    });
    xOffsets.forEach((off) => {
      pageSnap.xTargets.forEach((px) => {
        const diff = px - (rawX + off);
        if (Math.abs(diff) < Math.abs(bestDx)) {
          bestDx = diff;
          bestXGuide = {
            axis: 'x',
            pos: px,
            start: pageSnap.pageTop + 8,
            end: pageSnap.pageTop + pageSnap.pageHeight - 8,
          };
        }
      });
    });
    if (Math.abs(bestDx) <= threshold && bestXGuide) {
      x = rawX + bestDx;
      guides.push(bestXGuide);
    }

    const yOffsets = [0, shape.h / 2, shape.h];
    let bestDy = threshold + 1;
    let bestYGuide = null;
    peers.forEach((p) => {
      const peerYs = [p.y, p.y + p.h / 2, p.y + p.h];
      yOffsets.forEach((off) => {
        peerYs.forEach((py) => {
          const diff = py - (y + off);
          if (Math.abs(diff) < Math.abs(bestDy)) {
            bestDy = diff;
            bestYGuide = {
              axis: 'y',
              pos: py,
              start: Math.min(x, p.x) - 8,
              end: Math.max(x + shape.w, p.x + p.w) + 8,
            };
          }
        });
      });
    });
    yOffsets.forEach((off) => {
      pageSnap.yTargets.forEach((py) => {
        const diff = py - (y + off);
        if (Math.abs(diff) < Math.abs(bestDy)) {
          bestDy = diff;
          bestYGuide = {
            axis: 'y',
            pos: py,
            start: 8,
            end: pageSnap.docWidth - 8,
          };
        }
      });
    });
    if (Math.abs(bestDy) <= threshold && bestYGuide) {
      y = y + bestDy;
      guides.push(bestYGuide);
    }

    return { x, y, guides };
  }

  function syncWrapSpacers() {
    if (!wordEl) return;
    wordEl.querySelectorAll('.shape-wrap-spacer').forEach((el) => el.remove());

    const wrappingShapes = shapes
      .filter(
        (s) =>
          s.type !== 'line' &&
          s.type !== 'arrow' &&
          (s.wrapMode === 'square' || s.wrapMode === 'tight' || s.wrapMode === 'top-bottom')
      )
      .sort((a, b) => a.y - b.y);

    if (wrappingShapes.length === 0) return;

    const pageW = layerEl?.clientWidth || wordEl.clientWidth || 794;
    const wordStyle = window.getComputedStyle(wordEl);
    const padLeft = parseFloat(wordStyle.paddingLeft) || 0;
    const padRight = parseFloat(wordStyle.paddingRight) || 0;
    const padTop = parseFloat(wordStyle.paddingTop) || 0;

    wrappingShapes.forEach((shape) => {
      const blocks = Array.from(wordEl.children).filter(
        (c) => !c.classList.contains('shape-wrap-spacer')
      );
      const targetBlock = blocks.find((b) => b.offsetTop + b.offsetHeight > shape.y);
      const blockTop = targetBlock ? targetBlock.offsetTop : padTop;
      const topOffset = Math.max(0, Math.round(shape.y - blockTop - 4));
      const totalHeight = topOffset + Math.max(16, shape.h + 10);

      const spacer = document.createElement('div');
      spacer.className = 'shape-wrap-spacer';
      spacer.contentEditable = 'false';
      spacer.dataset.wrapFor = shape.id;

      if (shape.wrapMode === 'top-bottom') {
        spacer.style.float = 'left';
        spacer.style.width = '100%';
        spacer.style.height = `${totalHeight}px`;
        spacer.style.shapeOutside = `inset(${topOffset}px 0 0 0)`;
      } else {
        const leftSpace = Math.max(0, shape.x - padLeft);
        const rightSpace = Math.max(0, pageW - padRight - (shape.x + shape.w));
        const isLeft = leftSpace <= rightSpace;
        const spacerW = Math.max(24, (isLeft ? leftSpace : rightSpace) + shape.w + 14);
        const spacerX = isLeft ? padLeft : pageW - padRight - spacerW;

        spacer.style.float = isLeft ? 'left' : 'right';
        spacer.style.width = `${spacerW}px`;
        spacer.style.height = `${totalHeight}px`;

        if (shape.wrapMode === 'tight') {
          if (shape.type === 'ellipse') {
            const rx = Math.round(shape.w / 2 + 8);
            const ry = Math.round(shape.h / 2 + 6);
            const cx = Math.round(shape.x + shape.w / 2 - spacerX);
            const cy = Math.round(topOffset + shape.h / 2 + 4);
            spacer.style.shapeOutside = `ellipse(${rx}px ${ry}px at ${cx}px ${cy}px)`;
          } else if (shape.rotation) {
            const pts = getBoxSnapPoints(shape).filter((p) =>
              ['nw', 'ne', 'se', 'sw'].includes(p.dir)
            );
            const poly = pts
              .map((p) => `${Math.round(p.x - spacerX)}px ${Math.round(p.y - blockTop)}px`)
              .join(', ');
            spacer.style.shapeOutside = `polygon(${poly})`;
          } else {
            spacer.style.shapeOutside = `inset(${topOffset}px 0 0 0)`;
          }
        } else {
          spacer.style.shapeOutside = `inset(${topOffset}px 0 0 0)`;
        }
      }

      if (targetBlock) {
        wordEl.insertBefore(spacer, targetBlock);
      } else {
        wordEl.appendChild(spacer);
      }
    });
  }

  function render() {
    if (!layerEl) return;
    wordEl?.classList.toggle('has-shapes', shapes.length > 0);
    layerEl.innerHTML = '';
    if (behindLayerEl) behindLayerEl.innerHTML = '';

    shapes.forEach((shape) => {
      const isLine = shape.type === 'line' || shape.type === 'arrow';
      const node = isLine ? renderLineShape(shape) : renderBoxShape(shape);
      if (!isLine && shape.wrapMode === 'behind' && behindLayerEl) {
        behindLayerEl.appendChild(node);
      } else {
        layerEl.appendChild(node);
      }
    });

    syncWrapSpacers();

    if (dragOp?.mode === 'endpoint') {
      shapes.forEach((s) => {
        if (s.type === 'line' || s.type === 'arrow') return;
        getBoxSnapPoints(s).forEach((pt) => {
          const dot = document.createElement('div');
          const isMatch =
            activeSnapPoint &&
            Math.abs(activeSnapPoint.x - pt.x) < 0.5 &&
            Math.abs(activeSnapPoint.y - pt.y) < 0.5;
          dot.className = `shape-snap-dot${isMatch ? ' is-active' : ''}`;
          dot.style.left = `${pt.x}px`;
          dot.style.top = `${pt.y}px`;
          layerEl.appendChild(dot);
        });
      });
    }

    if ((dragOp?.mode === 'move-box' || dragOp?.mode === 'resize') && activeAlignGuides.length > 0) {
      activeAlignGuides.forEach((g) => {
        const line = document.createElement('div');
        if (g.axis === 'x') {
          line.className = 'shape-align-guide-x';
          line.style.left = `${g.pos}px`;
          line.style.top = `${Math.max(0, g.start)}px`;
          line.style.height = `${Math.max(0, g.end - Math.max(0, g.start))}px`;
        } else {
          line.className = 'shape-align-guide-y';
          line.style.top = `${g.pos}px`;
          line.style.left = `${Math.max(0, g.start)}px`;
          line.style.width = `${Math.max(0, g.end - Math.max(0, g.start))}px`;
        }
        layerEl.appendChild(line);
      });
    }

    if (dragOp?.mode === 'marquee') {
      const x1 = dragOp.startX;
      const y1 = dragOp.startY;
      const x2 = dragOp.curX;
      const y2 = dragOp.curY;
      const isCrossing = x2 < x1;
      const box = document.createElement('div');
      box.className = `shape-marquee-box ${isCrossing ? 'is-crossing' : 'is-window'}`;
      box.style.left = `${Math.min(x1, x2)}px`;
      box.style.top = `${Math.min(y1, y2)}px`;
      box.style.width = `${Math.abs(x2 - x1)}px`;
      box.style.height = `${Math.abs(y2 - y1)}px`;
      layerEl.appendChild(box);
    }

    const selectedBoxes = getSelectedShapes().filter(
      (s) => s.type !== 'line' && s.type !== 'arrow'
    );
    if (selectedBoxes.length >= 2 && selectedIds.size === selectedBoxes.length) {
      renderDimensionGuides(
        layerEl,
        selectedBoxes,
        sizeUnitSelectEl?.value || 'mm',
        gapRefXSelectEl?.value || 'edge',
        gapRefYSelectEl?.value || 'edge'
      );
    }

    if (selectedIds.size > 0 && !editingShapeId && !dragOp) {
      const active = document.activeElement;
      const keepToolbarFocus =
        active?.closest('#shape-mini-toolbar') || active?.closest('.format-toolbar');
      if (!keepToolbarFocus) {
        const firstId = Array.from(selectedIds)[0];
        const firstEl =
          layerEl.querySelector(`[data-shape-id="${firstId}"]`) ||
          behindLayerEl?.querySelector(`[data-shape-id="${firstId}"]`);
        firstEl?.focus({ preventScroll: true });
      }
    }
  }

  function populateSwatchGrids() {
    if (fillGridEl) {
      STANDARD_COLORS.forEach(({ name, hex }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shape-swatch-item';
        btn.title = name;
        btn.style.backgroundColor = hex;
        btn.addEventListener('click', () => setFillColor(hex));
        fillGridEl.appendChild(btn);
      });
    }
    if (borderGridEl) {
      STANDARD_COLORS.forEach(({ name, hex }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shape-swatch-item';
        btn.title = name;
        btn.style.backgroundColor = hex;
        btn.addEventListener('click', () => setBorderColor(hex));
        borderGridEl.appendChild(btn);
      });
    }
    const fillCustomInputEl = document.getElementById('shape-fill-custom-input');
    if (fillCustomInputEl) {
      fillCustomInputEl.addEventListener('input', () => setFillColor(fillCustomInputEl.value));
      fillCustomInputEl.addEventListener('change', () => closeColorPopovers());
    }
    const borderCustomInputEl = document.getElementById('shape-border-custom-input');
    if (borderCustomInputEl) {
      borderCustomInputEl.addEventListener('input', () => setBorderColor(borderCustomInputEl.value));
      borderCustomInputEl.addEventListener('change', () => closeColorPopovers());
    }
  }

  populateSwatchGrids();

  window.addEventListener('mousemove', (event) => {
    if (!dragOp) return;

    if (dragOp.mode === 'pending-ctrl') {
      if (Math.hypot(event.clientX - dragOp.startX, event.clientY - dragOp.startY) < 4) {
        return;
      }
      const sourceShapes =
        selectedIds.has(dragOp.shape.id) && selectedIds.size > 1
          ? getSelectedShapes()
          : [dragOp.shape];
      duplicateShapesForDrag(sourceShapes, dragOp.startX, dragOp.startY);
    }

    const { mode, shape } = dragOp;

    if (mode === 'move-group') {
      const dx = event.clientX - dragOp.startX;
      const dy = event.clientY - dragOp.startY;
      dragOp.items.forEach((item) => {
        if (item.isLine) {
          item.shape.x1 = Math.max(0, item.x1 + dx);
          item.shape.y1 = Math.max(0, item.y1 + dy);
          item.shape.x2 = Math.max(0, item.x2 + dx);
          item.shape.y2 = Math.max(0, item.y2 + dy);
          item.shape.startAnchor = null;
          item.shape.endAnchor = null;
        } else {
          item.shape.x = Math.max(0, item.x + dx);
          item.shape.y = Math.max(0, item.y + dy);
        }
      });
      dragOp.items.forEach((item) => {
        if (!item.isLine) syncAttachedLines(item.shape);
      });
      render();
      positionMiniBar();
    } else if (mode === 'move-box') {
      const rawX = Math.max(0, dragOp.origX + (event.clientX - dragOp.startX));
      const rawY = Math.max(0, dragOp.origY + (event.clientY - dragOp.startY));
      const snapped = snapBoxToPeers(shape, rawX, rawY);
      shape.x = snapped.x;
      shape.y = snapped.y;
      activeAlignGuides = snapped.guides;
      syncAttachedLines(shape);
      render();
      positionMiniBar(shape);
    } else if (mode === 'move-line') {
      const dx = event.clientX - dragOp.startX;
      const dy = event.clientY - dragOp.startY;
      shape.x1 = Math.max(0, dragOp.origX1 + dx);
      shape.y1 = Math.max(0, dragOp.origY1 + dy);
      shape.x2 = Math.max(0, dragOp.origX2 + dx);
      shape.y2 = Math.max(0, dragOp.origY2 + dy);
      shape.startAnchor = null;
      shape.endAnchor = null;
      render();
      positionMiniBar(shape);
    } else if (mode === 'endpoint') {
      const dx = event.clientX - dragOp.startX;
      const dy = event.clientY - dragOp.startY;
      let rawX = Math.max(0, dragOp.origX + dx);
      let rawY = Math.max(0, dragOp.origY + dy);
      const anchorX = dragOp.end === 'start' ? shape.x2 : shape.x1;
      const anchorY = dragOp.end === 'start' ? shape.y2 : shape.y1;

      if (shape.axisLock === 'h') {
        rawY = anchorY;
      } else if (shape.axisLock === 'v') {
        rawX = anchorX;
      } else if (event.shiftKey) {
        const dist = Math.hypot(rawX - anchorX, rawY - anchorY);
        const step = Math.PI / 12;
        const snappedAngle = Math.round(Math.atan2(rawY - anchorY, rawX - anchorX) / step) * step;
        rawX = Math.max(0, Math.round(anchorX + dist * Math.cos(snappedAngle)));
        rawY = Math.max(0, Math.round(anchorY + dist * Math.sin(snappedAngle)));
      } else if (Math.abs(rawY - anchorY) <= 8) {
        rawY = anchorY;
      } else if (Math.abs(rawX - anchorX) <= 8) {
        rawX = anchorX;
      }

      const snapped = findSnapAnchor(rawX, rawY, 12, shape.id);
      activeSnapPoint = snapped ? { x: snapped.x, y: snapped.y } : null;
      const finalX =
        shape.axisLock === 'v' ? anchorX : snapped ? Math.round(snapped.x) : rawX;
      const finalY =
        shape.axisLock === 'h' ? anchorY : snapped ? Math.round(snapped.y) : rawY;
      const anchorRef = snapped && !shape.axisLock ? { shapeId: snapped.shapeId, dir: snapped.dir } : null;

      if (dragOp.end === 'start') {
        shape.x1 = finalX;
        shape.y1 = finalY;
        shape.startAnchor = anchorRef;
      } else {
        shape.x2 = finalX;
        shape.y2 = finalY;
        shape.endAnchor = anchorRef;
      }
      render();
      positionMiniBar(shape);
    } else if (mode === 'rotate') {
      const angle =
        (Math.atan2(event.clientY - dragOp.cy, event.clientX - dragOp.cx) * 180) / Math.PI + 90;
      shape.rotation = event.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle);
      syncAttachedLines(shape);
      render();
      positionMiniBar(shape);
    } else if (mode === 'crop') {
      const dx = event.clientX - dragOp.startX;
      const dy = event.clientY - dragOp.startY;
      const { dir, orig } = dragOp;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      let { left, top, right, bottom } = orig.crop;

      if (dir.includes('e')) {
        const nextW = orig.w + dx;
        right = clamp((orig.fullX + orig.fullW - (orig.x + nextW)) / orig.fullW, 0, 0.92 - left);
      }
      if (dir.includes('w')) {
        left = clamp((orig.x + dx - orig.fullX) / orig.fullW, 0, 0.92 - right);
      }
      if (dir.includes('s')) {
        const nextH = orig.h + dy;
        bottom = clamp((orig.fullY + orig.fullH - (orig.y + nextH)) / orig.fullH, 0, 0.92 - top);
      }
      if (dir.includes('n')) {
        top = clamp((orig.y + dy - orig.fullY) / orig.fullH, 0, 0.92 - bottom);
      }

      shape.crop = { left, top, right, bottom };
      shape.x = Math.round(orig.fullX + left * orig.fullW);
      shape.y = Math.round(orig.fullY + top * orig.fullH);
      shape.w = Math.max(24, Math.round((1 - left - right) * orig.fullW));
      shape.h = Math.max(24, Math.round((1 - top - bottom) * orig.fullH));
      syncAttachedLines(shape);
      render();
      positionMiniBar(shape);
    } else if (mode === 'resize') {
      const dx = event.clientX - dragOp.startX;
      const dy = event.clientY - dragOp.startY;
      const { dir, orig } = dragOp;
      let { x, y, w, h } = orig;

      if (dir.includes('e')) w = Math.max(24, orig.w + dx);
      if (dir.includes('s')) h = Math.max(24, orig.h + dy);
      if (dir.includes('w')) {
        const nextW = Math.max(24, orig.w - dx);
        x = orig.x + (orig.w - nextW);
        w = nextW;
      }
      if (dir.includes('n')) {
        const nextH = Math.max(24, orig.h - dy);
        y = orig.y + (orig.h - nextH);
        h = nextH;
      }

      if (shape.type === 'image') {
        const ratio = orig.w / Math.max(1, orig.h);
        if (dir === 'n' || dir === 's') {
          w = Math.max(24, Math.round(h * ratio));
        } else {
          h = Math.max(24, Math.round(w / ratio));
          if (dir.includes('n')) {
            y = orig.y + (orig.h - h);
          }
        }
      }

      if (event.shiftKey) {
        const hasHoriz = dir.includes('e') || dir.includes('w');
        const hasVert = dir.includes('n') || dir.includes('s');
        const size = hasHoriz && hasVert ? Math.max(w, h) : hasHoriz ? w : h;
        w = size;
        h = size;
        if (dir.includes('w')) x = orig.x + (orig.w - size);
        if (dir.includes('n')) y = orig.y + (orig.h - size);
      }

      const resizeGuides = [];
      if (shape.type !== 'image' && !event.shiftKey) {
        const snapThreshold = 10;
        const pageSnap = getPageSnapMetrics(y + h / 2);
        if (dir.includes('e')) {
          const right = x + w;
          const match = pageSnap.xTargets.find((tx) => Math.abs(tx - right) <= snapThreshold);
          if (match !== undefined && match - x >= 24) {
            w = match - x;
            resizeGuides.push({
              axis: 'x',
              pos: match,
              start: pageSnap.pageTop + 8,
              end: pageSnap.pageTop + pageSnap.pageHeight - 8,
            });
          }
        } else if (dir.includes('w')) {
          const match = pageSnap.xTargets.find((tx) => Math.abs(tx - x) <= snapThreshold);
          if (match !== undefined && orig.x + orig.w - match >= 24) {
            x = match;
            w = orig.x + orig.w - match;
            resizeGuides.push({
              axis: 'x',
              pos: match,
              start: pageSnap.pageTop + 8,
              end: pageSnap.pageTop + pageSnap.pageHeight - 8,
            });
          }
        }
        if (dir.includes('s')) {
          const bottom = y + h;
          const match = pageSnap.yTargets.find((ty) => Math.abs(ty - bottom) <= snapThreshold);
          if (match !== undefined && match - y >= 24) {
            h = match - y;
            resizeGuides.push({
              axis: 'y',
              pos: match,
              start: 8,
              end: pageSnap.docWidth - 8,
            });
          }
        } else if (dir.includes('n')) {
          const match = pageSnap.yTargets.find((ty) => Math.abs(ty - y) <= snapThreshold);
          if (match !== undefined && orig.y + orig.h - match >= 24) {
            y = match;
            h = orig.y + orig.h - match;
            resizeGuides.push({
              axis: 'y',
              pos: match,
              start: 8,
              end: pageSnap.docWidth - 8,
            });
          }
        }
      }

      shape.x = x;
      shape.y = y;
      shape.w = w;
      shape.h = h;
      activeAlignGuides = resizeGuides;
      syncAttachedLines(shape);
      render();
      positionMiniBar(shape);
    } else if (mode === 'marquee') {
      const rect = layerEl?.getBoundingClientRect();
      if (!rect) return;
      dragOp.curX = event.clientX - rect.left;
      dragOp.curY = event.clientY - rect.top;
      render();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!dragOp) return;
    if (dragOp.mode === 'marquee') {
      const { startX, startY, curX, curY, additive } = dragOp;
      dragOp = null;
      const dx = Math.abs(curX - startX);
      const dy = Math.abs(curY - startY);
      if (dx < 4 && dy < 4) {
        if (!additive) selectShape(null);
        else render();
        return;
      }
      const mLeft = Math.min(startX, curX);
      const mTop = Math.min(startY, curY);
      const mRight = Math.max(startX, curX);
      const mBottom = Math.max(startY, curY);
      const isCrossing = curX < startX;

      const matchedIds = shapes
        .filter((s) => {
          const b = getShapeBounds(s);
          if (isCrossing) {
            return b.left <= mRight && b.right >= mLeft && b.top <= mBottom && b.bottom >= mTop;
          }
          return b.left >= mLeft && b.right <= mRight && b.top >= mTop && b.bottom <= mBottom;
        })
        .map((s) => s.id);

      if (additive) {
        matchedIds.forEach((id) => selectedIds.add(id));
      } else {
        selectedIds = new Set(matchedIds);
      }
      render();
      const sel = getSelectedShape();
      if (sel) updateIndicators(sel);
      else hideMiniBar();
      return;
    }
    if (dragOp.mode === 'pending-ctrl') {
      const clickedId = dragOp.shape.id;
      dragOp = null;
      selectShape(clickedId, { toggle: true });
      return;
    }
    const shouldClearOverlays =
      dragOp.mode === 'endpoint' || dragOp.mode === 'move-box' || dragOp.mode === 'resize';
    dragOp = null;
    activeSnapPoint = null;
    activeAlignGuides = [];
    if (shouldClearOverlays) render();
    onMutate?.();
  });

  if (fillBtnEl && fillPopoverEl) {
    fillBtnEl.addEventListener('click', () => {
      const willOpen = !fillPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      fillPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (borderBtnEl && borderPopoverEl) {
    borderBtnEl.addEventListener('click', () => {
      const willOpen = !borderPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      borderPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (alignBtnEl && alignPopoverEl) {
    alignBtnEl.addEventListener('click', () => {
      const willOpen = !alignPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      alignPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (endsBtnEl && endsPopoverEl) {
    endsBtnEl.addEventListener('click', () => {
      const willOpen = !endsPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      endsPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (wrapBtnEl && wrapPopoverEl) {
    wrapBtnEl.addEventListener('click', () => {
      const willOpen = !wrapPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      wrapPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (cropBtnEl) {
    cropBtnEl.addEventListener('click', () => {
      const shape = getSelectedShape();
      if (!shape || shape.type !== 'image') return;
      croppingShapeId = croppingShapeId === shape.id ? null : shape.id;
      render();
      positionMiniBar(shape);
    });
  }

  function restoreMergedSources(shape) {
    return shape.sources.map((src) => {
      if (src.type === 'line' || src.type === 'arrow') {
        const { relX1, relY1, relX2, relY2, ...rest } = src;
        return {
          ...rest,
          id: `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          x1: shape.x + relX1 * shape.w,
          y1: shape.y + relY1 * shape.h,
          x2: shape.x + relX2 * shape.w,
          y2: shape.y + relY2 * shape.h,
        };
      }
      const { relX, relY, relW, relH, ...rest } = src;
      return {
        ...rest,
        id: `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        x: shape.x + relX * shape.w,
        y: shape.y + relY * shape.h,
        w: Math.max(16, relW * shape.w),
        h: Math.max(16, relH * shape.h),
        rotation: (src.rotation || 0) + (shape.rotation || 0),
      };
    });
  }

  function performBooleanMerge(sourceList, op, template) {
    if (!Array.isArray(sourceList) || sourceList.length < 2) return null;
    const base = template || sourceList[0];
    const allLines = sourceList.every((s) => s.type === 'line' || s.type === 'arrow');
    let acc = null;

    if (allLines) {
      const merged = mergeLinesToPath(sourceList);
      if (!merged) return null;
      acc = {
        ...base,
        id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'path',
        fillColor: base.fillColor && base.fillColor !== 'none' ? base.fillColor : '#ffffff',
        x: merged.x,
        y: merged.y,
        w: merged.w,
        h: merged.h,
        rotation: 0,
        rings: merged.rings,
      };
    } else {
      acc = sourceList[0];
      for (let i = 1; i < sourceList.length; i++) {
        const merged = booleanShapes(acc, sourceList[i], op);
        if (!merged) return null;
        acc = {
          ...base,
          id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'path',
          x: merged.x,
          y: merged.y,
          w: merged.w,
          h: merged.h,
          rotation: 0,
          rings: merged.rings,
        };
      }
    }
    acc.mergeOp = op;
    acc.sources = sourceList.map((s) =>
      s.type === 'line' || s.type === 'arrow'
        ? {
            ...s,
            relX1: (s.x1 - acc.x) / Math.max(1, acc.w),
            relY1: (s.y1 - acc.y) / Math.max(1, acc.h),
            relX2: (s.x2 - acc.x) / Math.max(1, acc.w),
            relY2: (s.y2 - acc.y) / Math.max(1, acc.h),
          }
        : {
            ...s,
            relX: (s.x - acc.x) / Math.max(1, acc.w),
            relY: (s.y - acc.y) / Math.max(1, acc.h),
            relW: s.w / Math.max(1, acc.w),
            relH: s.h / Math.max(1, acc.h),
          }
    );
    return acc;
  }

  function enterLiveMergeEdit(shape) {
    if (!shape || shape.type !== 'path' || !Array.isArray(shape.sources) || shape.sources.length < 2) {
      return;
    }
    const restored = restoreMergedSources(shape);
    shapes = shapes.filter((s) => s.id !== shape.id);
    shapes.push(...restored);
    liveMergeSession = {
      sourceIds: restored.map((s) => s.id),
      op: shape.mergeOp || 'union',
      template: { ...shape },
    };
    selectedIds = new Set(liveMergeSession.sourceIds);
    render();
    if (restored[0]) positionMiniBar(restored[0]);
  }

  function commitLiveMerge() {
    if (!liveMergeSession) return false;
    const session = liveMergeSession;
    liveMergeSession = null;
    const idSet = new Set(session.sourceIds);
    const livePieces = shapes.filter((s) => idSet.has(s.id));
    if (livePieces.length < 2) return false;
    const merged = performBooleanMerge(livePieces, session.op, session.template);
    if (!merged) return false;
    shapes = shapes.filter((s) => !idSet.has(s.id));
    shapes.push(merged);
    selectShape(merged.id);
    onMutate?.();
    return true;
  }

  if (unmergeBtnEl) {
    unmergeBtnEl.addEventListener('click', () => {
      const shape = getSelectedShape();
      if (!shape || shape.type !== 'path' || !Array.isArray(shape.sources) || shape.sources.length < 2) {
        return;
      }
      const restored = restoreMergedSources(shape);
      shapes = shapes.filter((s) => s.id !== shape.id);
      shapes.push(...restored);
      selectedIds = new Set(restored.map((s) => s.id));
      render();
      if (restored[0]) positionMiniBar(restored[0]);
      onMutate?.();
    });
  }

  if (doneMergeBtnEl) {
    doneMergeBtnEl.addEventListener('click', () => {
      commitLiveMerge();
    });
  }

  if (cropToBtnEl) {
    cropToBtnEl.addEventListener('click', () => {
      const selected = getSelectedShapes();
      const imgShape = selected.find((s) => s.type === 'image');
      const maskShape = selected.find((s) => s.type === 'rect' || s.type === 'ellipse');
      if (!imgShape || !maskShape || selected.length !== 2) return;

      const ix1 = Math.max(imgShape.x, maskShape.x);
      const iy1 = Math.max(imgShape.y, maskShape.y);
      const ix2 = Math.min(imgShape.x + imgShape.w, maskShape.x + maskShape.w);
      const iy2 = Math.min(imgShape.y + imgShape.h, maskShape.y + maskShape.h);
      if (ix2 - ix1 < 16 || iy2 - iy1 < 16) return;

      const crop = imgShape.crop || { left: 0, top: 0, right: 0, bottom: 0 };
      const visW = Math.max(0.08, 1 - (crop.left || 0) - (crop.right || 0));
      const visH = Math.max(0.08, 1 - (crop.top || 0) - (crop.bottom || 0));
      const fullW = imgShape.w / visW;
      const fullH = imgShape.h / visH;
      const fullX = imgShape.x - (crop.left || 0) * fullW;
      const fullY = imgShape.y - (crop.top || 0) * fullH;

      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newLeft = clamp((ix1 - fullX) / fullW, 0, 0.92);
      const newRight = clamp((fullX + fullW - ix2) / fullW, 0, 0.92 - newLeft);
      const newTop = clamp((iy1 - fullY) / fullH, 0, 0.92);
      const newBottom = clamp((fullY + fullH - iy2) / fullH, 0, 0.92 - newTop);

      imgShape.crop = { left: newLeft, top: newTop, right: newRight, bottom: newBottom };
      imgShape.clipShape = maskShape.type === 'ellipse' ? 'ellipse' : 'rect';
      imgShape.cornerRadius = maskShape.type === 'ellipse' ? 0 : (maskShape.cornerRadius || 0);
      imgShape.x = Math.round(ix1);
      imgShape.y = Math.round(iy1);
      imgShape.w = Math.max(24, Math.round(ix2 - ix1));
      imgShape.h = Math.max(24, Math.round(iy2 - iy1));

      shapes = shapes.filter((s) => s.id !== maskShape.id);
      croppingShapeId = null;
      selectShape(imgShape.id);
      onMutate?.();
    });
  }

  if (orderBtnEl && orderPopoverEl) {
    orderBtnEl.addEventListener('click', () => {
      const willOpen = !orderPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      orderPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (cornersBtnEl && cornersPopoverEl) {
    cornersBtnEl.addEventListener('click', () => {
      const willOpen = !cornersPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      cornersPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  function formatDim(pxVal, unit) {
    const val = pxVal / (UNIT_PX[unit] || 1);
    if (unit === 'in') return Number(val.toFixed(2));
    if (unit === 'mm') return Number(val.toFixed(1));
    return Math.round(val);
  }

  function syncDimensionInputs(shape) {
    if (!shape) return;
    const unit = sizeUnitSelectEl?.value || 'mm';
    if (shape.type === 'line' || shape.type === 'arrow') {
      const len = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
      const ang = (Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1) * 180) / Math.PI;
      if (lineLenInputEl) lineLenInputEl.value = String(formatDim(len, unit));
      if (lineAngInputEl) lineAngInputEl.value = String(Number(ang.toFixed(1)));
      if (lineX1InputEl) lineX1InputEl.value = String(formatDim(shape.x1, unit));
      if (lineY1InputEl) lineY1InputEl.value = String(formatDim(shape.y1, unit));
      lineAnchorHBtnEl?.classList.toggle('is-active', shape.axisLock === 'h');
      lineAnchorVBtnEl?.classList.toggle('is-active', shape.axisLock === 'v');
      return;
    }
    if (dimWInputEl) dimWInputEl.value = String(formatDim(shape.w, unit));
    if (dimHInputEl) dimHInputEl.value = String(formatDim(shape.h, unit));
    if (dimXInputEl) dimXInputEl.value = String(formatDim(shape.x, unit));
    if (dimYInputEl) dimYInputEl.value = String(formatDim(shape.y, unit));
  }

  function applyLineDimensionChange(prop, rawVal) {
    const shape = getSelectedShape();
    if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) return;
    const unit = sizeUnitSelectEl?.value || 'mm';
    const num = parseFloat(rawVal);
    if (!Number.isFinite(num)) return;

    const len = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    const rad = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);

    if (prop === 'len') {
      const nextLen = Math.max(4, unit === 'px' ? num : num * (UNIT_PX[unit] || 1));
      shape.x2 = shape.x1 + nextLen * Math.cos(rad);
      shape.y2 = shape.y1 + nextLen * Math.sin(rad);
    } else if (prop === 'ang') {
      const nextRad = (num * Math.PI) / 180;
      shape.x2 = shape.x1 + len * Math.cos(nextRad);
      shape.y2 = shape.y1 + len * Math.sin(nextRad);
      shape.axisLock = null;
    } else if (prop === 'x1') {
      const nextX1 = Math.max(0, unit === 'px' ? num : num * (UNIT_PX[unit] || 1));
      const dx = nextX1 - shape.x1;
      shape.x1 = nextX1;
      shape.x2 += dx;
    } else if (prop === 'y1') {
      const nextY1 = Math.max(0, unit === 'px' ? num : num * (UNIT_PX[unit] || 1));
      const dy = nextY1 - shape.y1;
      shape.y1 = nextY1;
      shape.y2 += dy;
    }

    shape.startAnchor = null;
    shape.endAnchor = null;
    render();
    positionMiniBar(shape);
    syncDimensionInputs(shape);
    onMutate?.();
  }

  function applyDimensionChange(axis, rawVal) {
    const shape = getSelectedShape();
    if (!shape || shape.type === 'line' || shape.type === 'arrow') return;
    const unit = sizeUnitSelectEl?.value || 'mm';
    const num = parseFloat(rawVal);
    if (!Number.isFinite(num)) return;
    const px = unit === 'px' ? Math.round(num) : num * (UNIT_PX[unit] || 1);

    if (axis === 'w') {
      const nextW = Math.max(16, px);
      if (shape.type === 'image') {
        const ratio = shape.w / Math.max(1, shape.h);
        shape.h = Math.max(16, nextW / ratio);
      }
      shape.w = nextW;
    } else if (axis === 'h') {
      const nextH = Math.max(16, px);
      if (shape.type === 'image') {
        const ratio = shape.w / Math.max(1, shape.h);
        shape.w = Math.max(16, nextH * ratio);
      }
      shape.h = nextH;
    } else if (axis === 'x') {
      shape.x = Math.max(0, px);
    } else if (axis === 'y') {
      shape.y = Math.max(0, px);
    }

    syncAttachedLines(shape);
    render();
    syncWrapSpacers();
    positionMiniBar(shape);
    syncDimensionInputs(shape);
    onMutate?.();
  }

  if (sizeBtnEl && sizePopoverEl) {
    sizeBtnEl.addEventListener('click', () => {
      const willOpen = !sizePopoverEl.classList.contains('is-open');
      closeColorPopovers();
      if (willOpen) syncDimensionInputs(getSelectedShape());
      sizePopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  function syncSpacingInputs(selectedBoxes) {
    if (!Array.isArray(selectedBoxes) || selectedBoxes.length < 2) return;
    const unit = sizeUnitSelectEl?.value || 'mm';
    const refX = gapRefXSelectEl?.value || 'edge';
    const refY = gapRefYSelectEl?.value || 'edge';
    const { gapX, gapY } = measureBetweenShapes(selectedBoxes[0], selectedBoxes[1], refX, refY);
    if (spacingUnitLabelEl) spacingUnitLabelEl.textContent = unit;
    if (gapXInputEl) gapXInputEl.value = String(formatDimension(gapX, unit));
    if (gapYInputEl) gapYInputEl.value = String(formatDimension(gapY, unit));
  }

  function applySpacingGap(axis, rawVal) {
    const selectedBoxes = getSelectedShapes().filter(
      (s) => s.type !== 'line' && s.type !== 'arrow'
    );
    if (selectedBoxes.length < 2) return;
    const unit = sizeUnitSelectEl?.value || 'mm';
    const gapPx = parseDimensionToPx(rawVal, unit);
    if (gapPx === null) return;
    const ref = axis === 'x' ? gapRefXSelectEl?.value || 'edge' : gapRefYSelectEl?.value || 'edge';
    if (!applyRelativeGap(selectedBoxes, axis, gapPx, ref)) return;
    selectedBoxes.forEach((s) => syncAttachedLines(s));
    render();
    syncWrapSpacers();
    positionMiniBar(selectedBoxes[0]);
    syncSpacingInputs(selectedBoxes);
    onMutate?.();
  }

  [
    [lineLenInputEl, 'len'],
    [lineAngInputEl, 'ang'],
    [lineX1InputEl, 'x1'],
    [lineY1InputEl, 'y1'],
  ].forEach(([inputEl, prop]) => {
    if (!inputEl) return;
    inputEl.addEventListener('change', () => applyLineDimensionChange(prop, inputEl.value));
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyLineDimensionChange(prop, inputEl.value);
      }
    });
  });

  function toggleLineAxisLock(axis) {
    const shape = getSelectedShape();
    if (!shape || (shape.type !== 'line' && shape.type !== 'arrow')) return;
    shape.axisLock = shape.axisLock === axis ? null : axis;
    if (shape.axisLock === 'h') {
      shape.y2 = shape.y1;
      if (Math.abs(shape.x2 - shape.x1) < 4) shape.x2 = shape.x1 + 60;
    } else if (shape.axisLock === 'v') {
      shape.x2 = shape.x1;
      if (Math.abs(shape.y2 - shape.y1) < 4) shape.y2 = shape.y1 + 60;
    }
    shape.startAnchor = null;
    shape.endAnchor = null;
    render();
    positionMiniBar(shape);
    syncDimensionInputs(shape);
    onMutate?.();
  }

  lineAnchorHBtnEl?.addEventListener('click', () => toggleLineAxisLock('h'));
  lineAnchorVBtnEl?.addEventListener('click', () => toggleLineAxisLock('v'));

  if (spacingBtnEl && spacingPopoverEl) {
    spacingBtnEl.addEventListener('click', () => {
      const willOpen = !spacingPopoverEl.classList.contains('is-open');
      closeColorPopovers();
      if (willOpen) {
        syncSpacingInputs(
          getSelectedShapes().filter((s) => s.type !== 'line' && s.type !== 'arrow')
        );
      }
      spacingPopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  [gapRefXSelectEl, gapRefYSelectEl].forEach((selEl) => {
    selEl?.addEventListener('change', () => {
      syncSpacingInputs(
        getSelectedShapes().filter((s) => s.type !== 'line' && s.type !== 'arrow')
      );
      render();
    });
  });

  [
    [gapXInputEl, 'x'],
    [gapYInputEl, 'y'],
  ].forEach(([inputEl, axis]) => {
    if (!inputEl) return;
    inputEl.addEventListener('change', () => applySpacingGap(axis, inputEl.value));
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applySpacingGap(axis, inputEl.value);
      }
    });
  });

  if (sizeUnitSelectEl) {
    sizeUnitSelectEl.addEventListener('change', () => {
      syncDimensionInputs(getSelectedShape());
      syncSpacingInputs(
        getSelectedShapes().filter((s) => s.type !== 'line' && s.type !== 'arrow')
      );
      render();
    });
  }

  [
    [dimWInputEl, 'w'],
    [dimHInputEl, 'h'],
    [dimXInputEl, 'x'],
    [dimYInputEl, 'y'],
  ].forEach(([inputEl, axis]) => {
    if (!inputEl) return;
    inputEl.addEventListener('change', () => applyDimensionChange(axis, inputEl.value));
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyDimensionChange(axis, inputEl.value);
      }
    });
  });

  if (mergeBtnEl && mergePopoverEl) {
    mergeBtnEl.addEventListener('click', () => {
      const willOpen = !mergePopoverEl.classList.contains('is-open');
      closeColorPopovers();
      mergePopoverEl.classList.toggle('is-open', willOpen);
    });
  }

  if (textCheckboxEl) {
    textCheckboxEl.addEventListener('change', () => {
      const shape = getSelectedShape();
      if (!shape || shape.type === 'line' || shape.type === 'arrow') return;
      shape.textEnabled = textCheckboxEl.checked;
      if (!shape.textEnabled) {
        shape.label = '';
        shape.labelHtml = '';
        editingShapeId = null;
      }
      render();
      positionMiniBar(shape);
      onMutate?.();
      if (shape.textEnabled) {
        openShapeTextEditor(shape);
      }
    });
  }

  if (miniBarEl) {
    miniBarEl.addEventListener('mousedown', (event) => event.stopPropagation());
    miniBarEl.addEventListener('click', (event) => {
      const noFill = event.target.closest('[data-shape-fill]');
      if (noFill) {
        setFillColor(noFill.dataset.shapeFill);
        return;
      }
      const noBorder = event.target.closest('[data-shape-border]');
      if (noBorder) {
        setBorderColor(noBorder.dataset.shapeBorder);
        return;
      }
      const widthBtn = event.target.closest('[data-shape-width]');
      if (widthBtn) {
        setBorderWidth(widthBtn.dataset.shapeWidth);
        return;
      }
      const styleBtn = event.target.closest('[data-shape-style]');
      if (styleBtn) {
        setBorderStyle(styleBtn.dataset.shapeStyle);
        return;
      }
      const endBtn = event.target.closest('[data-shape-end]');
      if (endBtn) {
        setLineEndpointStyle(endBtn.dataset.shapeEnd, endBtn.dataset.endStyle);
        return;
      }
      const wrapBtn = event.target.closest('[data-shape-wrap]');
      if (wrapBtn) {
        setWrapMode(wrapBtn.dataset.shapeWrap);
        return;
      }
      const orderBtn = event.target.closest('[data-shape-order]');
      if (orderBtn) {
        reorderSelectedShapes(orderBtn.dataset.shapeOrder);
        return;
      }
      const radiusBtn = event.target.closest('[data-shape-radius]');
      if (radiusBtn) {
        const radius = Number(radiusBtn.dataset.shapeRadius) || 0;
        getSelectedShapes().forEach((s) => {
          if (s.type === 'rect' || (s.type === 'image' && s.clipShape !== 'ellipse')) {
            s.cornerRadius = radius;
          }
        });
        closeColorPopovers();
        render();
        const active = getSelectedShape();
        if (active) positionMiniBar(active);
        onMutate?.();
        return;
      }
      const mergeBtn = event.target.closest('[data-shape-merge]');
      if (mergeBtn) {
        const op = mergeBtn.dataset.shapeMerge;
        const selected = getSelectedShapes();
        const isAllBoxes = selected.every(
          (s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'path'
        );
        const isAllLines = selected.every((s) => s.type === 'line' || s.type === 'arrow');
        if (selected.length < 2 || (!isAllBoxes && !isAllLines)) return;
        const acc = performBooleanMerge(selected, op, selected[0]);
        closeColorPopovers();
        if (acc && acc.type === 'path') {
          const removeIds = new Set(selected.map((s) => s.id));
          shapes = shapes.filter((s) => !removeIds.has(s.id));
          shapes.push(acc);
          selectShape(acc.id);
          onMutate?.();
        }
        return;
      }
      const alignItem = event.target.closest('[data-shape-align]');
      if (alignItem) {
        alignSelectedShape(alignItem.dataset.shapeAlign);
        return;
      }
      if (event.target.closest('[data-shape-delete]')) {
        deleteSelected();
      }
    });
  }

  function isClickPastLineEnd(event) {
    if (event.target === wordEl) return true;
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return true;
    const textNode = range.startContainer;
    const len = textNode.textContent?.length || 0;
    if (len === 0) return true;
    const charRange = document.createRange();
    charRange.setStart(textNode, Math.max(0, len - 1));
    charRange.setEnd(textNode, len);
    const lastRect = charRange.getBoundingClientRect();
    return event.clientX > lastRect.right + 8 || event.clientY > lastRect.bottom + 4;
  }

  function findBehindShapeHit(event) {
    if (!behindLayerEl) return null;
    const rect = behindLayerEl.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    return (
      [...shapes].reverse().find((s) => {
        if (s.type === 'line' || s.type === 'arrow' || s.wrapMode !== 'behind') return false;
        if (px < s.x || px > s.x + s.w || py < s.y || py > s.y + s.h) return false;
        const nearBorder =
          px - s.x <= 10 || s.x + s.w - px <= 10 || py - s.y <= 10 || s.y + s.h - py <= 10;
        return (
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          selectedIds.has(s.id) ||
          nearBorder ||
          isClickPastLineEnd(event)
        );
      }) || null
    );
  }

  if (wordEl && behindLayerEl) {
    wordEl.addEventListener('mousemove', (event) => {
      if (dragOp) return;
      wordEl.style.cursor = findBehindShapeHit(event) ? 'move' : '';
    });

    wordEl.addEventListener('mouseleave', () => {
      wordEl.style.cursor = '';
    });

    wordEl.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const hit = findBehindShapeHit(event);
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        handleShapeBodyMouseDown(hit, event);
      }
    });
  }

  document.addEventListener('mousedown', (event) => {
    if (
      selectedIds.size > 0 &&
      !event.target.closest('.word-shape') &&
      !event.target.closest('#shape-mini-toolbar') &&
      !event.target.closest('.format-toolbar')
    ) {
      editingShapeId = null;
      selectShape(null);
    }
  });

  function copySelectedShapes() {
    const selected = getSelectedShapes();
    if (selected.length === 0) return false;
    shapeClipboard = selected.map((s) => JSON.parse(JSON.stringify(s)));
    pasteCount = 0;
    lastCopiedWasShape = true;
    return true;
  }

  function pasteShapes() {
    if (shapeClipboard.length === 0) return false;
    pasteCount += 1;
    const offset = pasteCount * 20;
    const idMap = new Map();
    const cloned = shapeClipboard.map((s) => {
      const nextId = `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      idMap.set(s.id, nextId);
      const copy = JSON.parse(JSON.stringify(s));
      copy.id = nextId;
      if (copy.type === 'line' || copy.type === 'arrow') {
        copy.x1 += offset;
        copy.y1 += offset;
        copy.x2 += offset;
        copy.y2 += offset;
      } else {
        copy.x += offset;
        copy.y += offset;
      }
      return copy;
    });

    cloned.forEach((copy) => {
      if (copy.startAnchor) {
        copy.startAnchor = idMap.has(copy.startAnchor.shapeId)
          ? { shapeId: idMap.get(copy.startAnchor.shapeId), dir: copy.startAnchor.dir }
          : null;
      }
      if (copy.endAnchor) {
        copy.endAnchor = idMap.has(copy.endAnchor.shapeId)
          ? { shapeId: idMap.get(copy.endAnchor.shapeId), dir: copy.endAnchor.dir }
          : null;
      }
      shapes.push(copy);
    });

    selectedIds = new Set(cloned.map((c) => c.id));
    render();
    positionMiniBar(cloned[0]);
    onMutate?.();
    return true;
  }

  const clearShapeClipboardFlag = (event) => {
    const target = event.target;
    if (target?.closest?.('#word-editor') || target?.closest?.('.word-shape-label')) {
      lastCopiedWasShape = false;
    }
  };
  document.addEventListener('copy', clearShapeClipboardFlag);
  document.addEventListener('cut', clearShapeClipboardFlag);

  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (active?.closest('.word-shape-label')) return;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    const isMod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const inWord = active === wordEl || wordEl.contains(active);

    if (isMod && key === 'v' && shapeClipboard.length > 0 && (selectedIds.size > 0 || lastCopiedWasShape || !inWord)) {
      event.preventDefault();
      pasteShapes();
      return;
    }

    if (selectedIds.size === 0) return;

    if (inWord) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
    }

    if (isMod && key === 'c') {
      event.preventDefault();
      copySelectedShapes();
    } else if (isMod && key === 'x') {
      event.preventDefault();
      if (copySelectedShapes()) deleteSelected();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !inWord) {
      event.preventDefault();
      deleteSelected();
    }
  });

  function clear() {
    shapes = [];
    selectedIds.clear();
    editingShapeId = null;
    hideMiniBar();
    render();
  }

  function setShapes(nextShapes) {
    shapes = Array.isArray(nextShapes) ? nextShapes.map((s) => ({ ...s })) : [];
    selectedIds.clear();
    editingShapeId = null;
    hideMiniBar();
    render();
  }

  function getActiveLabelEl() {
    const shape = getSelectedShape();
    if (!shape || shape.type === 'line' || shape.type === 'arrow') return null;
    if (!shape.textEnabled && !shape.label && !shape.labelHtml) return null;
    const shapeEl = layerEl?.querySelector(`[data-shape-id="${shape.id}"]`);
    return shapeEl?.querySelector('.word-shape-label') || null;
  }

  function syncActiveLabel() {
    const shape = getSelectedShape();
    const labelEl = getActiveLabelEl();
    if (!shape || !labelEl) return;
    syncShapeLabelFromEl(shape, labelEl);
    onMutate?.();
  }

  function applyLabelStyle(prop, value) {
    const shape = getSelectedShape();
    const labelEl = getActiveLabelEl();
    if (!shape || !labelEl) return false;
    shape[prop] = value;
    labelEl.style[prop] = value;
    onMutate?.();
    return true;
  }

  function insertImage({ src, alt = 'Image', width = 240, height = 180 }) {
    if (!src) return;
    const offset = (shapes.length % 5) * 18;
    const shape = {
      id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'image',
      src,
      alt,
      x: 100 + offset,
      y: 100 + offset,
      w: Math.max(32, Math.round(width)),
      h: Math.max(32, Math.round(height)),
      rotation: 0,
      fillColor: 'none',
      strokeColor: 'none',
      strokeWidth: 2,
      strokeStyle: 'solid',
      wrapMode: 'square',
    };
    shapes.push(shape);
    selectShape(shape.id);
    onMutate?.();
  }

  function handleShapeContextMenu(event) {
    const shapeEl = event.target.closest('.word-shape');
    if (!shapeEl) return;
    event.preventDefault();
    event.stopPropagation();
    const id = shapeEl.dataset.shapeId;
    if (id && !selectedIds.has(id)) {
      selectShape(id);
    }
    const sel = getSelectedShape();
    if (sel) {
      positionMiniBar(sel, { show: true });
    }
  }

  function startMarqueeIfEligible(event) {
    if (event.button !== 0) return;
    if (event.target.closest('.word-shape') || event.target.closest('#shape-mini-toolbar')) return;
    if (!marqueeMode && !event.altKey) return;
    const rect = layerEl?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    dragOp = {
      mode: 'marquee',
      startX,
      startY,
      curX: startX,
      curY: startY,
      additive: event.shiftKey,
    };
    render();
  }

  layerEl?.addEventListener('mousedown', startMarqueeIfEligible);
  document.querySelector('.document-container')?.addEventListener('mousedown', startMarqueeIfEligible);
  marqueeBtnEl?.addEventListener('click', toggleMarqueeMode);

  layerEl?.addEventListener('contextmenu', handleShapeContextMenu);
  behindLayerEl?.addEventListener('contextmenu', handleShapeContextMenu);

  return {
    insertShape,
    insertImage,
    setMarqueeMode,
    toggleMarqueeMode,
    deselect: () => {
      editingShapeId = null;
      croppingShapeId = null;
      if (liveMergeSession) {
        commitLiveMerge();
      }
      selectShape(null);
    },
    clear,
    getShapes: () => shapes.map((s) => ({ ...s })),
    setShapes,
    getActiveLabelEl,
    syncActiveLabel,
    applyLabelStyle,
    syncWrapSpacers,
  };
}
