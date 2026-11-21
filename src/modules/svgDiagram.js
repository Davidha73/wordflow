const SVG_NS = 'http://www.w3.org/2000/svg';

const STROKE_COLORS = [
  { name: 'Black', key: 'black', hex: '#1a1a1a', fill: 'rgba(26, 26, 26, 0.06)' },
  { name: 'Blue', key: 'blue', hex: '#2563eb', fill: 'rgba(37, 99, 235, 0.08)' },
  { name: 'Red', key: 'red', hex: '#dc2626', fill: 'rgba(220, 38, 38, 0.08)' },
  { name: 'Green', key: 'green', hex: '#16a34a', fill: 'rgba(22, 163, 74, 0.08)' },
];

const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'rect', label: 'Rect' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
];

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function getSvgCoords(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const scaleX = 600 / (rect.width || 600);
  const scaleY = 260 / (rect.height || 260);
  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY),
  };
}

function createArrowDefs(svg, uid) {
  const defs = createSvgElement('defs');
  STROKE_COLORS.forEach(({ key, hex }) => {
    const marker = createSvgElement('marker', {
      id: `arrow-${uid}-${key}`,
      viewBox: '0 0 10 10',
      refX: '9',
      refY: '5',
      markerWidth: '7',
      markerHeight: '7',
      orient: 'auto-start-reverse',
    });
    const path = createSvgElement('path', {
      d: 'M 0 1 L 10 5 L 0 9 z',
      fill: hex,
    });
    marker.appendChild(path);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);
}

export function hydrateDiagramBlock(block, onMutate) {
  if (!block || block.dataset.hydrated === 'true') return;
  block.dataset.hydrated = 'true';

  const svg = block.querySelector('svg.svg-canvas');
  if (!svg) return;

  const uid = block.dataset.diagramId || Math.random().toString(36).slice(2, 8);
  block.dataset.diagramId = uid;

  if (!svg.querySelector('defs')) {
    createArrowDefs(svg, uid);
  }

  let activeTool = 'rect';
  let activeColor = STROKE_COLORS[0];
  let selectedShape = null;
  let dragState = null;

  const toolBtns = block.querySelectorAll('[data-draw-tool]');
  const colorBtns = block.querySelectorAll('[data-draw-color]');
  const deleteBlockBtn = block.querySelector('[data-draw-delete]');

  function setTool(toolId) {
    activeTool = toolId;
    toolBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.drawTool === toolId);
    });
    svg.dataset.tool = toolId;
  }

  function setColor(colorKey) {
    const found = STROKE_COLORS.find((c) => c.key === colorKey) || STROKE_COLORS[0];
    activeColor = found;
    colorBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.drawColor === found.key);
    });
    if (selectedShape) {
      const tag = selectedShape.tagName.toLowerCase();
      if (tag === 'text') {
        selectedShape.setAttribute('fill', found.hex);
      } else {
        selectedShape.setAttribute('stroke', found.hex);
        if (tag === 'rect' || tag === 'ellipse') {
          selectedShape.setAttribute('fill', found.fill);
        }
        if (selectedShape.hasAttribute('marker-end')) {
          selectedShape.setAttribute('marker-end', `url(#arrow-${uid}-${found.key})`);
        }
      }
      onMutate?.();
    }
  }

  function selectShape(shape) {
    if (selectedShape) {
      selectedShape.classList.remove('is-selected');
    }
    selectedShape = shape;
    if (selectedShape) {
      selectedShape.classList.add('is-selected');
    }
  }

  toolBtns.forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.drawTool));
  });

  colorBtns.forEach((btn) => {
    btn.addEventListener('click', () => setColor(btn.dataset.drawColor));
  });

  if (deleteBlockBtn) {
    deleteBlockBtn.addEventListener('click', () => {
      block.remove();
      onMutate?.();
    });
  }

  svg.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    block.focus();
    const pt = getSvgCoords(svg, event.clientX, event.clientY);

    if (activeTool === 'select') {
      const target = event.target;
      if (target !== svg && svg.contains(target) && !target.closest('defs')) {
        selectShape(target);
        const tag = target.tagName.toLowerCase();
        const origin = { x: pt.x, y: pt.y };
        if (tag === 'rect' || tag === 'text') {
          origin.elX = Number(target.getAttribute('x') || 0);
          origin.elY = Number(target.getAttribute('y') || 0);
        } else if (tag === 'ellipse') {
          origin.elX = Number(target.getAttribute('cx') || 0);
          origin.elY = Number(target.getAttribute('cy') || 0);
        } else if (tag === 'line') {
          origin.x1 = Number(target.getAttribute('x1') || 0);
          origin.y1 = Number(target.getAttribute('y1') || 0);
          origin.x2 = Number(target.getAttribute('x2') || 0);
          origin.y2 = Number(target.getAttribute('y2') || 0);
        }
        dragState = { mode: 'move', shape: target, tag, origin };
      } else {
        selectShape(null);
      }
      return;
    }

    selectShape(null);
    let newShape = null;

    if (activeTool === 'rect') {
      newShape = createSvgElement('rect', {
        x: pt.x,
        y: pt.y,
        width: 1,
        height: 1,
        rx: 4,
        stroke: activeColor.hex,
        'stroke-width': 2,
        fill: activeColor.fill,
      });
    } else if (activeTool === 'ellipse') {
      newShape = createSvgElement('ellipse', {
        cx: pt.x,
        cy: pt.y,
        rx: 1,
        ry: 1,
        stroke: activeColor.hex,
        'stroke-width': 2,
        fill: activeColor.fill,
      });
    } else if (activeTool === 'line' || activeTool === 'arrow') {
      newShape = createSvgElement('line', {
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        stroke: activeColor.hex,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      if (activeTool === 'arrow') {
        newShape.setAttribute('marker-end', `url(#arrow-${uid}-${activeColor.key})`);
      }
    }

    if (newShape) {
      svg.appendChild(newShape);
      dragState = { mode: 'draw', shape: newShape, tool: activeTool, start: pt };
    }
  });

  svg.addEventListener('mousemove', (event) => {
    if (!dragState) return;
    const pt = getSvgCoords(svg, event.clientX, event.clientY);

    if (dragState.mode === 'move') {
      const dx = pt.x - dragState.origin.x;
      const dy = pt.y - dragState.origin.y;
      const { shape, tag, origin } = dragState;
      if (tag === 'rect' || tag === 'text') {
        shape.setAttribute('x', origin.elX + dx);
        shape.setAttribute('y', origin.elY + dy);
      } else if (tag === 'ellipse') {
        shape.setAttribute('cx', origin.elX + dx);
        shape.setAttribute('cy', origin.elY + dy);
      } else if (tag === 'line') {
        shape.setAttribute('x1', origin.x1 + dx);
        shape.setAttribute('y1', origin.y1 + dy);
        shape.setAttribute('x2', origin.x2 + dx);
        shape.setAttribute('y2', origin.y2 + dy);
      }
      return;
    }

    const { shape, tool, start } = dragState;
    if (tool === 'rect') {
      const x = Math.min(start.x, pt.x);
      const y = Math.min(start.y, pt.y);
      const w = Math.max(4, Math.abs(pt.x - start.x));
      const h = Math.max(4, Math.abs(pt.y - start.y));
      shape.setAttribute('x', x);
      shape.setAttribute('y', y);
      shape.setAttribute('width', w);
      shape.setAttribute('height', h);
    } else if (tool === 'ellipse') {
      const cx = Math.round((start.x + pt.x) / 2);
      const cy = Math.round((start.y + pt.y) / 2);
      const rx = Math.max(4, Math.round(Math.abs(pt.x - start.x) / 2));
      const ry = Math.max(4, Math.round(Math.abs(pt.y - start.y) / 2));
      shape.setAttribute('cx', cx);
      shape.setAttribute('cy', cy);
      shape.setAttribute('rx', rx);
      shape.setAttribute('ry', ry);
    } else if (tool === 'line' || tool === 'arrow') {
      shape.setAttribute('x2', pt.x);
      shape.setAttribute('y2', pt.y);
    }
  });

  window.addEventListener('mouseup', () => {
    if (!dragState) return;
    if (dragState.mode === 'draw') {
      selectShape(dragState.shape);
    }
    dragState = null;
    onMutate?.();
  });

  svg.addEventListener('dblclick', (event) => {
    const pt = getSvgCoords(svg, event.clientX, event.clientY);
    const existingInput = block.querySelector('.svg-label-input');
    if (existingInput) existingInput.remove();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'svg-label-input';
    input.placeholder = 'Label...';
    const rect = svg.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    input.style.left = `${Math.max(8, event.clientX - blockRect.left - 40)}px`;
    input.style.top = `${Math.max(36, event.clientY - blockRect.top - 14)}px`;

    block.appendChild(input);
    input.focus();

    let committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      input.remove();
      if (val) {
        const textEl = createSvgElement('text', {
          x: pt.x,
          y: pt.y,
          fill: activeColor.hex,
          'font-family': 'Segoe UI, Arial, sans-serif',
          'font-size': '14',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
        });
        textEl.textContent = val;
        svg.appendChild(textEl);
        selectShape(textEl);
        onMutate?.();
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        input.remove();
      }
    });
    input.addEventListener('blur', commit);
  });

  block.addEventListener('keydown', (event) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedShape) {
      if (document.activeElement?.classList.contains('svg-label-input')) return;
      event.preventDefault();
      selectedShape.remove();
      selectedShape = null;
      onMutate?.();
    }
  });

  setTool('rect');
  setColor('black');
}

