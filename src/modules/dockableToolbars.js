import { getSettingsSnapshot, saveSettings } from './settingsStore.js';

const DOCK_HIT_PAD = 20;
const INTERACTIVE_SELECTOR =
  'button:not(.toolbar-grip), input, select, textarea, a, label, [contenteditable="true"], .color-popover, .styles-popover, .table-popover, .shapes-popover, .link-popover, .page-menu-popover, .columns-menu-popover';

/**
 * Initialize moveable, freely reorderable, and dockable toolbars across top, left, right docks or floating mode.
 */
export function initDockableToolbars({ appShellEl }) {
  if (!appShellEl) return null;

  const docks = {
    top: document.getElementById('dock-top'),
    left: document.getElementById('dock-left'),
    right: document.getElementById('dock-right'),
  };
  const workspaceRow = appShellEl.querySelector('.workspace-row');
  const toolbars = Array.from(appShellEl.querySelectorAll('.toolbar-group[data-toolbar-id]'));

  const dropIndicatorEl = document.createElement('div');
  dropIndicatorEl.className = 'toolbar-drop-indicator';
  dropIndicatorEl.setAttribute('aria-hidden', 'true');

  for (const tb of toolbars) {
    if (!tb.querySelector('.toolbar-grip')) {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'toolbar-grip';
      grip.title = 'Drag to move, reorder, or dock (double-click to reset)';
      grip.setAttribute('aria-label', `Move ${tb.dataset.title || tb.dataset.toolbarId} toolbar`);
      grip.textContent = '⋮⋮';
      tb.prepend(grip);
    }
  }

  const removeDropIndicator = () => {
    if (dropIndicatorEl.parentElement) {
      dropIndicatorEl.parentElement.removeChild(dropIndicatorEl);
    }
  };

  const saveLayout = () => {
    const state = {};
    for (const tb of toolbars) {
      const id = tb.dataset.toolbarId;
      if (!id) continue;
      if (tb.classList.contains('is-floating')) {
        state[id] = {
          mode: 'float',
          x: Number.parseFloat(tb.style.left) || 24,
          y: Number.parseFloat(tb.style.top) || 100,
        };
      } else {
        const dockEl = tb.closest('.dock-zone');
        const siblings = dockEl
          ? Array.from(dockEl.querySelectorAll(':scope > .toolbar-group[data-toolbar-id]'))
          : [];
        state[id] = {
          mode: dockEl?.dataset.dock || 'top',
          order: siblings.indexOf(tb),
        };
      }
    }
    saveSettings({ toolbarLayout: state });
  };

  const dockToolbar = (tb, dockName, insertBeforeNode = null) => {
    const targetDock = docks[dockName] || docks.top;
    if (!targetDock) return;
    tb.classList.remove('is-floating');
    tb.style.left = '';
    tb.style.top = '';
    tb.classList.toggle('is-vertical', dockName === 'left' || dockName === 'right');
    if (insertBeforeNode && insertBeforeNode.parentElement === targetDock && insertBeforeNode !== tb) {
      targetDock.insertBefore(tb, insertBeforeNode);
    } else {
      targetDock.appendChild(tb);
    }
  };

  const floatToolbar = (tb, x, y) => {
    tb.classList.remove('is-vertical');
    tb.classList.add('is-floating');
    if (tb.parentElement !== appShellEl) {
      appShellEl.appendChild(tb);
    }
    const maxW = Math.max(120, window.innerWidth - tb.offsetWidth - 8);
    const maxH = Math.max(80, window.innerHeight - tb.offsetHeight - 8);
    const clampedX = Math.max(8, Math.min(maxW, x));
    const clampedY = Math.max(8, Math.min(maxH, y));
    tb.style.left = `${clampedX}px`;
    tb.style.top = `${clampedY}px`;
  };

  const loadLayout = () => {
    try {
      const state = getSettingsSnapshot().toolbarLayout;
      if (!state || typeof state !== 'object' || Object.keys(state).length === 0) return;
      const dockedByZone = { top: [], left: [], right: [] };

      toolbars.forEach((tb, defaultIdx) => {
        const entry = state?.[tb.dataset.toolbarId];
        if (!entry) {
          dockedByZone.top.push({ tb, order: defaultIdx });
          return;
        }
        if (entry.mode === 'float') {
          floatToolbar(tb, entry.x ?? 24, entry.y ?? 100);
        } else if (dockedByZone[entry.mode]) {
          dockedByZone[entry.mode].push({
            tb,
            order: typeof entry.order === 'number' ? entry.order : defaultIdx,
          });
        } else {
          dockedByZone.top.push({ tb, order: defaultIdx });
        }
      });

      for (const [zoneName, items] of Object.entries(dockedByZone)) {
        items.sort((a, b) => a.order - b.order);
        for (const { tb } of items) {
          dockToolbar(tb, zoneName);
        }
      }
    } catch {
      // Ignore invalid saved layout
    }
  };

  const detectDockZone = (clientX, clientY, bypassDock = false) => {
    if (bypassDock) return null;
    const wsRect = workspaceRow?.getBoundingClientRect();
    const topRect = docks.top?.getBoundingClientRect();

    if (topRect && clientY >= topRect.top && clientY <= Math.max(topRect.bottom, topRect.top + 28)) {
      return 'top';
    }
    if (wsRect && clientY >= wsRect.top && clientY <= wsRect.bottom) {
      if (clientX <= wsRect.left + DOCK_HIT_PAD) return 'left';
      if (clientX >= wsRect.right - DOCK_HIT_PAD) return 'right';
    }
    return null;
  };

  const findInsertBeforeNode = (targetDock, dockName, clientX, clientY, draggedTb) => {
    const siblings = Array.from(
      targetDock.querySelectorAll(':scope > .toolbar-group[data-toolbar-id]')
    ).filter((el) => el !== draggedTb && el.offsetParent !== null);

    if (dockName === 'left' || dockName === 'right') {
      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          return sibling;
        }
      }
      return null;
    }

    for (const sibling of siblings) {
      const rect = sibling.getBoundingClientRect();
      const onRowAbove = clientY < rect.top - 4;
      const onSameRowBefore =
        clientY >= rect.top - 4 && clientY <= rect.bottom + 4 && clientX < rect.left + rect.width / 2;
      if (onRowAbove || onSameRowBefore) {
        return sibling;
      }
    }
    return null;
  };

  const clearDropHighlights = () => {
    Object.values(docks).forEach((el) => el?.classList.remove('is-drop-target'));
    removeDropIndicator();
  };

  const syncTopDividers = () => {
    const topDock = docks.top;
    if (!topDock) return;
    const children = Array.from(topDock.children);
    const isVisibleGroup = (el) =>
      el?.classList.contains('toolbar-group') && getComputedStyle(el).display !== 'none';

    let seenGroup = false;
    let lastVisibleDivider = null;
    for (const child of children) {
      if (isVisibleGroup(child)) {
        seenGroup = true;
        lastVisibleDivider = null;
      } else if (child.classList.contains('toolbar-divider')) {
        if (!seenGroup || lastVisibleDivider) {
          child.classList.add('is-orphaned-divider');
        } else {
          child.classList.remove('is-orphaned-divider');
          lastVisibleDivider = child;
        }
      }
    }
    if (lastVisibleDivider) {
      lastVisibleDivider.classList.add('is-orphaned-divider');
    }
  };

  for (const tb of toolbars) {
    tb.addEventListener('dblclick', (e) => {
      if (e.target.closest(INTERACTIVE_SELECTOR)) return;
      e.preventDefault();
      e.stopPropagation();
      dockToolbar(tb, 'top');
      syncTopDividers();
      saveLayout();
    });

    tb.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(INTERACTIVE_SELECTOR)) return;
      e.preventDefault();
      e.stopPropagation();

      const startRect = tb.getBoundingClientRect();
      let grabOffsetX = e.clientX - startRect.left;
      let grabOffsetY = e.clientY - startRect.top;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      let hoveredDock = null;
      let insertBeforeNode = null;

      const onMove = (me) => {
        if (!dragging && Math.hypot(me.clientX - startX, me.clientY - startY) > 5) {
          dragging = true;
          tb.classList.add('is-dragging');
          document.body.classList.add('is-dragging-toolbar');
          floatToolbar(tb, startRect.left, startRect.top);
          grabOffsetX = Math.min(grabOffsetX, Math.max(16, tb.offsetWidth - 12));
          grabOffsetY = Math.min(grabOffsetY, Math.max(12, tb.offsetHeight - 8));
        }
        if (!dragging) return;

        floatToolbar(tb, me.clientX - grabOffsetX, me.clientY - grabOffsetY);
        hoveredDock = detectDockZone(me.clientX, me.clientY, me.shiftKey || me.altKey);
        clearDropHighlights();
        if (hoveredDock && docks[hoveredDock]) {
          const targetDock = docks[hoveredDock];
          targetDock.classList.add('is-drop-target');
          insertBeforeNode = findInsertBeforeNode(targetDock, hoveredDock, me.clientX, me.clientY, tb);
          if (insertBeforeNode) {
            targetDock.insertBefore(dropIndicatorEl, insertBeforeNode);
          } else {
            targetDock.appendChild(dropIndicatorEl);
          }
        } else {
          insertBeforeNode = null;
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        tb.classList.remove('is-dragging');
        document.body.classList.remove('is-dragging-toolbar');
        clearDropHighlights();
        if (dragging) {
          if (hoveredDock) {
            dockToolbar(tb, hoveredDock, insertBeforeNode);
          }
          syncTopDividers();
          saveLayout();
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  loadLayout();

  let hiddenIds = new Set(getSettingsSnapshot().toolbarHidden || []);

  const saveHidden = () => {
    saveSettings({ toolbarHidden: Array.from(hiddenIds) });
  };

  const applyHiddenState = () => {
    for (const tb of toolbars) {
      const id = tb.dataset.toolbarId;
      tb.classList.toggle('is-toolbar-hidden', Boolean(id && hiddenIds.has(id)));
    }
    syncTopDividers();
  };

  applyHiddenState();

  const ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'toolbar-context-menu';
  ctxMenuEl.setAttribute('role', 'menu');
  ctxMenuEl.setAttribute('aria-label', 'Show or hide toolbars');
  document.body.appendChild(ctxMenuEl);

  const closeCtxMenu = () => {
    ctxMenuEl.classList.remove('is-open');
    ctxMenuEl.innerHTML = '';
  };

  const isToolbarForCurrentMode = (tb) => {
    const mode = appShellEl.dataset.mode || 'docx';
    if (tb.dataset.richOnly === 'true') return mode === 'docx';
    if (tb.dataset.mdOnly === 'true') return mode === 'md';
    if (tb.dataset.htmlOnly === 'true') return mode === 'html';
    if (tb.dataset.txtOnly === 'true') return mode === 'txt';
    return true;
  };

  const openCtxMenu = (clientX, clientY) => {
    ctxMenuEl.innerHTML = '';
    const titleEl = document.createElement('div');
    titleEl.className = 'toolbar-context-title';
    titleEl.textContent = 'Toolbars';
    ctxMenuEl.appendChild(titleEl);

    const visibleForMode = toolbars.filter(isToolbarForCurrentMode);
    for (const tb of visibleForMode) {
      const id = tb.dataset.toolbarId;
      if (!id) continue;
      const labelText = tb.dataset.title || id;

      const row = document.createElement('label');
      row.className = 'toolbar-context-item';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !hiddenIds.has(id);
      chk.addEventListener('change', () => {
        if (chk.checked) {
          hiddenIds.delete(id);
        } else {
          hiddenIds.add(id);
        }
        saveHidden();
        applyHiddenState();
      });

      const span = document.createElement('span');
      span.textContent = labelText;

      row.append(chk, span);
      ctxMenuEl.appendChild(row);
    }

    const divider = document.createElement('div');
    divider.className = 'toolbar-context-divider';
    ctxMenuEl.appendChild(divider);

    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'toolbar-context-action';
    showAllBtn.textContent = 'Show All Toolbars';
    showAllBtn.addEventListener('click', () => {
      hiddenIds.clear();
      saveHidden();
      applyHiddenState();
      closeCtxMenu();
    });
    ctxMenuEl.appendChild(showAllBtn);

    ctxMenuEl.classList.add('is-open');
    const rect = ctxMenuEl.getBoundingClientRect();
    const x = Math.min(clientX, Math.max(8, window.innerWidth - rect.width - 8));
    const y = Math.min(clientY, Math.max(8, window.innerHeight - rect.height - 8));
    ctxMenuEl.style.left = `${x}px`;
    ctxMenuEl.style.top = `${y}px`;
  };

  appShellEl.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!target?.closest('.dock-zone, .toolbar-group[data-toolbar-id]')) return;
    event.preventDefault();
    openCtxMenu(event.clientX, event.clientY);
  });

  document.addEventListener('mousedown', (event) => {
    if (ctxMenuEl.classList.contains('is-open') && !ctxMenuEl.contains(event.target)) {
      closeCtxMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ctxMenuEl.classList.contains('is-open')) {
      closeCtxMenu();
    }
  });

  window.addEventListener('blur', closeCtxMenu);

  return {
    syncDividers: syncTopDividers,
    resetLayout: () => {
      hiddenIds.clear();
      for (const tb of toolbars) {
        dockToolbar(tb, 'top');
      }
      applyHiddenState();
      saveSettings({ toolbarLayout: {}, toolbarHidden: [] });
    },
  };
}
