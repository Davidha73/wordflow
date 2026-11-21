const STORAGE_KEY = 'wordflow.toolbarLayout.v1';
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
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
  syncTopDividers();

  return {
    syncDividers: syncTopDividers,
    resetLayout: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      for (const tb of toolbars) {
        dockToolbar(tb, 'top');
      }
    },
  };
}
