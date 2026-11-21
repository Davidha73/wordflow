const MAX_HISTORY = 150;
const TYPING_PAUSE_MS = 900;

export function getSelectionOffsets(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);
  const start = startRange.toString().length;

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);
  const end = endRange.toString().length;

  return { start, end };
}

export function restoreSelectionOffsets(root, offsets) {
  if (!offsets) return;
  const { start, end } = offsets;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let charCount = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;

  let node = walker.nextNode();
  while (node) {
    const len = node.textContent.length;
    if (!startNode && charCount + len >= start) {
      startNode = node;
      startOffset = Math.max(0, start - charCount);
    }
    if (!endNode && charCount + len >= end) {
      endNode = node;
      endOffset = Math.max(0, end - charCount);
      break;
    }
    charCount += len;
    node = walker.nextNode();
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export function getCaretCharacterOffset(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    return null;
  }
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(sel.focusNode, sel.focusOffset);
  return range.toString().length;
}

export function restoreCaretCharacterOffset(root, targetOffset) {
  if (targetOffset === null || targetOffset === undefined) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let remaining = targetOffset;
  let node = walker.nextNode();

  while (node) {
    const len = node.textContent.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function createUndoHistory(initialHtml = '', initialShapes = []) {
  let stack = [{ html: initialHtml, shapesJson: JSON.stringify(initialShapes), offset: 0 }];
  let index = 0;
  let lastTimestamp = 0;
  let lastDirection = null;
  let lastEndedWithBoundary = false;

  function reset(html = '', shapes = []) {
    stack = [{ html, shapesJson: JSON.stringify(shapes), offset: 0 }];
    index = 0;
    lastTimestamp = 0;
    lastDirection = null;
    lastEndedWithBoundary = false;
  }

  function record({ html, shapes, offset = null, inputType = '', data = '', force = false }) {
    const shapesJson =
      shapes !== undefined ? JSON.stringify(shapes) : (stack[index]?.shapesJson ?? '[]');
    if (stack[index]?.html === html && stack[index]?.shapesJson === shapesJson) return;

    const now = Date.now();
    const isDelete = inputType.startsWith('delete');
    const isInsert = inputType === 'insertText';
    const direction = isDelete ? 'delete' : isInsert ? 'insert' : 'other';
    const isBoundaryChar = isInsert && /^[\s.,;:!?()[\]{}"'\-]$/.test(data || '');

    const withinPause = now - lastTimestamp <= TYPING_PAUSE_MS;
    const sameDirection = direction !== 'other' && direction === lastDirection;

    const shouldCoalesce =
      !force &&
      index > 0 &&
      withinPause &&
      sameDirection &&
      !(isInsert && lastEndedWithBoundary && !isBoundaryChar);

    if (shouldCoalesce) {
      stack[index] = { html, shapesJson, offset };
    } else {
      stack = stack.slice(0, index + 1);
      stack.push({ html, shapesJson, offset });
      if (stack.length > MAX_HISTORY) {
        stack.shift();
      } else {
        index += 1;
      }
    }

    lastTimestamp = now;
    lastDirection = direction;
    lastEndedWithBoundary = isBoundaryChar;
  }

  function canUndo() {
    return index > 0;
  }

  function canRedo() {
    return index < stack.length - 1;
  }

  function toSnapshot(entry) {
    if (!entry) return null;
    let shapes = [];
    try {
      shapes = JSON.parse(entry.shapesJson || '[]');
    } catch {
      shapes = [];
    }
    return { html: entry.html, shapes, offset: entry.offset };
  }

  function undo() {
    if (!canUndo()) return null;
    index -= 1;
    lastDirection = null;
    lastEndedWithBoundary = false;
    return toSnapshot(stack[index]);
  }

  function redo() {
    if (!canRedo()) return null;
    index += 1;
    lastDirection = null;
    lastEndedWithBoundary = false;
    return toSnapshot(stack[index]);
  }

  return {
    reset,
    record,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
