/**
 * Manages Word-style inline Header & Footer editing directly on page sheets.
 */

export function createHeaderFooter({ workspaceEl, layerEl, sanitizeHtml, onChange }) {
  const barEl = document.getElementById('hf-edit-bar');
  const closeBtnEl = document.getElementById('btn-close-hf');
  const headerValignEl = document.getElementById('hf-header-valign');
  const pageNumCheckEl = document.getElementById('hf-page-numbers');
  const printCheckEl = document.getElementById('hf-print-enabled');

  let editing = false;
  let activeEl = null;
  let state = {
    headerHtml: '',
    footerHtml: '',
    headerVAlign: 'bottom',
    showPageNumbers: true,
    printEnabled: true,
  };

  function getZoneElement(zone = 'header', pageNumber = 1) {
    if (!layerEl) return null;
    const sheets = layerEl.querySelectorAll('.page-sheet');
    const sheet = sheets[Math.max(0, pageNumber - 1)] || sheets[0];
    if (!sheet) return null;
    return sheet.querySelector(
      zone === 'footer' ? '.page-sheet-footer-text' : '.page-sheet-header'
    );
  }

  function bindEditableZones() {
    if (!layerEl) return;
    layerEl.querySelectorAll('.page-sheet-header, .page-sheet-footer-text').forEach((el) => {
      el.contentEditable = editing ? 'true' : 'false';
    });
  }

  function syncFromElement(el) {
    if (!el) return;
    const isHeader = el.classList.contains('page-sheet-header');
    const clean = sanitizeHtml ? sanitizeHtml(el.innerHTML) : el.innerHTML;
    if (isHeader) {
      state.headerHtml = clean === '<br>' ? '' : clean;
      layerEl?.querySelectorAll('.page-sheet-header').forEach((other) => {
        if (other !== el) other.innerHTML = state.headerHtml;
      });
    } else {
      state.footerHtml = clean === '<br>' ? '' : clean;
      layerEl?.querySelectorAll('.page-sheet-footer-text').forEach((other) => {
        if (other !== el) other.innerHTML = state.footerHtml;
      });
    }
    onChange?.({ ...state }, { skipRender: true });
  }

  function enter(zone = 'header', pageNumber = 1) {
    editing = true;
    workspaceEl?.classList.add('is-editing-hf');
    barEl?.classList.add('is-open');
    if (headerValignEl) headerValignEl.value = state.headerVAlign || 'bottom';
    if (pageNumCheckEl) pageNumCheckEl.checked = state.showPageNumbers;
    if (printCheckEl) printCheckEl.checked = state.printEnabled;

    onChange?.({ ...state }, { isEditing: true });
    bindEditableZones();

    const target = getZoneElement(zone, pageNumber);
    if (target) {
      activeEl = target;
      target.focus();
    }
  }

  function exit() {
    if (!editing) return;
    if (activeEl) syncFromElement(activeEl);
    editing = false;
    activeEl = null;
    workspaceEl?.classList.remove('is-editing-hf');
    barEl?.classList.remove('is-open');
    bindEditableZones();
    onChange?.({ ...state }, { isEditing: false });
  }

  layerEl?.addEventListener('focusin', (e) => {
    if (!editing) return;
    const zoneEl = e.target.closest('.page-sheet-header, .page-sheet-footer-text');
    if (zoneEl) activeEl = zoneEl;
  });

  layerEl?.addEventListener('input', (e) => {
    if (!editing) return;
    const zoneEl = e.target.closest('.page-sheet-header, .page-sheet-footer-text');
    if (zoneEl) {
      activeEl = zoneEl;
      syncFromElement(zoneEl);
    }
  });

  layerEl?.addEventListener('keydown', (e) => {
    if (editing && e.key === 'Escape') {
      e.preventDefault();
      exit();
    }
  });

  closeBtnEl?.addEventListener('click', exit);
  headerValignEl?.addEventListener('change', () => {
    state.headerVAlign = headerValignEl.value || 'bottom';
    onChange?.({ ...state }, { isEditing: editing });
    bindEditableZones();
  });
  pageNumCheckEl?.addEventListener('change', () => {
    state.showPageNumbers = Boolean(pageNumCheckEl.checked);
    onChange?.({ ...state }, { isEditing: editing });
    bindEditableZones();
  });
  printCheckEl?.addEventListener('change', () => {
    state.printEnabled = Boolean(printCheckEl.checked);
    onChange?.({ ...state }, { isEditing: editing });
  });

  return {
    enter,
    exit,
    isEditing: () => editing,
    getActiveEl: () => (editing ? activeEl : null),
    syncFromDom: () => {
      if (activeEl) syncFromElement(activeEl);
    },
    bindEditableZones,
    getState: () => ({ ...state }),
    setState: (next = {}, { silent = false } = {}) => {
      state = {
        headerHtml: next.headerHtml || '',
        footerHtml: next.footerHtml || '',
        headerVAlign: next.headerVAlign || 'bottom',
        showPageNumbers: next.showPageNumbers !== false,
        printEnabled: next.printEnabled !== false,
      };
      onChange?.({ ...state }, { isEditing: editing, silent });
    },
  };
}
