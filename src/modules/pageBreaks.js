/**
 * Renders discrete page sheets with physical gaps behind the rich-text canvas
 * and pushes blocks across page boundaries so top/bottom margins are respected.
 */

export function createPageBreaks({ containerEl, wordEl, layerEl }) {
  let lastCount = 0;
  let lastHfKey = '';
  let isSyncing = false;
  let headerFooter = {
    headerHtml: '',
    footerHtml: '',
    headerVAlign: 'bottom',
    showPageNumbers: true,
    isEditing: false,
  };

  function getCssPx(el, prop, fallback) {
    const raw = getComputedStyle(el).getPropertyValue(prop);
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function getZoomScale() {
    if (!containerEl) return 1;
    const zoom = parseFloat(getComputedStyle(containerEl).zoom);
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  function clearSpacers() {
    if (!wordEl) return;
    wordEl.querySelectorAll('[data-pb-spaced]').forEach((el) => {
      el.style.paddingTop = el.dataset.pbOrigPad || '';
      delete el.dataset.pbOrigPad;
      delete el.dataset.pbSpaced;
    });
  }

  function applyPagination(pageHeight, pageGap, marginPx, zoom) {
    if (!wordEl) return 1;
    const stride = pageHeight + pageGap;
    const maxBlockHeight = pageHeight - marginPx * 2;
    const blocks = Array.from(
      wordEl.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr, .doc-page-break'
      )
    );
    let minPagesFromBreaks = 1;

    blocks.forEach((el, idx) => {
      const isPageBreak = el.classList.contains('doc-page-break');
      if (!isPageBreak && el.tagName !== 'LI' && el.parentElement?.closest('li, blockquote, pre, tr')) {
        return;
      }
      const wordRect = wordEl.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const elHeight = rect.height / zoom;
      if (!isPageBreak && (elHeight <= 0 || elHeight > maxBlockHeight)) return;

      const elTop = (rect.top - wordRect.top) / zoom;
      const elBottom = elTop + elHeight;
      const pageIndex = Math.max(0, Math.floor(elTop / stride));

      if (isPageBreak) {
        minPagesFromBreaks = Math.max(minPagesFromBreaks, pageIndex + 2);
        const nextEl = el.nextElementSibling || blocks[idx + 1];
        if (nextEl) {
          const nextRect = nextEl.getBoundingClientRect();
          const nextTop = (nextRect.top - wordRect.top) / zoom;
          const nextContentStart = (pageIndex + 1) * stride + marginPx;
          const delta = nextContentStart - nextTop;
          if (delta > 0.5) {
            const currentPad = parseFloat(getComputedStyle(nextEl).paddingTop) || 0;
            nextEl.dataset.pbOrigPad = nextEl.style.paddingTop || '';
            nextEl.dataset.pbSpaced = 'true';
            nextEl.style.paddingTop = `${currentPad + delta}px`;
          }
        }
        return;
      }

      const pageContentEnd = pageIndex * stride + pageHeight - marginPx;

      if (elBottom > pageContentEnd) {
        const nextContentStart = (pageIndex + 1) * stride + marginPx;
        const delta = nextContentStart - elTop;
        if (delta > 0.5) {
          const currentPad = parseFloat(getComputedStyle(el).paddingTop) || 0;
          el.dataset.pbOrigPad = el.style.paddingTop || '';
          el.dataset.pbSpaced = 'true';
          el.style.paddingTop = `${currentPad + delta}px`;
        }
      }
    });

    return minPagesFromBreaks;
  }

  function renderSheets(count) {
    const hfKey = `${headerFooter.headerHtml}|${headerFooter.footerHtml}|${headerFooter.headerVAlign}|${headerFooter.showPageNumbers}|${headerFooter.isEditing}`;
    if (!layerEl || (count === lastCount && hfKey === lastHfKey)) return;
    lastCount = count;
    lastHfKey = hfKey;
    layerEl.innerHTML = '';

    for (let i = 1; i <= count; i += 1) {
      const sheet = document.createElement('div');
      sheet.className = 'page-sheet';
      sheet.setAttribute('aria-hidden', 'true');

      if (headerFooter.isEditing || headerFooter.headerHtml) {
        const headerWrap = document.createElement('div');
        headerWrap.className = 'page-sheet-header-wrap';
        headerWrap.dataset.valign = headerFooter.headerVAlign || 'bottom';

        const headerEl = document.createElement('div');
        headerEl.className = 'page-sheet-header';
        headerEl.contentEditable = headerFooter.isEditing ? 'true' : 'false';
        headerEl.dataset.placeholder = 'Type header…';
        headerEl.innerHTML = headerFooter.headerHtml || '';
        headerWrap.appendChild(headerEl);

        const tag = document.createElement('span');
        tag.className = 'page-sheet-hf-tag';
        tag.textContent = 'Header';
        headerWrap.appendChild(tag);

        sheet.appendChild(headerWrap);
      }

      if (headerFooter.isEditing || headerFooter.footerHtml || headerFooter.showPageNumbers) {
        const footerWrap = document.createElement('div');
        footerWrap.className = 'page-sheet-footer-wrap';

        const tag = document.createElement('span');
        tag.className = 'page-sheet-hf-tag';
        tag.textContent = 'Footer';
        footerWrap.appendChild(tag);

        const footerEl = document.createElement('div');
        footerEl.className = 'page-sheet-footer';

        const footerTextEl = document.createElement('div');
        footerTextEl.className = 'page-sheet-footer-text';
        footerTextEl.contentEditable = headerFooter.isEditing ? 'true' : 'false';
        footerTextEl.dataset.placeholder = 'Type footer…';
        footerTextEl.innerHTML = headerFooter.footerHtml || '';
        footerEl.appendChild(footerTextEl);

        if (headerFooter.showPageNumbers) {
          const badge = document.createElement('span');
          badge.className = 'page-sheet-number';
          badge.textContent = `Page ${i} of ${count}`;
          footerEl.appendChild(badge);
        }

        footerWrap.appendChild(footerEl);
        sheet.appendChild(footerWrap);
      }

      layerEl.appendChild(sheet);
    }
  }

  function sync() {
    if (!wordEl || !containerEl || isSyncing) return;
    isSyncing = true;
    try {
      const pageHeight = getCssPx(document.documentElement, '--page-height', 1123);
      const pageGap = getCssPx(document.documentElement, '--page-gap', 24);
      const marginPx = parseFloat(getComputedStyle(wordEl).paddingTop) || 96;
      const zoom = getZoomScale();

      clearSpacers();
      const minPagesFromBreaks = applyPagination(pageHeight, pageGap, marginPx, zoom);

      const prevMinHeight = wordEl.style.minHeight;
      wordEl.style.minHeight = '0px';
      const contentHeight = wordEl.scrollHeight;
      wordEl.style.minHeight = prevMinHeight;

      const count = Math.max(
        minPagesFromBreaks,
        Math.ceil((contentHeight + pageGap) / (pageHeight + pageGap))
      );
      containerEl.style.setProperty('--page-count', String(count));
      renderSheets(count);
    } finally {
      isSyncing = false;
    }
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined' && wordEl
      ? new ResizeObserver(() => sync())
      : null;

  if (resizeObserver && wordEl) {
    resizeObserver.observe(wordEl);
  }

  return {
    sync,
    setHeaderFooter: (next = {}, opts = {}) => {
      headerFooter = {
        headerHtml: next.headerHtml || '',
        footerHtml: next.footerHtml || '',
        headerVAlign: next.headerVAlign || 'bottom',
        showPageNumbers: next.showPageNumbers !== false,
        isEditing: typeof opts.isEditing === 'boolean' ? opts.isEditing : headerFooter.isEditing,
      };
      if (!opts.skipRender) {
        renderSheets(lastCount || 1);
      }
    },
    destroy: () => resizeObserver?.disconnect(),
  };
}
