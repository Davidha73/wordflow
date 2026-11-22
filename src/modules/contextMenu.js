/**
 * Right-click icon context menu (Word-style mini toolbar) for the rich-text and source editors.
 */

import { invoke } from '@tauri-apps/api/core';
import { createIconPlaceholder, initIcons } from './icons.js';
import { getGrammarIssueAtPoint, getSpellingIssueAtPoint } from './grammarHighlights.js';

export function createContextMenu({
  wordEl,
  sourceEl,
  getMode,
  execFormatCommand,
  linkTools,
  onApplyFontFamily,
  onApplyFontSize,
  onApplyTextColor,
  onApplyHighlightColor,
  onToggleBottomBorder,
  onFindReplace,
  onRichMutate,
  onSourceMutate,
  onIgnoreGrammarIssue,
  onRefreshGrammar,
}) {
  const menuEl = document.createElement('div');
  menuEl.className = 'editor-context-menu';
  menuEl.setAttribute('role', 'toolbar');
  menuEl.setAttribute('aria-label', 'Editor context menu');
  document.body.appendChild(menuEl);

  let isOpen = false;
  let preRightClickRange = null;
  let preRightClickSourceSel = null;

  function close() {
    if (!isOpen) return;
    isOpen = false;
    menuEl.classList.remove('is-open');
    menuEl.innerHTML = '';
  }

  function createRow() {
    const row = document.createElement('div');
    row.className = 'context-menu-row';
    menuEl.appendChild(row);
    return row;
  }

  function addRowSeparator(row) {
    const sep = document.createElement('span');
    sep.className = 'context-menu-sep';
    sep.setAttribute('aria-hidden', 'true');
    row.appendChild(sep);
  }

  function addIconButton(row, { icon, title, disabled = false, danger = false, onSelect }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-icon-btn';
    if (danger) btn.classList.add('is-danger');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.disabled = disabled;
    btn.appendChild(createIconPlaceholder(icon, 'lucide-sm'));

    btn.addEventListener('click', () => {
      close();
      onSelect?.();
    });

    row.appendChild(btn);
  }

  function restoreRichRange(range) {
    wordEl.focus({ preventScroll: true });
    if (!range || !wordEl.contains(range.commonAncestorContainer)) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function writeClipboard(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      document.execCommand('copy');
    }
  }

  async function handleRichPaste(savedRange) {
    restoreRichRange(savedRange);
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        document.execCommand('insertText', false, text);
        onRichMutate?.();
      }
    } catch {
      document.execCommand('paste');
    }
  }

  async function handleSourcePaste(start, end) {
    sourceEl.focus({ preventScroll: true });
    sourceEl.setSelectionRange(start, end);
    try {
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string') {
        sourceEl.setRangeText(text, start, end, 'end');
        onSourceMutate?.();
      }
    } catch {
      document.execCommand('paste');
    }
  }

  function positionMenu(clientX, clientY) {
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    menuEl.classList.add('is-open');
    const rect = menuEl.getBoundingClientRect();
    const pad = 8;
    const gap = 10;

    let anchorTop = clientY - 14;
    let anchorBottom = clientY + 14;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const selRect = sel.getRangeAt(0).getBoundingClientRect();
      if (selRect && (selRect.height > 0 || selRect.width > 0)) {
        anchorTop = Math.min(anchorTop, selRect.top);
        anchorBottom = Math.max(anchorBottom, selRect.bottom);
      }
    }

    const left = Math.min(clientX, window.innerWidth - rect.width - pad);
    const aboveTop = anchorTop - rect.height - gap;
    const belowTop = anchorBottom + gap;
    let finalTop = aboveTop >= pad ? aboveTop : belowTop;
    if (finalTop + rect.height > window.innerHeight - pad) {
      finalTop = Math.max(pad, window.innerHeight - rect.height - pad);
    }

    menuEl.style.left = `${Math.max(pad, left)}px`;
    menuEl.style.top = `${finalTop}px`;
  }

  function addFontRow(savedRange) {
    const toolbarFontEl = document.getElementById('font-family-select');
    const toolbarSizeEl = document.getElementById('font-size-select');
    if (!toolbarFontEl && !toolbarSizeEl) return;

    const fontRow = createRow();
    fontRow.classList.add('context-menu-font-row');

    if (toolbarFontEl) {
      const fontSelect = document.createElement('select');
      fontSelect.className = 'context-menu-select context-menu-select-font';
      fontSelect.setAttribute('aria-label', 'Font Family');
      fontSelect.title = 'Font Family';
      Array.from(toolbarFontEl.options).forEach((opt) => {
        fontSelect.appendChild(opt.cloneNode(true));
      });
      fontSelect.value = toolbarFontEl.value;
      fontSelect.addEventListener('change', () => {
        restoreRichRange(savedRange);
        onApplyFontFamily?.(fontSelect.value);
        close();
      });
      fontRow.appendChild(fontSelect);
    }

    if (toolbarSizeEl) {
      const sizeSelect = document.createElement('select');
      sizeSelect.className = 'context-menu-select context-menu-select-size';
      sizeSelect.setAttribute('aria-label', 'Font Size');
      sizeSelect.title = 'Font Size';
      Array.from(toolbarSizeEl.options).forEach((opt) => {
        sizeSelect.appendChild(opt.cloneNode(true));
      });
      sizeSelect.value = toolbarSizeEl.value;
      sizeSelect.addEventListener('change', () => {
        restoreRichRange(savedRange);
        onApplyFontSize?.(sizeSelect.value);
        close();
      });
      fontRow.appendChild(sizeSelect);
    }
  }

  function buildRichMenu(event) {
    const sel = window.getSelection();
    const savedRange =
      sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)
        ? sel.getRangeAt(0).cloneRange()
        : null;
    const selectedText = savedRange ? savedRange.toString() : '';
    const hasSelection = selectedText.length > 0;
    const anchor = linkTools?.findClosestAnchor?.(event.target);

    if (hasSelection) {
      addFontRow(savedRange);
    }

    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const linkRow = createRow();
      addIconButton(linkRow, {
        icon: 'arrow-up-right',
        title: 'Open Link',
        disabled: !href,
        onSelect: () => linkTools.openUrl?.(href),
      });
      addIconButton(linkRow, {
        icon: 'pencil',
        title: 'Edit Link',
        onSelect: () => linkTools.openForAnchor?.(anchor),
      });
      addIconButton(linkRow, {
        icon: 'copy',
        title: 'Copy Link Address',
        disabled: !href,
        onSelect: () => writeClipboard(href),
      });
      addIconButton(linkRow, {
        icon: 'x',
        title: 'Remove Link',
        danger: true,
        onSelect: () => linkTools.removeAnchor?.(anchor),
      });
    }

    const fmtRow = createRow();
    addIconButton(fmtRow, {
      icon: 'bold',
      title: 'Bold (Ctrl+B)',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('bold');
      },
    });
    addIconButton(fmtRow, {
      icon: 'italic',
      title: 'Italic (Ctrl+I)',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('italic');
      },
    });
    addIconButton(fmtRow, {
      icon: 'underline',
      title: 'Underline (Ctrl+U)',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('underline');
      },
    });
    addIconButton(fmtRow, {
      icon: 'strikethrough',
      title: 'Strikethrough',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('strikeThrough');
      },
    });
    addIconButton(fmtRow, {
      icon: 'superscript',
      title: 'Superscript',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('superscript');
      },
    });
    addIconButton(fmtRow, {
      icon: 'subscript',
      title: 'Subscript',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('subscript');
      },
    });
    addColorSwatchSubmenu(fmtRow, {
      kind: 'text',
      label: 'A',
      title: 'Text Colour',
      swatches: [
        ['Auto', '#1a1a1a'],
        ['Red', '#C00000'],
        ['Blue', '#0070C0'],
        ['Green', '#00B050'],
        ['Orange', '#FFC000'],
        ['Purple', '#7030A0'],
      ],
      onPick: (hex) => {
        restoreRichRange(savedRange);
        onApplyTextColor?.(hex);
      },
    });
    addColorSwatchSubmenu(fmtRow, {
      kind: 'highlight',
      icon: 'highlighter',
      title: 'Text Highlight',
      swatches: [
        ['None', ''],
        ['Yellow', '#FEF08A'],
        ['Green', '#BBF7D0'],
        ['Cyan', '#A5F3FC'],
        ['Pink', '#FBCFE8'],
        ['Lavender', '#DDD6FE'],
      ],
      onPick: (hex) => {
        restoreRichRange(savedRange);
        onApplyHighlightColor?.(hex);
      },
    });
    addIconButton(fmtRow, {
      icon: 'remove-formatting',
      title: 'Clear Formatting',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('removeFormat');
      },
    });
    addRowSeparator(fmtRow);
    addIconButton(fmtRow, {
      icon: 'list',
      title: 'Bulleted List',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('insertUnorderedList');
      },
    });
    addIconButton(fmtRow, {
      icon: 'list-ordered',
      title: 'Numbered List',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('insertOrderedList');
      },
    });
    addRowSeparator(fmtRow);
    addIconButton(fmtRow, {
      icon: 'text-align-start',
      title: 'Align Left',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('justifyLeft');
      },
    });
    addIconButton(fmtRow, {
      icon: 'text-align-center',
      title: 'Align Center',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('justifyCenter');
      },
    });
    addIconButton(fmtRow, {
      icon: 'text-align-end',
      title: 'Align Right',
      onSelect: () => {
        restoreRichRange(savedRange);
        execFormatCommand('justifyRight');
      },
    });
    addRowSeparator(fmtRow);
    addIconButton(fmtRow, {
      icon: 'minus',
      title: 'Toggle Bottom Border Separator',
      onSelect: () => {
        restoreRichRange(savedRange);
        onToggleBottomBorder?.();
      },
    });

    const editRow = createRow();
    addIconButton(editRow, {
      icon: 'undo-2',
      title: 'Undo (Ctrl+Z)',
      onSelect: () => execFormatCommand('undo'),
    });
    addIconButton(editRow, {
      icon: 'redo-2',
      title: 'Redo (Ctrl+Y)',
      onSelect: () => execFormatCommand('redo'),
    });
    addRowSeparator(editRow);
    addIconButton(editRow, {
      icon: 'scissors',
      title: 'Cut (Ctrl+X)',
      disabled: !hasSelection,
      onSelect: async () => {
        restoreRichRange(savedRange);
        await writeClipboard(selectedText);
        document.execCommand('delete');
        onRichMutate?.();
      },
    });
    addIconButton(editRow, {
      icon: 'copy',
      title: 'Copy (Ctrl+C)',
      disabled: !hasSelection,
      onSelect: () => {
        restoreRichRange(savedRange);
        writeClipboard(selectedText);
      },
    });
    addIconButton(editRow, {
      icon: 'file-down',
      title: 'Paste (Ctrl+V)',
      onSelect: () => handleRichPaste(savedRange),
    });
    addIconButton(editRow, {
      icon: 'square',
      title: 'Select All (Ctrl+A)',
      onSelect: () => {
        wordEl.focus({ preventScroll: true });
        document.execCommand('selectAll');
      },
    });
    addRowSeparator(editRow);
    if (!anchor) {
      addIconButton(editRow, {
        icon: 'link',
        title: 'Insert Link (Ctrl+K)',
        onSelect: () => {
          restoreRichRange(savedRange);
          linkTools?.open?.();
        },
      });
    }
    addIconButton(editRow, {
      icon: 'search',
      title: 'Find & Replace (Ctrl+F)',
      onSelect: () => onFindReplace?.(),
    });
    addIconButton(editRow, {
      icon: 'send',
      title: 'Send to BoardFlow',
      disabled: !hasSelection,
      onSelect: () => {
        restoreRichRange(savedRange);
        document.getElementById('btn-send-boardflow')?.click();
      },
    });

    const grammarMatch = getGrammarIssueAtPoint(event.clientX, event.clientY);
    if (grammarMatch) {
      addGrammarSubmenu(editRow, grammarMatch);
    } else {
      const wordInfo = getWordAtPoint(event.clientX, event.clientY);
      const spellingMatch = getSpellingIssueAtPoint(event.clientX, event.clientY);
      if (wordInfo || spellingMatch) {
        addSpellingSubmenu(editRow, wordInfo, spellingMatch);
      }
    }
  }

  function addColorSwatchSubmenu(row, { kind = 'text', icon = '', label = '', title, swatches, onPick }) {
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-spelling-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-icon-btn';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');

    const inner = document.createElement('span');
    inner.className = 'color-picker-btn';
    if (icon) {
      inner.appendChild(createIconPlaceholder(icon, 'lucide-xs'));
    } else {
      const letter = document.createElement('span');
      letter.className = 'color-letter';
      letter.textContent = label;
      inner.appendChild(letter);
    }
    const bar = document.createElement('span');
    bar.className = kind === 'highlight' ? 'highlight-indicator' : 'color-indicator';
    inner.appendChild(bar);
    btn.appendChild(inner);

    const popover = document.createElement('div');
    popover.className = 'context-menu-color-popover';
    popover.setAttribute('role', 'menu');

    swatches.forEach(([name, hex]) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = hex ? 'context-menu-swatch' : 'context-menu-swatch is-none';
      sw.title = name;
      sw.setAttribute('aria-label', name);
      if (hex) sw.style.backgroundColor = hex;
      sw.addEventListener('mousedown', (e) => e.preventDefault());
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick?.(hex);
        close();
      });
      popover.appendChild(sw);
    });

    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !popover.classList.contains('is-open');
      menuEl
        .querySelectorAll('.context-menu-spelling-popover.is-open, .context-menu-color-popover.is-open')
        .forEach((p) => p.classList.remove('is-open'));
      popover.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    wrap.appendChild(btn);
    wrap.appendChild(popover);
    row.appendChild(wrap);
  }

  function addGrammarSubmenu(row, grammarMatch) {
    const { issue, range } = grammarMatch;
    addRowSeparator(row);
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-spelling-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-spelling-btn has-suggestions';
    btn.title = issue.message || 'Grammar suggestion';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.appendChild(createIconPlaceholder('sparkles', 'lucide-xs'));
    const label = document.createElement('span');
    label.textContent = 'Grammar';
    btn.appendChild(label);
    btn.appendChild(createIconPlaceholder('chevron-down', 'lucide-xs'));

    const popover = document.createElement('div');
    popover.className = 'context-menu-spelling-popover';
    popover.setAttribute('role', 'menu');

    if (issue.message) {
      const msg = document.createElement('div');
      msg.className = 'context-menu-spelling-status';
      msg.textContent = issue.message;
      popover.appendChild(msg);
    }

    (issue.suggestions || []).forEach((suggestion) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'context-menu-spelling-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = suggestion === '' ? 'Remove' : suggestion;
      item.addEventListener('mousedown', (e) => e.preventDefault());
      item.addEventListener('click', () => {
        restoreRichRange(range);
        document.execCommand('insertText', false, suggestion);
        onRichMutate?.();
        onRefreshGrammar?.();
        close();
      });
      popover.appendChild(item);
    });

    const ignoreBtn = document.createElement('button');
    ignoreBtn.type = 'button';
    ignoreBtn.className = 'context-menu-spelling-item is-secondary';
    ignoreBtn.setAttribute('role', 'menuitem');
    ignoreBtn.textContent = 'Ignore';
    ignoreBtn.addEventListener('mousedown', (e) => e.preventDefault());
    ignoreBtn.addEventListener('click', () => {
      onIgnoreGrammarIssue?.(issue);
      close();
    });
    popover.appendChild(ignoreBtn);

    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !popover.classList.contains('is-open');
      popover.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    wrap.appendChild(btn);
    wrap.appendChild(popover);
    row.appendChild(wrap);
  }

  function getWordAtPoint(clientX, clientY) {
    if (!wordEl || !document.caretRangeFromPoint) return null;
    const caretRange = document.caretRangeFromPoint(clientX, clientY);
    if (!caretRange || !wordEl.contains(caretRange.startContainer)) return null;
    const node = caretRange.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent || '';
    let start = caretRange.startOffset;
    let end = start;
    const isWordChar = (ch) => /[A-Za-z0-9'’-]/.test(ch);

    if (start > 0 && !isWordChar(text[start] || '') && isWordChar(text[start - 1] || '')) {
      start -= 1;
      end = start;
    }
    if (!isWordChar(text[start] || '')) return null;

    while (start > 0 && isWordChar(text[start - 1])) start -= 1;
    while (end < text.length && isWordChar(text[end])) end += 1;

    const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, '');
    if (!word || word.length < 2) return null;

    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);
    return { word, range: wordRange };
  }

  function addSpellingSubmenu(row, wordInfo, spellingIssue = null) {
    addRowSeparator(row);
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-spelling-wrap';

    const targetWord = spellingIssue?.issue?.problem_text || wordInfo?.word || '';
    const targetRange = spellingIssue?.range || wordInfo?.range || null;
    const issueSuggestions = Array.isArray(spellingIssue?.issue?.suggestions)
      ? spellingIssue.issue.suggestions
      : [];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-spelling-btn';
    btn.title = `Spelling suggestions for "${targetWord}"`;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.appendChild(createIconPlaceholder('sparkles', 'lucide-xs'));
    const label = document.createElement('span');
    label.textContent = 'Spelling';
    btn.appendChild(label);
    btn.appendChild(createIconPlaceholder('chevron-down', 'lucide-xs'));

    const popover = document.createElement('div');
    popover.className = 'context-menu-spelling-popover';
    popover.setAttribute('role', 'menu');
    const loadingItem = document.createElement('div');
    loadingItem.className = 'context-menu-spelling-status';
    loadingItem.textContent = 'Checking…';
    popover.appendChild(loadingItem);

    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !popover.classList.contains('is-open');
      popover.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    wrap.appendChild(btn);
    wrap.appendChild(popover);
    row.appendChild(wrap);

    invoke('check_word_spelling', { word: targetWord })
      .catch(() => [])
      .then((suggestions) => {
        if (!isOpen) return;
        popover.innerHTML = '';
        const list = Array.from(
          new Set([
            ...issueSuggestions,
            ...(Array.isArray(suggestions) ? suggestions : []),
          ])
        );
        if (list.length === 0 && !spellingIssue) {
          const okItem = document.createElement('div');
          okItem.className = 'context-menu-spelling-status';
          okItem.textContent = 'No spelling issues';
          popover.appendChild(okItem);
          return;
        }

        btn.classList.add('has-suggestions');
        list.forEach((suggestion) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'context-menu-spelling-item';
          item.setAttribute('role', 'menuitem');
          item.textContent = suggestion;
          item.addEventListener('mousedown', (e) => e.preventDefault());
          item.addEventListener('click', () => {
            restoreRichRange(targetRange);
            document.execCommand('insertText', false, suggestion);
            onRichMutate?.();
            close();
          });
          popover.appendChild(item);
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'context-menu-spelling-item is-secondary';
        addBtn.setAttribute('role', 'menuitem');
        addBtn.textContent = `Add "${targetWord}"`;
        addBtn.addEventListener('mousedown', (e) => e.preventDefault());
        addBtn.addEventListener('click', async () => {
          try {
            await invoke('add_word_to_dictionary', { word: targetWord });
            onRefreshGrammar?.();
          } catch {
            // Ignore dictionary save errors
          }
          close();
        });
        popover.appendChild(addBtn);
      });
  }

  function buildSourceMenu() {
    const start = sourceEl.selectionStart ?? 0;
    const end = sourceEl.selectionEnd ?? 0;
    const selectedText = sourceEl.value.slice(start, end);
    const hasSelection = selectedText.length > 0;

    const row = createRow();
    addIconButton(row, {
      icon: 'undo-2',
      title: 'Undo (Ctrl+Z)',
      onSelect: () => execFormatCommand('undo'),
    });
    addIconButton(row, {
      icon: 'redo-2',
      title: 'Redo (Ctrl+Y)',
      onSelect: () => execFormatCommand('redo'),
    });
    addRowSeparator(row);
    addIconButton(row, {
      icon: 'scissors',
      title: 'Cut (Ctrl+X)',
      disabled: !hasSelection,
      onSelect: async () => {
        await writeClipboard(selectedText);
        sourceEl.focus({ preventScroll: true });
        sourceEl.setRangeText('', start, end, 'start');
        onSourceMutate?.();
      },
    });
    addIconButton(row, {
      icon: 'copy',
      title: 'Copy (Ctrl+C)',
      disabled: !hasSelection,
      onSelect: () => writeClipboard(selectedText),
    });
    addIconButton(row, {
      icon: 'file-down',
      title: 'Paste (Ctrl+V)',
      onSelect: () => handleSourcePaste(start, end),
    });
    addIconButton(row, {
      icon: 'square',
      title: 'Select All (Ctrl+A)',
      onSelect: () => {
        sourceEl.focus({ preventScroll: true });
        sourceEl.select();
      },
    });
    addRowSeparator(row);
    addIconButton(row, {
      icon: 'search',
      title: 'Find & Replace (Ctrl+F)',
      onSelect: () => onFindReplace?.(),
    });
  }

  function restorePreRightClickSelection(isSource) {
    if (isSource && sourceEl) {
      if (preRightClickSourceSel) {
        sourceEl.setSelectionRange(
          preRightClickSourceSel.start,
          preRightClickSourceSel.end,
          preRightClickSourceSel.direction
        );
      }
      return;
    }
    if (!wordEl) return;
    const sel = window.getSelection();
    if (!sel) return;
    if (preRightClickRange) {
      sel.removeAllRanges();
      sel.addRange(preRightClickRange.cloneRange());
    } else if (sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)) {
      sel.removeAllRanges();
    }
  }

  function openMenu(event, isSource) {
    if (event.shiftKey) {
      close();
      return;
    }
    event.preventDefault();
    restorePreRightClickSelection(isSource);
    menuEl.innerHTML = '';
    if (isSource) {
      buildSourceMenu();
    } else if (getMode() === 'docx') {
      buildRichMenu(event);
    } else {
      return;
    }
    initIcons(menuEl);
    isOpen = true;
    positionMenu(event.clientX, event.clientY);
    requestAnimationFrame(() => restorePreRightClickSelection(isSource));
  }

  function capturePreRightClickSelection(event) {
    if (event.shiftKey) return;
    if (event.button === 2 || (event.button === 0 && event.ctrlKey)) {
      event.preventDefault();
      if (getMode() === 'docx' && wordEl) {
        const sel = window.getSelection();
        preRightClickRange =
          sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)
            ? sel.getRangeAt(0).cloneRange()
            : null;
        preRightClickSourceSel = null;
      } else if (sourceEl) {
        preRightClickSourceSel = {
          start: sourceEl.selectionStart ?? 0,
          end: sourceEl.selectionEnd ?? 0,
          direction: sourceEl.selectionDirection || 'none',
        };
        preRightClickRange = null;
      }
    } else {
      preRightClickRange = null;
      preRightClickSourceSel = null;
    }
  }

  wordEl?.addEventListener('mousedown', capturePreRightClickSelection, true);
  sourceEl?.addEventListener('mousedown', capturePreRightClickSelection, true);
  wordEl?.addEventListener('contextmenu', (event) => openMenu(event, false));
  sourceEl?.addEventListener('contextmenu', (event) => openMenu(event, true));

  document.addEventListener('mousedown', (event) => {
    if (isOpen && !menuEl.contains(event.target)) {
      close();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (isOpen && event.key === 'Escape') {
      close();
    }
  });
  window.addEventListener('blur', close);
  window.addEventListener('scroll', close, true);

  async function copySelection() {
    if (getMode() === 'docx') {
      const sel = window.getSelection();
      const text = sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode) ? sel.toString() : '';
      if (text) {
        await writeClipboard(text);
      }
      return;
    }
    const start = sourceEl.selectionStart ?? 0;
    const end = sourceEl.selectionEnd ?? 0;
    const text = sourceEl.value.slice(start, end);
    if (text) {
      await writeClipboard(text);
    }
  }

  async function pasteAtSelection() {
    if (getMode() === 'docx') {
      const sel = window.getSelection();
      const range =
        sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)
          ? sel.getRangeAt(0).cloneRange()
          : null;
      await handleRichPaste(range);
      return;
    }
    const start = sourceEl.selectionStart ?? 0;
    const end = sourceEl.selectionEnd ?? 0;
    await handleSourcePaste(start, end);
  }

  return { close, copySelection, pasteAtSelection };
}
