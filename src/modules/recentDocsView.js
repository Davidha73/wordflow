/**
 * Renders the Recent Documents view shown on the empty workspace when no document is open.
 */

import { createIconPlaceholder, initIcons } from './icons.js';

function getDirName(filePath) {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx > 0 ? filePath.slice(0, idx) : '';
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMode(doc) {
  if (doc.mode) return doc.mode.toUpperCase();
  const match = (doc.path || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match ? (match[1] === 'htm' ? 'html' : match[1]) : 'docx';
  return ext.toUpperCase();
}

export function createRecentDocsView({
  containerEl,
  onOpenFile,
  onNewDocument,
  onOpenDialog,
  onClearRecent,
  onRemoveRecent,
  onCopyPath,
  onShowInExplorer,
}) {
  function createMenuItem(iconName, labelText, onClick) {
    const itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = 'recent-doc-menu-item';
    itemBtn.setAttribute('role', 'menuitem');
    itemBtn.appendChild(createIconPlaceholder(iconName, 'lucide-xs'));
    const labelEl = document.createElement('span');
    labelEl.textContent = labelText;
    itemBtn.appendChild(labelEl);
    itemBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeAllMenus();
      onClick?.();
    });
    return itemBtn;
  }
  function closeAllMenus() {
    containerEl?.querySelectorAll('.recent-doc-menu-popover.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
    });
    containerEl?.querySelectorAll('.recent-doc-menu-btn[aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.recent-doc-menu-wrap')) {
      closeAllMenus();
    }
  });

  function render(items = []) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'recent-docs-card';

    const header = document.createElement('div');
    header.className = 'recent-docs-header';

    const title = document.createElement('h2');
    title.className = 'recent-docs-title';
    title.textContent = 'Recent Documents';
    header.appendChild(title);

    if (items.length > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'recent-docs-clear-btn';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => onClearRecent?.());
      header.appendChild(clearBtn);
    }

    card.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'recent-docs-empty';
      empty.textContent = 'No recent documents yet.';
      card.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'recent-docs-list';
      list.setAttribute('role', 'list');

      items.forEach((doc) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recent-doc-item';
        btn.setAttribute('role', 'listitem');
        btn.title = doc.path;

        const info = document.createElement('span');
        info.className = 'recent-doc-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'recent-doc-name';
        nameEl.textContent = doc.name || doc.path;

        const pathEl = document.createElement('span');
        pathEl.className = 'recent-doc-path';
        pathEl.textContent = getDirName(doc.path);

        info.appendChild(nameEl);
        info.appendChild(pathEl);

        const meta = document.createElement('span');
        meta.className = 'recent-doc-meta';

        const modeEl = document.createElement('span');
        modeEl.className = 'recent-doc-mode';
        modeEl.textContent = formatMode(doc);

        const sizeEl = document.createElement('span');
        sizeEl.className = 'recent-doc-size';
        sizeEl.textContent = formatSize(doc.size);

        const dateEl = document.createElement('span');
        dateEl.className = 'recent-doc-date';
        dateEl.textContent = formatDate(doc.modifiedAt || doc.openedAt);

        meta.appendChild(modeEl);
        meta.appendChild(sizeEl);
        meta.appendChild(dateEl);

        btn.appendChild(info);
        btn.appendChild(meta);
        btn.addEventListener('click', () => onOpenFile?.(doc.path));

        const row = document.createElement('div');
        row.className = 'recent-doc-row';
        row.setAttribute('role', 'listitem');
        btn.removeAttribute('role');

        const menuWrap = document.createElement('div');
        menuWrap.className = 'recent-doc-menu-wrap';

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'recent-doc-menu-btn';
        menuBtn.title = 'Document options';
        menuBtn.setAttribute('aria-label', `Options for ${doc.name || doc.path}`);
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.appendChild(createIconPlaceholder('ellipsis-vertical', 'lucide-xs'));

        const popover = document.createElement('div');
        popover.className = 'recent-doc-menu-popover';
        popover.setAttribute('role', 'menu');

        const copyBtn = createMenuItem('copy', 'Copy File Path', () => onCopyPath?.(doc.path));
        const explorerBtn = createMenuItem('folder-open', 'Show in Explorer', () =>
          onShowInExplorer?.(doc.path)
        );
        const divider = document.createElement('div');
        divider.className = 'recent-doc-menu-divider';
        divider.setAttribute('role', 'separator');
        const removeBtn = createMenuItem('x', 'Remove from Recent Documents', () =>
          onRemoveRecent?.(doc.path)
        );

        menuBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const willOpen = !popover.classList.contains('is-open');
          closeAllMenus();
          if (willOpen) {
            popover.classList.add('is-open');
            menuBtn.setAttribute('aria-expanded', 'true');
          }
        });

        popover.appendChild(copyBtn);
        popover.appendChild(explorerBtn);
        popover.appendChild(divider);
        popover.appendChild(removeBtn);
        menuWrap.appendChild(menuBtn);
        menuWrap.appendChild(popover);

        row.appendChild(btn);
        row.appendChild(menuWrap);
        list.appendChild(row);
      });

      card.appendChild(list);
    }

    const actions = document.createElement('div');
    actions.className = 'recent-docs-actions';

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'recent-docs-action-btn is-primary';
    newBtn.textContent = 'New Document';
    newBtn.addEventListener('click', () => onNewDocument?.());

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'recent-docs-action-btn';
    openBtn.textContent = 'Open File…';
    openBtn.addEventListener('click', () => onOpenDialog?.());

    actions.appendChild(newBtn);
    actions.appendChild(openBtn);
    card.appendChild(actions);

    containerEl.appendChild(card);
    initIcons(containerEl);
  }

  return { render };
}
