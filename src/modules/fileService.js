import { open, save, confirm, message } from '@tauri-apps/plugin-dialog';
import { readFile, readTextFile, stat, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import mammoth from 'mammoth';
import { htmlToDocxBytes } from './docxExporter.js';
import { escapeHtml } from './formatters.js';
import { addRecentDocument } from './settingsStore.js';

const SUPPORTED_EXTENSIONS = new Set(['docx', 'md', 'txt', 'html', 'htm']);

const SAVE_FILTERS = {
  docx: { name: 'Word Document', extensions: ['docx'] },
  md: { name: 'Markdown', extensions: ['md'] },
  html: { name: 'HTML Document', extensions: ['html'] },
  txt: { name: 'Plain Text', extensions: ['txt'] },
};

function extractHtmlBody(rawHtml) {
  const match = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : rawHtml;
}

function wrapHtmlDocument(bodyHtml, title) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    `  <title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    bodyHtml,
    '</body>',
    '</html>',
  ].join('\n');
}

function getBasename(filePath) {
  if (!filePath) return 'Untitled.docx';
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || 'Untitled.docx';
}

function getExtension(filePath) {
  const match = (filePath || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function replaceExtension(fileName, targetExt) {
  if (/\.[a-z0-9]+$/i.test(fileName)) {
    return fileName.replace(/\.[a-z0-9]+$/i, `.${targetExt}`);
  }
  return `${fileName}.${targetExt}`;
}

export function createFileService({ editor, onStateChange, initialHasOpenDocument = true }) {
  let currentPath = null;
  let isDirty = false;
  let hasOpenDocument = Boolean(initialHasOpenDocument);
  let tabManager = null;

  function setTabManager(manager) {
    tabManager = manager;
  }

  async function recordRecentFile(filePath, modeHint) {
    let size = null;
    let modifiedAt = null;
    try {
      const info = await stat(filePath);
      if (typeof info?.size === 'number') size = info.size;
      if (info?.mtime) {
        const mtimeDate = info.mtime instanceof Date ? info.mtime : new Date(info.mtime);
        if (!Number.isNaN(mtimeDate.getTime())) {
          modifiedAt = mtimeDate.toISOString();
        }
      }
    } catch {
      // Stat may be unavailable outside Tauri FS scope.
    }
    const ext = getExtension(filePath);
    const normalizedExt = ext === 'htm' ? 'html' : ext;
    await addRecentDocument(filePath, {
      mode: modeHint || normalizedExt || 'docx',
      size,
      modifiedAt,
    });
  }

  async function notify() {
    if (tabManager?.isEnabled() && hasOpenDocument) {
      tabManager.syncActiveFromEditor({ filePath: currentPath, isDirty });
    }
    onStateChange?.({
      fileName: hasOpenDocument ? getBasename(currentPath) : 'No document open',
      filePath: currentPath,
      isDirty,
      hasOpenDocument,
    });
  }

  function markDirty(dirty = true) {
    if (isDirty !== dirty) {
      isDirty = dirty;
      notify();
    }
  }

  async function confirmDiscardIfDirty() {
    if (!isDirty) return true;
    return confirm('You have unsaved changes. Discard them and continue?', {
      title: 'Unsaved Changes',
      kind: 'warning',
    });
  }

  async function resetDocument(nextHasOpenDocument = true) {
    const ok = await confirmDiscardIfDirty();
    if (!ok) return;

    hasOpenDocument = nextHasOpenDocument;
    currentPath = null;
    isDirty = false;
    editor.clear();
    notify();
  }

  async function newDocument() {
    if (tabManager?.isEnabled()) {
      hasOpenDocument = true;
      currentPath = null;
      isDirty = false;
      editor.clear();
      tabManager.createTab({ filePath: null, isDirty: false });
      notify();
      return;
    }
    return resetDocument(true);
  }

  function selectTab(tab) {
    if (!tab) return;
    hasOpenDocument = true;
    currentPath = tab.filePath;
    isDirty = tab.isDirty;
    notify();
  }

  async function closeTab(tab) {
    if (!tab || !tabManager) return;
    if (tab.isDirty) {
      const ok = await confirm(`"${tab.fileName}" has unsaved changes. Discard them and close?`, {
        title: 'Unsaved Changes',
        kind: 'warning',
      });
      if (!ok) return;
    }

    const nextTab = tabManager.removeTab(tab.id);
    if (nextTab) {
      hasOpenDocument = true;
      currentPath = nextTab.filePath;
      isDirty = nextTab.isDirty;
      notify();
    } else {
      hasOpenDocument = false;
      currentPath = null;
      isDirty = false;
      editor.clear();
      notify();
    }
  }

  async function closeDocument() {
    if (!hasOpenDocument) return;
    if (tabManager?.isEnabled()) {
      const active = tabManager.getActiveTab();
      if (active) {
        await closeTab(active);
        return;
      }
    }
    return resetDocument(false);
  }

  async function openFileByPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return;

    const ext = getExtension(filePath);
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      await message('Unsupported file type. Please open a .docx, .md, .txt, or .html file.', {
        title: 'Unsupported File',
        kind: 'warning',
      });
      return;
    }

    const isTabbed = Boolean(tabManager?.isEnabled());
    if (isTabbed) {
      const existing = tabManager.findTabByPath(filePath);
      if (existing) {
        tabManager.activateTab(existing.id);
        selectTab(existing);
        return;
      }
    } else {
      const ok = await confirmDiscardIfDirty();
      if (!ok) return;
    }

    const activeTab = isTabbed ? tabManager.getActiveTab() : null;
    const reuseEmptyTab = Boolean(
      isTabbed &&
        hasOpenDocument &&
        activeTab &&
        !activeTab.filePath &&
        !activeTab.isDirty &&
        editor.getStats().chars === 0
    );

    try {
      if (ext === 'docx') {
        const bytes = await readFile(filePath);
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        );
        const result = await mammoth.convertToHtml({ arrayBuffer });
        editor.loadDocumentContent('docx', result.value);
      } else if (ext === 'md') {
        const text = await readTextFile(filePath);
        editor.loadDocumentContent('md', text);
      } else if (ext === 'html' || ext === 'htm') {
        const text = await readTextFile(filePath);
        editor.loadDocumentContent('html', extractHtmlBody(text));
      } else {
        const text = await readTextFile(filePath);
        editor.loadDocumentContent('txt', text);
      }

      hasOpenDocument = true;
      currentPath = filePath;
      isDirty = false;
      if (isTabbed && !reuseEmptyTab) {
        tabManager.createTab({ filePath, isDirty: false });
      }
      await recordRecentFile(filePath, ext === 'htm' ? 'html' : ext);
      notify();
    } catch (err) {
      await message(`Failed to open file: ${err?.message || err}`, {
        title: 'Open Error',
        kind: 'error',
      });
    }
  }

  async function openDocument() {
    if (!tabManager?.isEnabled()) {
      const ok = await confirmDiscardIfDirty();
      if (!ok) return;
    }

    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Supported Documents',
          extensions: ['docx', 'md', 'txt', 'html'],
        },
      ],
    });

    if (!selected || typeof selected !== 'string') return;
    await openFileByPath(selected);
  }

  async function writeDocumentToPath(targetPath, targetExt) {
    if (targetExt === 'docx') {
      const bytes = await htmlToDocxBytes(
        editor.getHtml(),
        editor.getDocumentStyles()
      );
      await writeFile(targetPath, bytes);
    } else if (targetExt === 'html' || targetExt === 'htm') {
      const content = wrapHtmlDocument(editor.getHtml(), getBasename(targetPath));
      await writeTextFile(targetPath, content);
    } else if (targetExt === 'txt') {
      await writeTextFile(targetPath, editor.getPlainText());
    } else {
      await writeTextFile(targetPath, editor.getMarkdown());
    }
  }

  async function saveDocument(forceSaveAs = false) {
    if (!hasOpenDocument) return false;
    const activeMode = editor.getMode();
    const rawExt = getExtension(currentPath);
    const normalizedCurrentExt = rawExt === 'htm' ? 'html' : rawExt;
    const matchesActiveMode = Boolean(currentPath && normalizedCurrentExt === activeMode);

    let targetPath = currentPath;

    if (currentPath && !forceSaveAs && !matchesActiveMode) {
      const proceed = await confirm(
        `You are about to save in a different format (.${activeMode} instead of .${normalizedCurrentExt}). This will save as a new file without changing the original. Do you want to proceed?`,
        {
          title: 'Save in Different Format',
          kind: 'warning',
        }
      );
      if (!proceed) return false;
    }

    if (forceSaveAs || !matchesActiveMode) {
      const baseName = currentPath ? getBasename(currentPath) : `Untitled.${activeMode}`;
      const defaultName = replaceExtension(baseName, activeMode);
      const orderedFilters = [
        SAVE_FILTERS[activeMode],
        ...Object.entries(SAVE_FILTERS)
          .filter(([key]) => key !== activeMode)
          .map(([, filter]) => filter),
      ];

      targetPath = await save({
        defaultPath: defaultName,
        filters: orderedFilters,
      });
    }

    if (!targetPath) return false;

    const targetExt = getExtension(targetPath) || activeMode;

    try {
      await writeDocumentToPath(targetPath, targetExt);

      currentPath = targetPath;
      isDirty = false;
      await recordRecentFile(targetPath, targetExt === 'htm' ? 'html' : targetExt);
      notify();
      return true;
    } catch (err) {
      await message(`Failed to save file: ${err?.message || err}`, {
        title: 'Save Error',
        kind: 'error',
      });
      return false;
    }
  }

  async function exportDocument(targetFormat) {
    if (!hasOpenDocument || !SAVE_FILTERS[targetFormat]) return;
    const baseName = currentPath ? getBasename(currentPath) : `Untitled.${targetFormat}`;
    const defaultName = replaceExtension(baseName, targetFormat);

    const targetPath = await save({
      defaultPath: defaultName,
      filters: [SAVE_FILTERS[targetFormat]],
    });
    if (!targetPath) return;

    const targetExt = getExtension(targetPath) || targetFormat;
    try {
      await writeDocumentToPath(targetPath, targetExt);
      await recordRecentFile(targetPath, targetExt === 'htm' ? 'html' : targetExt);
      notify();
    } catch (err) {
      await message(`Failed to export file: ${err?.message || err}`, {
        title: 'Export Error',
        kind: 'error',
      });
    }
  }

  function printDocument() {
    if (!hasOpenDocument) return;
    editor.syncForPrint();
    window.print();
  }

  function hasUnsavedChanges() {
    if (tabManager?.isEnabled()) {
      return isDirty || tabManager.getTabs().some((tab) => tab.isDirty);
    }
    return isDirty;
  }

  function getDirtyFileNames() {
    if (tabManager?.isEnabled()) {
      const names = tabManager
        .getTabs()
        .filter((tab) => tab.isDirty)
        .map((tab) => tab.fileName);
      if (names.length > 0) return names;
    }
    return isDirty ? [getBasename(currentPath)] : [];
  }

  async function saveAllDirty() {
    if (tabManager?.isEnabled()) {
      notify();
      const dirtyTabs = tabManager.getTabs().filter((tab) => tab.isDirty);
      for (const tab of dirtyTabs) {
        if (tabManager.getActiveTab()?.id !== tab.id) {
          tabManager.activateTab(tab.id);
          selectTab(tab);
        }
        const saved = await saveDocument(false);
        if (!saved) return false;
      }
      return true;
    }
    if (!isDirty) return true;
    return saveDocument(false);
  }

  notify();

  return {
    setTabManager,
    selectTab,
    closeTab,
    newDocument,
    closeDocument,
    openDocument,
    openFileByPath,
    saveDocument,
    exportDocument,
    printDocument,
    markDirty,
    isDirty: () => isDirty,
    hasUnsavedChanges,
    getDirtyFileNames,
    saveAllDirty,
  };
}