export function createDiagramBlockElement() {
  const uid = Math.random().toString(36).slice(2, 8);
  const block = document.createElement('div');
  block.className = 'svg-diagram-block';
  block.setAttribute('contenteditable', 'false');
  block.setAttribute('tabindex', '0');
  block.dataset.diagramId = uid;

  const bar = document.createElement('div');
  bar.className = 'svg-diagram-bar';

  const toolsGroup = document.createElement('div');
  toolsGroup.className = 'svg-bar-group';
  TOOLS.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'svg-tool-btn';
    btn.dataset.drawTool = id;
    btn.textContent = label;
    toolsGroup.appendChild(btn);
  });

  const colorsGroup = document.createElement('div');
  colorsGroup.className = 'svg-bar-group';
  STROKE_COLORS.forEach(({ name, key, hex }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'svg-color-dot';
    btn.dataset.drawColor = key;
    btn.title = name;
    btn.setAttribute('aria-label', `Stroke ${name}`);
    btn.style.backgroundColor = hex;
    colorsGroup.appendChild(btn);
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'svg-delete-btn';
  delBtn.dataset.drawDelete = 'true';
  delBtn.textContent = 'Delete Diagram';

  bar.appendChild(toolsGroup);
  bar.appendChild(colorsGroup);
  bar.appendChild(delBtn);

  const svg = createSvgElement('svg', {
    class: 'svg-canvas',
    viewBox: '0 0 600 260',
    width: '600',
    height: '260',
  });
  createArrowDefs(svg, uid);

  block.appendChild(bar);
  block.appendChild(svg);
  return block;
}

export function hydrateAllDiagrams(root, onMutate) {
  if (!root) return;
  root.querySelectorAll('.svg-diagram-block').forEach((block) => {
    block.removeAttribute('data-hydrated');
    hydrateDiagramBlock(block, onMutate);
  });
}
