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

const STARTER_TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Document',
    desc: 'Start with a clean page',
    icon: 'file-plus',
    html: '',
  },
  {
    id: 'letter',
    title: 'Letter',
    desc: 'Formal or personal letter',
    icon: 'mail',
    html: '<p><strong>Your Name</strong><br>123 Street Address<br>City, Postcode</p><p>Date</p><p><strong>Recipient Name</strong><br>Company or Organisation<br>Address</p><p>Dear [Name],</p><p>Write the body of your letter here.</p><p>Sincerely,</p><p>Your Name</p>',
  },
  {
    id: 'report',
    title: 'Report',
    desc: 'Title, summary & sections',
    icon: 'file-text',
    html: '<h1>Report Title</h1><p><em>Prepared by [Your Name] • Date</em></p><h2>Executive Summary</h2><p>Summarise the key findings and purpose of this report.</p><h2>Key Details</h2><p>Add your main points, data, or analysis here.</p><h2>Next Steps</h2><ul><li>Action item 1</li><li>Action item 2</li></ul>',
  },
  {
    id: 'meeting',
    title: 'Meeting Notes',
    desc: 'Agenda, attendees & actions',
    icon: 'clipboard-list',
    html: '<h1>Meeting Notes</h1><p><strong>Date:</strong> [Date] &nbsp;|&nbsp; <strong>Attendees:</strong> [Names]</p><h2>Agenda</h2><ul><li>Topic 1</li><li>Topic 2</li></ul><h2>Discussion &amp; Decisions</h2><p>Capture key notes and decisions here.</p><h2>Action Items</h2><ul><li>[Owner] — Task description</li></ul>',
  },
];

export function createRecentDocsView({
  containerEl,
  onOpenFile,
  onNewDocument,
  onNewTemplate,
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

    const templatesSection = document.createElement('div');
    templatesSection.className = 'recent-templates-section';

    const templatesHeading = document.createElement('div');
    templatesHeading.className = 'recent-templates-heading';
    templatesHeading.textContent = 'Start from a Template';
    templatesSection.appendChild(templatesHeading);

    const templatesGrid = document.createElement('div');
    templatesGrid.className = 'recent-templates-grid';
    STARTER_TEMPLATES.forEach((tpl) => {
      const tplBtn = document.createElement('button');
      tplBtn.type = 'button';
      tplBtn.className = 'recent-template-card';

      const thumb = document.createElement('div');
      thumb.className = 'recent-template-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      if (tpl.html) {
        const previewDoc = document.createElement('div');
        previewDoc.className = 'recent-template-preview-doc';
        previewDoc.innerHTML = tpl.html;
        thumb.appendChild(previewDoc);
      } else {
        thumb.classList.add('is-blank');
        thumb.appendChild(createIconPlaceholder(tpl.icon, 'lucide-md'));
      }
      tplBtn.appendChild(thumb);

      const textWrap = document.createElement('span');
      textWrap.className = 'recent-template-text';
      const titleEl = document.createElement('span');
      titleEl.className = 'recent-template-title';
      titleEl.textContent = tpl.title;
      const descEl = document.createElement('span');
      descEl.className = 'recent-template-desc';
      descEl.textContent = tpl.desc;
      textWrap.appendChild(titleEl);
      textWrap.appendChild(descEl);

      tplBtn.appendChild(textWrap);
      tplBtn.addEventListener('click', () => {
        if (!tpl.html) {
          onNewDocument?.();
        } else {
          onNewTemplate?.(tpl);
        }
      });
      templatesGrid.appendChild(tplBtn);
    });
    templatesSection.appendChild(templatesGrid);
    card.appendChild(templatesSection);

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
