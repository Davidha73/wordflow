const HIGHLIGHT_NAME = 'grammar-error';
const SPELLING_HIGHLIGHT_NAME = 'spelling-error';
const WORD_CHAR_RE = /[A-Za-z0-9_]/;
let activeEntries = [];
let underlineLayerEl = null;

function ensureUnderlineLayer(wordEl) {
  const host = wordEl?.parentElement;
  if (!host) return null;
  if (!underlineLayerEl || underlineLayerEl.parentElement !== host) {
    underlineLayerEl?.remove();
    underlineLayerEl = document.createElement('div');
    underlineLayerEl.className = 'grammar-underline-layer';
    underlineLayerEl.setAttribute('aria-hidden', 'true');
    host.appendChild(underlineLayerEl);
  }
  return underlineLayerEl;
}

function renderUnderlineOverlay(wordEl, entries) {
  const layer = ensureUnderlineLayer(wordEl);
  if (!layer) return;
  layer.innerHTML = '';
  if (!entries.length) return;

  const host = layer.parentElement;
  const zoom = parseFloat(getComputedStyle(host).zoom) || 1;
  const hostRect = host.getBoundingClientRect();
  const frag = document.createDocumentFragment();

  for (const { issue, range } of entries) {
    const rects = range.getClientRects();
    const markClass =
      issue.kind === 'Spelling' ? 'spelling-underline-mark' : 'grammar-underline-mark';
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (r.width < 1 || r.height < 1) continue;
      const mark = document.createElement('span');
      mark.className = markClass;
      mark.style.left = `${(r.left - hostRect.left) / zoom}px`;
      mark.style.top = `${(r.bottom - hostRect.top - 2) / zoom}px`;
      mark.style.width = `${r.width / zoom}px`;
      frag.appendChild(mark);
    }
  }
  layer.appendChild(frag);
}

/**
 * Clears all active grammar and spelling underlines from the CSS Custom Highlight registry.
 */
export function clearGrammarHighlights() {
  activeEntries = [];
  if (underlineLayerEl) {
    underlineLayerEl.innerHTML = '';
  }
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  CSS.highlights.delete(HIGHLIGHT_NAME);
  CSS.highlights.delete(SPELLING_HIGHLIGHT_NAME);
}

/**
 * Returns the `{ issue, range }` under `(clientX, clientY)` if the pointer is on a blue-underlined grammar span.
 */
export function getGrammarIssueAtPoint(clientX, clientY) {
  for (const entry of activeEntries) {
    const rects = entry.range.getClientRects();
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (
        clientX >= r.left - 2 &&
        clientX <= r.right + 2 &&
        clientY >= r.top - 2 &&
        clientY <= r.bottom + 4
      ) {
        return entry;
      }
    }
  }
  return null;
}

function resolveDomPoint(segments, globalOffset, isEnd = false) {
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (isEnd ? globalOffset <= seg.end : globalOffset < seg.end) {
      return { node: seg.node, offset: Math.max(0, globalOffset - seg.start) };
    }
  }
  const last = segments[segments.length - 1];
  return last ? { node: last.node, offset: last.node.textContent.length } : null;
}

function isBoundaryMatch(fullText, idx, target) {
  if (WORD_CHAR_RE.test(target[0]) && idx > 0 && WORD_CHAR_RE.test(fullText[idx - 1])) {
    return false;
  }
  const endIdx = idx + target.length;
  if (WORD_CHAR_RE.test(target[target.length - 1]) && endIdx < fullText.length && WORD_CHAR_RE.test(fullText[endIdx])) {
    return false;
  }
  return true;
}

function findBestMatchIndex(fullText, target, approxStart) {
  let bestIdx = -1;
  let bestDist = Infinity;
  let pos = 0;

  while (pos <= fullText.length - target.length) {
    const idx = fullText.indexOf(target, pos);
    if (idx < 0) break;
    if (isBoundaryMatch(fullText, idx, target)) {
      const dist = Math.abs(idx - approxStart);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }
    pos = idx + 1;
  }
  return bestIdx;
}

/**
 * Highlights grammar/style issues in `wordEl` with a blue wavy underline
 * using the CSS Custom Highlight API without mutating document HTML.
 */
export function updateGrammarHighlights(wordEl, issues) {
  if (!wordEl || !Array.isArray(issues) || issues.length === 0) {
    clearGrammarHighlights();
    return;
  }

  const segments = [];
  let fullText = '';
  const walker = document.createTreeWalker(wordEl, NodeFilter.SHOW_TEXT, null);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent ? node.textContent.length : 0;
    if (len > 0) {
      const start = fullText.length;
      fullText += node.textContent;
      segments.push({ node, start, end: fullText.length });
    }
    node = walker.nextNode();
  }

  if (segments.length === 0) {
    clearGrammarHighlights();
    return;
  }

  const nextEntries = [];
  const overlayEntries = [];
  const grammarRanges = [];
  const spellingRanges = [];
  for (const issue of issues) {
    if (!issue?.problem_text) continue;
    const target = issue.problem_text;
    const approxStart = typeof issue.start === 'number' ? issue.start : 0;
    const idx = findBestMatchIndex(fullText, target, approxStart);
    if (idx < 0) continue;

    const startPt = resolveDomPoint(segments, idx, false);
    const endPt = resolveDomPoint(segments, idx + target.length, true);
    if (startPt && endPt) {
      const range = document.createRange();
      range.setStart(startPt.node, startPt.offset);
      range.setEnd(endPt.node, endPt.offset);
      overlayEntries.push({ issue, range });
      if (issue.kind === 'Spelling') {
        spellingRanges.push(range);
      } else {
        grammarRanges.push(range);
        nextEntries.push({ issue, range });
      }
    }
  }

  activeEntries = nextEntries;
  renderUnderlineOverlay(wordEl, overlayEntries);
  if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') {
    return;
  }
  if (grammarRanges.length > 0) {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...grammarRanges));
  } else {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }
  if (spellingRanges.length > 0) {
    CSS.highlights.set(SPELLING_HIGHLIGHT_NAME, new Highlight(...spellingRanges));
  } else {
    CSS.highlights.delete(SPELLING_HIGHLIGHT_NAME);
  }
}
