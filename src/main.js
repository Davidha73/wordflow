import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { createEditor } from './modules/editor.js';
import { createFileService } from './modules/fileService.js';
import { createStatusBar } from './modules/statusBar.js';
import { createSettingsDrawer } from './modules/settingsDrawer.js';
import { createRecentDocsView } from './modules/recentDocsView.js';
import {
  clearRecentDocuments,
  getRecentDocuments,
  loadSettings,
  removeRecentDocument,
  saveSettings,
} from './modules/settingsStore.js';
import { initWindowState } from './modules/windowState.js';
import { applyPageLayout } from './modules/pageLayout.js';
import { createTabManager } from './modules/tabManager.js';
import { initIcons } from './modules/icons.js';

async function initApp() {
  initIcons();
  const initialSettings = await loadSettings();
  const statusBar = createStatusBar({
    onZoomChange: (zoom) => saveSettings({ zoom }),
  });
  if (initialSettings.theme) {
    statusBar.setTheme(initialSettings.theme);
  }
  let currentDefaultZoom = initialSettings.defaultZoom || 100;
  statusBar.setDefaultZoom(currentDefaultZoom);
  statusBar.setZoom(currentDefaultZoom);
  let fileService = null;
  let settingsDrawer = null;

  function promptUnsavedBeforeQuit(dirtyNames) {
    const backdropEl = document.getElementById('quit-modal-backdrop');
    const modalEl = document.getElementById('quit-modal');
    const messageEl = document.getElementById('quit-modal-message');
    const saveBtn = document.getElementById('btn-quit-save');
    const discardBtn = document.getElementById('btn-quit-discard');
    const cancelBtn = document.getElementById('btn-quit-cancel');
    if (!modalEl || !saveBtn || !discardBtn || !cancelBtn) {
      return Promise.resolve(true);
    }

    if (messageEl) {
      messageEl.textContent =
        dirtyNames.length === 1
          ? `Do you want to save changes to "${dirtyNames[0]}" before quitting?`
          : `You have ${dirtyNames.length} unsaved documents. Do you want to save changes before quitting?`;
    }

    return new Promise((resolve) => {
      const cleanup = () => {
        modalEl.classList.remove('is-open');
        backdropEl?.classList.remove('is-open');
        modalEl.setAttribute('aria-hidden', 'true');
        backdropEl?.setAttribute('aria-hidden', 'true');
        saveBtn.removeEventListener('click', onSave);
        discardBtn.removeEventListener('click', onDiscard);
        cancelBtn.removeEventListener('click', onCancel);
        backdropEl?.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKeyDown);
      };

      const onSave = () => {
        cleanup();
        resolve('save');
      };
      const onDiscard = () => {
        cleanup();
        resolve('discard');
      };
      const onCancel = () => {
        cleanup();
        resolve('cancel');
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      };

      saveBtn.addEventListener('click', onSave);
      discardBtn.addEventListener('click', onDiscard);
      cancelBtn.addEventListener('click', onCancel);
      backdropEl?.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKeyDown);

      backdropEl?.classList.add('is-open');
      modalEl.classList.add('is-open');
      modalEl.setAttribute('aria-hidden', 'false');
      backdropEl?.setAttribute('aria-hidden', 'false');
      saveBtn.focus();
    });
  }

  initWindowState(
    initialSettings.window,
    (windowPatch) => {
      saveSettings({ window: windowPatch });
    },
    async () => {
      if (!fileService?.hasUnsavedChanges()) return true;
      const choice = await promptUnsavedBeforeQuit(fileService.getDirtyFileNames());
      if (choice === 'discard') return true;
      if (choice === 'save') {
        return fileService.saveAllDirty();
      }
      return false;
    }
  );

  const editor = createEditor({
    onChange: ({ markDirty }) => {
      statusBar.updateStats(editor.getStats());
      if (markDirty && fileService) {
        fileService.markDirty(true);
      }
    },
    onModeChange: (mode) => {
      statusBar.updateMode(mode);
    },
    onFontsLoaded: (fonts) => {
      if (initialSettings.defaultFont && fonts.includes(initialSettings.defaultFont)) {
        editor.setDefaultFont(initialSettings.defaultFont);
      }
      settingsDrawer?.setAvailableFonts(fonts);
    },
  });

  if (initialSettings.defaultFont) {
    editor.setDefaultFont(initialSettings.defaultFont);
  }
  if (initialSettings.defaultFontSize) {
    editor.setDefaultFontSize(initialSettings.defaultFontSize);
  }
  if (initialSettings.defaultMode) {
    editor.setDefaultMode(initialSettings.defaultMode);
    editor.setMode(initialSettings.defaultMode);
  }
  if (Array.isArray(initialSettings.customStyles)) {
    editor.setCustomStyles(initialSettings.customStyles);
  }

  let currentStartIn = initialSettings.startIn || 'document';
  let currentPageSize = initialSettings.pageSize || 'A4';
  let currentPageOrientation = initialSettings.pageOrientation || 'portrait';
  let tabsEnabled = initialSettings.tabsEnabled !== false;
  applyPageLayout(currentPageSize, currentPageOrientation);

  const appShellEl = document.querySelector('.app-shell');
  appShellEl?.setAttribute('data-tabs-enabled', String(tabsEnabled));

  const tabManager = createTabManager({
    containerEl: document.getElementById('doc-tab-bar'),
    editor,
    onSelectTab: (tab) => fileService?.selectTab(tab),
    onCloseTab: (tab) => fileService?.closeTab(tab),
    onNewTab: () => fileService?.newDocument(),
  });
  tabManager.setEnabled(tabsEnabled);

  settingsDrawer = createSettingsDrawer({
    getStartIn: () => currentStartIn,
    getDefaultFont: () => editor.getDefaultFont(),
    getDefaultFontSize: () => editor.getDefaultFontSize(),
    getDefaultZoom: () => currentDefaultZoom,
    getDefaultMode: () => editor.getDefaultMode(),
    getPageSize: () => currentPageSize,
    getPageOrientation: () => currentPageOrientation,
    getTabsEnabled: () => tabsEnabled,
    getTheme: () => document.documentElement.dataset.theme || 'light',
    onStartInChange: (startIn) => {
      currentStartIn = startIn;
    },
    onDefaultFontChange: (font) => editor.setDefaultFont(font),
    onDefaultSizeChange: (size) => editor.setDefaultFontSize(size),
    onDefaultZoomChange: (zoom) => {
      currentDefaultZoom = zoom;
      statusBar.setDefaultZoom(zoom);
      statusBar.setZoom(zoom);
      saveSettings({ zoom });
    },
    onDefaultModeChange: (mode) => editor.setDefaultMode(mode),
    onPageSizeChange: (size) => {
      currentPageSize = size;
      applyPageLayout(currentPageSize, currentPageOrientation);
    },
    onPageOrientationChange: (orientation) => {
      currentPageOrientation = orientation;
      applyPageLayout(currentPageSize, currentPageOrientation);
    },
    onTabsEnabledChange: (enabled) => {
      tabsEnabled = Boolean(enabled);
      appShellEl?.setAttribute('data-tabs-enabled', String(tabsEnabled));
      tabManager.setEnabled(tabsEnabled);
      if (tabsEnabled && appShellEl?.getAttribute('data-has-document') !== 'false' && !tabManager.getActiveTab()) {
        tabManager.createTab({ filePath: null, isDirty: fileService?.isDirty() });
      }
    },
    onThemeChange: (theme) => statusBar.setTheme(theme),
  });

  const saveBtnEl = document.getElementById('btn-save');
  const saveAsBtnEl = document.getElementById('btn-save-as');
  const convertWrapEl = document.getElementById('convert-menu-wrap');
  const convertBtnEl = document.getElementById('btn-convert');
  const convertPopoverEl = document.getElementById('convert-popover');
  const closeBtnEl = document.getElementById('btn-close');
  const printBtnEl = document.getElementById('btn-print');
  const inspectorToggleBtnEl = document.getElementById('btn-inspector-toggle');

  const recentDocsView = createRecentDocsView({
    containerEl: document.getElementById('recent-docs-view'),
    onOpenFile: (path) => fileService?.openFileByPath(path),
    onNewDocument: () => fileService?.newDocument(),
    onOpenDialog: () => fileService?.openDocument(),
    onClearRecent: async () => {
      await clearRecentDocuments();
      recentDocsView.render([]);
    },
    onRemoveRecent: async (path) => {
      const next = await removeRecentDocument(path);
      recentDocsView.render(next);
    },
    onCopyPath: (path) => {
      if (path) navigator.clipboard?.writeText(path);
    },
    onShowInExplorer: (path) => {
      if (path) invoke('show_in_explorer', { path }).catch(() => {});
    },
  });

  fileService = createFileService({
    editor,
    initialHasOpenDocument: currentStartIn !== 'start-page',
    onStateChange: ({ fileName, isDirty, hasOpenDocument }) => {
      appShellEl?.setAttribute('data-has-document', String(hasOpenDocument));
      if (saveBtnEl) saveBtnEl.disabled = !hasOpenDocument;
      if (saveAsBtnEl) saveAsBtnEl.disabled = !hasOpenDocument;
      if (convertBtnEl) convertBtnEl.disabled = !hasOpenDocument;
      if (!hasOpenDocument && convertPopoverEl) {
        convertPopoverEl.classList.remove('is-open');
        convertBtnEl?.setAttribute('aria-expanded', 'false');
      }
      if (closeBtnEl) closeBtnEl.disabled = !hasOpenDocument;
      if (printBtnEl) printBtnEl.disabled = !hasOpenDocument;
      if (inspectorToggleBtnEl) inspectorToggleBtnEl.disabled = !hasOpenDocument;
      const pillNameEl = document.getElementById('doc-pill-name');
      const pillDirtyEl = document.getElementById('doc-pill-dirty');
      if (pillNameEl) {
        pillNameEl.textContent = hasOpenDocument ? (fileName || 'Untitled.docx') : 'No Document';
      }
      if (pillDirtyEl) {
        pillDirtyEl.classList.toggle('is-dirty', Boolean(hasOpenDocument && isDirty));
      }
      recentDocsView.render(getRecentDocuments());
      statusBar.updateFile({ fileName, isDirty });
      document.title = '';
    },
  });

  if (currentStartIn !== 'start-page') {
    tabManager.createTab({ filePath: null, isDirty: false });
  }
  fileService.setTabManager(tabManager);

  document.getElementById('btn-new').addEventListener('click', () => {
    fileService.newDocument();
  });

  document.getElementById('btn-open').addEventListener('click', () => {
    fileService.openDocument();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    fileService.saveDocument(false);
  });

  document.getElementById('btn-save-as').addEventListener('click', () => {
    fileService.saveDocument(true);
  });

  if (convertBtnEl && convertPopoverEl) {
    const closeConvertMenu = () => {
      convertPopoverEl.classList.remove('is-open');
      convertBtnEl.setAttribute('aria-expanded', 'false');
    };

    convertBtnEl.addEventListener('click', () => {
      if (convertBtnEl.disabled) return;
      const willOpen = !convertPopoverEl.classList.contains('is-open');
      convertPopoverEl.classList.toggle('is-open', willOpen);
      convertBtnEl.setAttribute('aria-expanded', String(willOpen));
    });

    convertPopoverEl.addEventListener('click', (event) => {
      const item = event.target.closest('[data-convert-format]');
      if (!item) return;
      closeConvertMenu();
      fileService.exportDocument(item.dataset.convertFormat);
    });

    document.addEventListener('mousedown', (event) => {
      if (convertWrapEl && !convertWrapEl.contains(event.target)) {
        closeConvertMenu();
      }
    });
  }

  document.getElementById('btn-close').addEventListener('click', () => {
    fileService.closeDocument();
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    fileService.printDocument();
  });

  const pillMenuWrapEl = document.getElementById('doc-pill-menu-wrap');
  const pillTriggerEl = document.getElementById('doc-pill-trigger');
  const pillMenuEl = document.getElementById('doc-pill-menu');

  const closePillMenu = () => {
    pillMenuEl?.classList.remove('is-open');
    pillTriggerEl?.setAttribute('aria-expanded', 'false');
  };

  pillTriggerEl?.addEventListener('click', () => {
    const willOpen = !pillMenuEl?.classList.contains('is-open');
    closePillMenu();
    if (willOpen) {
      pillMenuEl?.classList.add('is-open');
      pillTriggerEl.setAttribute('aria-expanded', 'true');
    }
  });

  pillMenuEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn || btn.id === 'btn-convert') return;
    closePillMenu();
  });

  document.addEventListener('mousedown', (event) => {
    if (pillMenuWrapEl && !pillMenuWrapEl.contains(event.target)) {
      closePillMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePillMenu();
    }
  });

  const workspaceEl = document.getElementById('workspace');

  getCurrentWebview()
    .onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') {
        workspaceEl.classList.add('is-drag-over');
      } else if (type === 'leave') {
        workspaceEl.classList.remove('is-drag-over');
      } else if (type === 'drop') {
        workspaceEl.classList.remove('is-drag-over');
        const paths = event.payload.paths;
        if (Array.isArray(paths) && paths.length > 0) {
          fileService.openFileByPath(paths[0]);
        }
      }
    })
    .catch(() => {
      // Ignore if running outside Tauri webview context
    });

  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();

    if (key === 's') {
      event.preventDefault();
      fileService.saveDocument(event.shiftKey);
    } else if (key === 'o') {
      event.preventDefault();
      fileService.openDocument();
    } else if (key === 'n') {
      event.preventDefault();
      fileService.newDocument();
    } else if (key === 'w') {
      event.preventDefault();
      fileService.closeDocument();
    } else if (key === 'p') {
      event.preventDefault();
      fileService.printDocument();
    } else if (key === 'f') {
      event.preventDefault();
      editor.openFindReplace(false);
    } else if (key === 'h') {
      event.preventDefault();
      editor.openFindReplace(true);
    } else if (key === 'k') {
      event.preventDefault();
      editor.openLinkDialog();
    } else if (key === 'm') {
      event.preventDefault();
      editor.toggleMode();
    } else if (editor.getMode() === 'docx') {
      if (key === 'b') {
        event.preventDefault();
        editor.execFormatCommand('bold');
      } else if (key === 'i') {
        event.preventDefault();
        editor.execFormatCommand('italic');
      } else if (key === 'u') {
        event.preventDefault();
        editor.execFormatCommand('underline');
      } else if (key === 'z') {
        event.preventDefault();
        editor.execFormatCommand(event.shiftKey ? 'redo' : 'undo');
      } else if (key === 'y') {
        event.preventDefault();
        editor.execFormatCommand('redo');
      }
    }
  });

  statusBar.updateMode(editor.getMode());
  statusBar.updateStats(editor.getStats());
}

document.addEventListener('DOMContentLoaded', initApp);
