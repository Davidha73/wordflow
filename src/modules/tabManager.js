/**
 * Manages lightweight document tabs by snapshotting and restoring editor state.
 */

import { createIconPlaceholder, initIcons } from './icons.js';

let nextTabSeq = 1;

function getBasename(filePath, defaultMode = 'docx') {
  if (!filePath) return `Untitled.${defaultMode}`;
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || `Untitled.${defaultMode}`;
}

export function createTabManager({
  containerEl,
  editor,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) {
  let tabs = [];
  let activeId = null;
  let enabled = true;
  const docContainerEl = document.querySelector('.document-container');

  function playSwitchAnimation(direction = 1) {
    if (!docContainerEl) return;
    docContainerEl.style.setProperty('--tab-slide-from', `${direction >= 0 ? 32 : -32}px`);
    docContainerEl.classList.remove('is-tab-switching');
    void docContainerEl.offsetWidth;
    docContainerEl.classList.add('is-tab-switching');
  }

  if (docContainerEl) {
    docContainerEl.addEventListener('animationend', () => {
      docContainerEl.classList.remove('is-tab-switching');
    });
  }

  function setEnabled(flag) {
    enabled = Boolean(flag);
    render();
  }

  function isEnabled() {
    return enabled;
  }

  function getActiveTab() {
    return tabs.find((t) => t.id === activeId) || null;
  }

  function syncActiveFromEditor({ filePath, isDirty }) {
    const active = getActiveTab();
    if (!active) return;
    active.filePath = filePath;
    active.fileName = getBasename(filePath, editor.getMode());
    active.isDirty = Boolean(isDirty);
    active.snapshot = editor.getSnapshot();
    render();
  }

  function createTab({ filePath = null, isDirty = false, snapshot = null } = {}) {
    if (activeId) {
      const current = getActiveTab();
      if (current) {
        current.snapshot = editor.getSnapshot();
      }
    }
    const id = `tab-${nextTabSeq++}`;
    const tab = {
      id,
      filePath,
      fileName: getBasename(filePath, snapshot?.mode || editor.getMode()),
      isDirty: Boolean(isDirty),
      snapshot: snapshot || editor.getSnapshot(),
    };
    tabs.push(tab);
    activeId = id;
    render();
    return tab;
  }

  function findTabByPath(filePath) {
    if (!filePath) return null;
    return tabs.find((t) => t.filePath === filePath) || null;
  }

  function activateTab(id) {
    if (id === activeId) return getActiveTab();
    const prevIdx = tabs.findIndex((t) => t.id === activeId);
    const nextIdx = tabs.findIndex((t) => t.id === id);
    const current = getActiveTab();
    if (current) {
      current.snapshot = editor.getSnapshot();
    }
    const target = tabs[nextIdx];
    if (!target) return null;
    activeId = target.id;
    editor.restoreSnapshot(target.snapshot);
    playSwitchAnimation(nextIdx >= prevIdx ? 1 : -1);
    render();
    onSelectTab?.(target);
    return target;
  }

  function removeTab(id) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    tabs.splice(idx, 1);

    if (tabs.length === 0) {
      activeId = null;
      render();
      return null;
    }

    if (activeId === id) {
      const next = tabs[Math.min(idx, tabs.length - 1)];
      activeId = next.id;
      editor.restoreSnapshot(next.snapshot);
      playSwitchAnimation();
      render();
      return next;
    }

    render();
    return getActiveTab();
  }

  function clearAll() {
    tabs = [];
    activeId = null;
    render();
  }

  function render() {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    if (!enabled || tabs.length === 0) return;

    const list = document.createElement('div');
    list.className = 'doc-tabs-list';
    list.setAttribute('role', 'tablist');

    tabs.forEach((tab) => {
      const item = document.createElement('div');
      item.className = `doc-tab${tab.id === activeId ? ' is-active' : ''}`;
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(tab.id === activeId));
      item.title = tab.filePath || tab.fileName;

      const labelBtn = document.createElement('button');
      labelBtn.type = 'button';
      labelBtn.className = 'doc-tab-label';
      labelBtn.textContent = tab.isDirty ? `${tab.fileName} *` : tab.fileName;
      labelBtn.addEventListener('click', () => activateTab(tab.id));

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'doc-tab-close';
      closeBtn.title = `Close ${tab.fileName}`;
      closeBtn.setAttribute('aria-label', `Close ${tab.fileName}`);
      closeBtn.appendChild(createIconPlaceholder('x', 'lucide-xs'));
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        onCloseTab?.(tab);
      });

      item.appendChild(labelBtn);
      item.appendChild(closeBtn);
      list.appendChild(item);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'doc-tab-add';
    addBtn.title = 'New Tab (Ctrl+N)';
    addBtn.setAttribute('aria-label', 'New Tab');
    addBtn.appendChild(createIconPlaceholder('plus', 'lucide-sm'));
    addBtn.addEventListener('click', () => onNewTab?.());

    containerEl.appendChild(list);
    containerEl.appendChild(addBtn);
    initIcons(containerEl);
  }

  return {
    setEnabled,
    isEnabled,
    getTabs: () => [...tabs],
    getActiveTab,
    findTabByPath,
    createTab,
    activateTab,
    removeTab,
    clearAll,
    syncActiveFromEditor,
    render,
  };
}
