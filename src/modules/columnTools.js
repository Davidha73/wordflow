/**
 * Column layout and multi-column section insertion tools for the rich text editor.
 */
export function createColumnTools({ wordEl, onMutate }) {
  function getDocumentColumns() {
    const raw = Number(wordEl?.dataset?.columns || 1);
    return raw >= 1 && raw <= 3 ? raw : 1;
  }

  function setDocumentColumns(count) {
    if (!wordEl) return;
    const cols = Math.max(1, Math.min(3, Number(count) || 1));
    if (cols === 1) {
      delete wordEl.dataset.columns;
    } else {
      wordEl.dataset.columns = String(cols);
    }
    onMutate?.();
  }

  function insertColumnSection(count = 2) {
    if (!wordEl) return;
    const cols = Math.max(2, Math.min(3, Number(count) || 2));
    wordEl.focus({ preventScroll: true });

    const wrapper = document.createElement('div');
    wrapper.className = 'doc-columns';
    wrapper.dataset.cols = String(cols);

    let firstP = null;
    for (let i = 0; i < cols; i += 1) {
      const col = document.createElement('div');
      col.className = 'doc-col';
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      if (!firstP) firstP = p;
      col.appendChild(p);
      wrapper.appendChild(col);
    }

    const trailingP = document.createElement('p');
    trailingP.innerHTML = '<br>';

    const sel = window.getSelection();
    let inserted = false;
    if (sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)) {
      const anchorEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      const block = anchorEl?.closest('p, h1, h2, h3, h4, blockquote, pre, div');
      if (block && block !== wordEl && wordEl.contains(block)) {
        block.after(trailingP);
        block.after(wrapper);
        inserted = true;
      }
    }

    if (!inserted) {
      wordEl.appendChild(wrapper);
      wordEl.appendChild(trailingP);
    }

    if (firstP && sel) {
      const range = document.createRange();
      range.setStart(firstP, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    onMutate?.();
  }

  function getActiveColumnSection() {
    if (!wordEl) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !wordEl.contains(sel.anchorNode)) return null;
    const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    return el?.closest('.doc-columns') || null;
  }

  function removeColumnSection({ keepContent = true } = {}) {
    const section = getActiveColumnSection();
    if (!section || !wordEl?.contains(section)) return false;

    const sel = window.getSelection();
    let focusTarget = null;

    if (keepContent) {
      const fragment = document.createDocumentFragment();
      const cols = Array.from(section.querySelectorAll(':scope > .doc-col'));
      cols.forEach((col) => {
        while (col.firstChild) {
          const node = col.firstChild;
          if (!focusTarget) focusTarget = node;
          fragment.appendChild(node);
        }
      });
      if (!fragment.hasChildNodes()) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        focusTarget = p;
        fragment.appendChild(p);
      }
      section.replaceWith(fragment);
    } else {
      const nextSibling = section.nextElementSibling;
      const prevSibling = section.previousElementSibling;
      section.remove();
      focusTarget = nextSibling || prevSibling || wordEl;
    }

    if (focusTarget && sel) {
      const range = document.createRange();
      range.setStart(focusTarget, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    onMutate?.();
    return true;
  }

  return {
    getDocumentColumns,
    setDocumentColumns,
    insertColumnSection,
    getActiveColumnSection,
    removeColumnSection,
  };
}
