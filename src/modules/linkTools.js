/**
 * Hyperlink insertion and editing popover for .docx rich-text mode.
 */

import { invoke } from '@tauri-apps/api/core';

function normalizeUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function openExternalUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return;
  try {
    await invoke('open_external_url', { url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function createLinkTools({ wordEl, getMode, onMutate }) {
  const wrapEl = document.getElementById('link-insert-wrap');
  const triggerBtnEl = document.getElementById('btn-insert-link');
  const popoverEl = document.getElementById('link-popover');
  const urlInputEl = document.getElementById('link-url-input');
  const textInputEl = document.getElementById('link-text-input');
  const openBtnEl = document.getElementById('btn-link-open');
  const applyBtnEl = document.getElementById('btn-link-apply');
  const removeBtnEl = document.getElementById('btn-link-remove');

  let savedRange = null;
  let editingAnchor = null;

  function close() {
    if (popoverEl) popoverEl.classList.remove('is-open');
    triggerBtnEl?.setAttribute('aria-expanded', 'false');
    savedRange = null;
    editingAnchor = null;
  }

  function findClosestAnchor(node) {
    if (!node) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const anchor = el?.closest?.('a');
    return anchor && wordEl.contains(anchor) ? anchor : null;
  }

  function open() {
    if (getMode() !== 'docx' || !popoverEl || triggerBtnEl?.disabled) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      editingAnchor = findClosestAnchor(sel.anchorNode);
    } else {
      savedRange = null;
      editingAnchor = null;
    }

    if (editingAnchor) {
      if (urlInputEl) urlInputEl.value = editingAnchor.getAttribute('href') || '';
      if (textInputEl) textInputEl.value = editingAnchor.textContent || '';
      openBtnEl?.classList.remove('is-hidden');
      removeBtnEl?.classList.remove('is-hidden');
    } else {
      if (urlInputEl) urlInputEl.value = 'https://';
      if (textInputEl) textInputEl.value = savedRange ? savedRange.toString() : '';
      openBtnEl?.classList.add('is-hidden');
      removeBtnEl?.classList.add('is-hidden');
    }

    popoverEl.classList.add('is-open');
    triggerBtnEl?.setAttribute('aria-expanded', 'true');
    urlInputEl?.focus({ preventScroll: true });
    urlInputEl?.select();
  }

  function applyLink() {
    const rawUrl = (urlInputEl?.value || '').trim();
    if (!rawUrl) {
      close();
      return;
    }
    const href = normalizeUrl(rawUrl);
    const displayText = (textInputEl?.value || '').trim() || rawUrl;

    if (editingAnchor && wordEl.contains(editingAnchor)) {
      editingAnchor.setAttribute('href', href);
      editingAnchor.textContent = displayText;
    } else {
      wordEl.focus({ preventScroll: true });
      const sel = window.getSelection();
      const anchor = document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = displayText;

      if (savedRange && wordEl.contains(savedRange.commonAncestorContainer)) {
        savedRange.deleteContents();
        savedRange.insertNode(anchor);
        if (sel) {
          const nextRange = document.createRange();
          nextRange.setStartAfter(anchor);
          nextRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nextRange);
        }
      } else {
        const p = document.createElement('p');
        p.appendChild(anchor);
        wordEl.appendChild(p);
      }
    }

    onMutate?.();
    close();
  }

  function openForAnchor(anchor) {
    if (getMode() !== 'docx' || !popoverEl || triggerBtnEl?.disabled || !anchor) return;
    savedRange = null;
    editingAnchor = anchor;
    if (urlInputEl) urlInputEl.value = editingAnchor.getAttribute('href') || '';
    if (textInputEl) textInputEl.value = editingAnchor.textContent || '';
    openBtnEl?.classList.remove('is-hidden');
    removeBtnEl?.classList.remove('is-hidden');
    popoverEl.classList.add('is-open');
    triggerBtnEl?.setAttribute('aria-expanded', 'true');
    urlInputEl?.focus({ preventScroll: true });
    urlInputEl?.select();
  }

  function removeAnchor(anchor) {
    if (anchor && wordEl.contains(anchor)) {
      const textNode = document.createTextNode(anchor.textContent || '');
      anchor.replaceWith(textNode);
      wordEl.normalize();
      onMutate?.();
    }
    close();
  }

  function removeLink() {
    removeAnchor(editingAnchor);
  }

  triggerBtnEl?.addEventListener('click', () => {
    if (popoverEl?.classList.contains('is-open')) close();
    else open();
  });

  openBtnEl?.addEventListener('click', () => {
    const targetUrl = (urlInputEl?.value || '').trim() || editingAnchor?.getAttribute('href') || '';
    if (targetUrl) {
      openExternalUrl(targetUrl);
    }
  });
  applyBtnEl?.addEventListener('click', applyLink);
  removeBtnEl?.addEventListener('click', removeLink);

  wordEl?.addEventListener('click', (e) => {
    if (getMode() !== 'docx' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const anchor = findClosestAnchor(e.target);
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    openExternalUrl(href);
  });

  [urlInputEl, textInputEl].forEach((input) => {
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyLink();
      } else if (e.key === 'Escape') {
        close();
      }
    });
  });

  document.addEventListener('mousedown', (e) => {
    if (wrapEl && !wrapEl.contains(e.target)) {
      close();
    }
  });

  return {
    open,
    close,
    findClosestAnchor,
    openForAnchor,
    removeAnchor,
    openUrl: openExternalUrl,
  };
}
