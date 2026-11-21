/**
 * Find & Replace controller supporting both rich-text (#word-editor)
 * and plain-source (#source-editor) modes.
 */

export function createFindReplace({ wordEl, sourceEl, getMode, onRichMutate, onSourceMutate }) {
  const barEl = document.getElementById('find-replace-bar');
  const findInputEl = document.getElementById('find-input');
  const replaceInputEl = document.getElementById('replace-input');
  const matchCaseBtnEl = document.getElementById('btn-find-case');
  const countEl = document.getElementById('find-match-count');
  const prevBtnEl = document.getElementById('btn-find-prev');
  const nextBtnEl = document.getElementById('btn-find-next');
  const replaceBtnEl = document.getElementById('btn-replace-one');
  const replaceAllBtnEl = document.getElementById('btn-replace-all');
  const closeBtnEl = document.getElementById('btn-find-close');
  const toolbarBtnEl = document.getElementById('btn-find-replace');

  let matchCase = false;
  let matches = [];
  let activeIndex = -1;

  function isOpen() {
    return Boolean(barEl?.classList.contains('is-open'));
  }

  function updateCountLabel() {
    if (!countEl) return;
    if (!findInputEl?.value) {
      countEl.textContent = '';
    } else if (matches.length === 0) {
      countEl.textContent = '0 results';
    } else {
      countEl.textContent = `${activeIndex + 1} of ${matches.length}`;
    }
  }

  function collectRichMatches(query) {
    if (!wordEl || !query) return [];
    const results = [];
    const needle = matchCase ? query : query.toLowerCase();
    const walker = document.createTreeWalker(wordEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.parentElement) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest('.doc-page-break, .shape-wrap-spacer')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let textNode = walker.nextNode();
    while (textNode) {
      const haystack = matchCase ? textNode.nodeValue : textNode.nodeValue.toLowerCase();
      let from = 0;
      while (from <= haystack.length - needle.length) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        results.push({ node: textNode, start: idx, end: idx + query.length });
        from = idx + Math.max(1, needle.length);
      }
      textNode = walker.nextNode();
    }
    return results;
  }

  function collectSourceMatches(query) {
    if (!sourceEl || !query) return [];
    const results = [];
    const raw = sourceEl.value || '';
    const haystack = matchCase ? raw : raw.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();
    let from = 0;
    while (from <= haystack.length - needle.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      results.push({ start: idx, end: idx + query.length });
      from = idx + Math.max(1, needle.length);
    }
    return results;
  }

  function selectMatch(index) {
    if (matches.length === 0) {
      activeIndex = -1;
      updateCountLabel();
      return;
    }
    activeIndex = ((index % matches.length) + matches.length) % matches.length;
    const match = matches[activeIndex];

    if (getMode() === 'docx') {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        sel.removeAllRanges();
        sel.addRange(range);
        match.node.parentElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else if (sourceEl) {
      sourceEl.focus({ preventScroll: true });
      sourceEl.setSelectionRange(match.start, match.end);
    }
    updateCountLabel();
  }

  function refreshMatches(preserveIndex = false) {
    const query = findInputEl?.value || '';
    if (!query) {
      matches = [];
      activeIndex = -1;
      updateCountLabel();
      return;
    }

    matches = getMode() === 'docx' ? collectRichMatches(query) : collectSourceMatches(query);
    if (matches.length === 0) {
      activeIndex = -1;
      updateCountLabel();
      return;
    }
    selectMatch(preserveIndex && activeIndex >= 0 ? Math.min(activeIndex, matches.length - 1) : 0);
  }

  function replaceCurrent() {
    const query = findInputEl?.value || '';
    if (!query || matches.length === 0 || activeIndex < 0) return;
    const replacement = replaceInputEl?.value ?? '';
    const match = matches[activeIndex];

    if (getMode() === 'docx') {
      const range = document.createRange();
      range.setStart(match.node, match.start);
      range.setEnd(match.node, match.end);
      range.deleteContents();
      if (replacement) {
        range.insertNode(document.createTextNode(replacement));
      }
      wordEl.normalize();
      onRichMutate?.();
    } else if (sourceEl) {
      sourceEl.setRangeText(replacement, match.start, match.end, 'end');
      onSourceMutate?.();
    }
    refreshMatches(true);
  }

  function replaceAll() {
    const query = findInputEl?.value || '';
    if (!query) return;
    const replacement = replaceInputEl?.value ?? '';
    const currentMatches =
      getMode() === 'docx' ? collectRichMatches(query) : collectSourceMatches(query);
    if (currentMatches.length === 0) return;

    if (getMode() === 'docx') {
      for (let i = currentMatches.length - 1; i >= 0; i -= 1) {
        const m = currentMatches[i];
        const range = document.createRange();
        range.setStart(m.node, m.start);
        range.setEnd(m.node, m.end);
        range.deleteContents();
        if (replacement) {
          range.insertNode(document.createTextNode(replacement));
        }
      }
      wordEl.normalize();
      onRichMutate?.();
    } else if (sourceEl) {
      let text = sourceEl.value || '';
      for (let i = currentMatches.length - 1; i >= 0; i -= 1) {
        const m = currentMatches[i];
        text = text.slice(0, m.start) + replacement + text.slice(m.end);
      }
      sourceEl.value = text;
      onSourceMutate?.();
    }
    refreshMatches(false);
  }

  function open(focusReplace = false) {
    if (!barEl) return;
    barEl.classList.add('is-open');
    barEl.setAttribute('aria-hidden', 'false');

    if (getMode() === 'docx') {
      const selText = window.getSelection()?.toString().trim();
      if (selText && !selText.includes('\n') && findInputEl) {
        findInputEl.value = selText;
      }
    } else if (sourceEl) {
      const selText = sourceEl.value
        .slice(sourceEl.selectionStart, sourceEl.selectionEnd)
        .trim();
      if (selText && !selText.includes('\n') && findInputEl) {
        findInputEl.value = selText;
      }
    }

    refreshMatches(false);
    if (focusReplace && replaceInputEl) {
      replaceInputEl.focus();
      replaceInputEl.select();
    } else if (findInputEl) {
      findInputEl.focus();
      findInputEl.select();
    }
  }

  function close() {
    if (!barEl) return;
    barEl.classList.remove('is-open');
    barEl.setAttribute('aria-hidden', 'true');
  }

  toolbarBtnEl?.addEventListener('click', () => {
    if (isOpen()) close();
    else open(false);
  });

  closeBtnEl?.addEventListener('click', close);
  findInputEl?.addEventListener('input', () => refreshMatches(false));
  findInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      selectMatch(activeIndex + (e.shiftKey ? -1 : 1));
    } else if (e.key === 'Escape') {
      close();
    }
  });
  replaceInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceCurrent();
    } else if (e.key === 'Escape') {
      close();
    }
  });
  matchCaseBtnEl?.addEventListener('click', () => {
    matchCase = !matchCase;
    matchCaseBtnEl.classList.toggle('is-active', matchCase);
    matchCaseBtnEl.setAttribute('aria-pressed', String(matchCase));
    refreshMatches(false);
  });
  prevBtnEl?.addEventListener('click', () => selectMatch(activeIndex - 1));
  nextBtnEl?.addEventListener('click', () => selectMatch(activeIndex + 1));
  replaceBtnEl?.addEventListener('click', replaceCurrent);
  replaceAllBtnEl?.addEventListener('click', replaceAll);

  return { open, close, isOpen, refreshMatches };
}
