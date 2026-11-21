import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { createEditor } from './modules/editor.js';
import { createFileService } from './modules/fileService.js';
import { createStatusBar } from './modules/statusBar.js';
import { createSettingsDrawer } from './modules/settingsDrawer.js';
import { createRecentDocsView, STARTER_TEMPLATES } from './modules/recentDocsView.js';
import {
  addCustomTemplate,
  clearRecentDocuments,
  getCustomTemplates,
  getRecentDocuments,
  loadSettings,
  removeCustomTemplate,
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
  if (initialSettings.defaultLineSpacing) {
    editor.setDefaultLineSpacing(initialSettings.defaultLineSpacing);
  }
  if (initialSettings.defaultPageMargins) {
    editor.setDefaultPageMargins(initialSettings.defaultPageMargins);
  }
  if (initialSettings.measurementUnit) {
    editor.setMeasurementUnit(initialSettings.measurementUnit);
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
  let currentMeasurementUnit = initialSettings.measurementUnit || 'mm';
  let tabsEnabled = initialSettings.tabsEnabled !== false;
  let spellcheckEnabled = initialSettings.spellcheckEnabled !== false;
  let grammarEnabled = initialSettings.grammarEnabled !== false;
  let autoSaveInterval = Number(initialSettings.autoSaveInterval) || 0;
  let autoSaveTimerId = 0;
  let lastAutoSavedAt = null;
  let isAutoSaving = false;

  function syncAutoSaveStatus() {
    statusBar.setAutoSaveStatus({
      intervalSeconds: autoSaveInterval,
      isSaving: isAutoSaving,
      hasFilePath: Boolean(fileService?.hasFilePath?.()),
      lastSavedAt: lastAutoSavedAt,
    });
  }

  editor.setProofingOptions({
    spellcheck: spellcheckEnabled,
    grammar: grammarEnabled,
  });

  function applyAutoSaveInterval(seconds) {
    autoSaveInterval = Number(seconds) || 0;
    if (autoSaveTimerId) {
      window.clearInterval(autoSaveTimerId);
      autoSaveTimerId = 0;
    }
    if (autoSaveInterval > 0) {
      autoSaveTimerId = window.setInterval(async () => {
        if (isAutoSaving || !fileService?.isDirty() || !fileService?.hasFilePath()) return;
        isAutoSaving = true;
        syncAutoSaveStatus();
        try {
          const saved = await fileService.saveDocument(false);
          if (saved) {
            lastAutoSavedAt = new Date();
          }
        } finally {
          isAutoSaving = false;
          syncAutoSaveStatus();
        }
      }, autoSaveInterval * 1000);
    }
    syncAutoSaveStatus();
  }
  applyAutoSaveInterval(autoSaveInterval);
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
    getDefaultLineSpacing: () => editor.getDefaultLineSpacing(),
    getDefaultPageMargins: () => editor.getDefaultPageMargins(),
    getDefaultZoom: () => currentDefaultZoom,
    getDefaultMode: () => editor.getDefaultMode(),
    getPageSize: () => currentPageSize,
    getPageOrientation: () => currentPageOrientation,
    getMeasurementUnit: () => currentMeasurementUnit,
    getTabsEnabled: () => tabsEnabled,
    getTheme: () => statusBar.getTheme?.() || document.documentElement.dataset.theme || 'light',
    getSpellcheckEnabled: () => spellcheckEnabled,
    getGrammarEnabled: () => grammarEnabled,
    getAutoSaveInterval: () => autoSaveInterval,
    onStartInChange: (startIn) => {
      currentStartIn = startIn;
    },
    onDefaultFontChange: (font) => editor.setDefaultFont(font),
    onDefaultSizeChange: (size) => editor.setDefaultFontSize(size),
    onDefaultLineSpacingChange: (spacing) => editor.setDefaultLineSpacing(spacing),
    onDefaultPageMarginsChange: (margins) => editor.setDefaultPageMargins(margins),
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
    onMeasurementUnitChange: (unit) => {
      currentMeasurementUnit = unit;
      editor.setMeasurementUnit(unit);
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
    onSpellcheckEnabledChange: (enabled) => {
      spellcheckEnabled = Boolean(enabled);
      editor.setProofingOptions({ spellcheck: spellcheckEnabled });
    },
    onGrammarEnabledChange: (enabled) => {
      grammarEnabled = Boolean(enabled);
      editor.setProofingOptions({ grammar: grammarEnabled });
    },
    onAutoSaveIntervalChange: (seconds) => applyAutoSaveInterval(seconds),
    onClearRecentDocuments: async () => {
      await clearRecentDocuments();
      recentDocsView?.render?.([]);
    },
    onResetWorkspaceLayout: () => editor.resetWorkspaceLayout(),
    onDictionaryChange: () => editor.refreshGrammar(),
  });

  const saveBtnEl = document.getElementById('btn-save');
  const saveAsBtnEl = document.getElementById('btn-save-as');
  const saveTemplateBtnEl = document.getElementById('btn-save-template');
  const duplicateBtnEl = document.getElementById('btn-duplicate');
  const renameBtnEl = document.getElementById('btn-rename');
  const revertBtnEl = document.getElementById('btn-revert');
  const showFinderBtnEl = document.getElementById('btn-show-finder');
  const convertWrapEl = document.getElementById('convert-menu-wrap');
  const convertBtnEl = document.getElementById('btn-convert');
  const convertPopoverEl = document.getElementById('convert-popover');
  const templateWrapEl = document.getElementById('template-menu-wrap');
  const templateBtnEl = document.getElementById('btn-new-template');
  const templatePopoverEl = document.getElementById('template-popover');
  const recentWrapEl = document.getElementById('recent-menu-wrap');
  const recentBtnEl = document.getElementById('btn-open-recent');
  const recentPopoverEl = document.getElementById('recent-popover');
  const closeBtnEl = document.getElementById('btn-close');
  const printBtnEl = document.getElementById('btn-print');
  const inspectorToggleBtnEl = document.getElementById('btn-inspector-toggle');

  const recentDocsView = createRecentDocsView({
    containerEl: document.getElementById('recent-docs-view'),
    onOpenFile: (path) => fileService?.openFileByPath(path),
    onNewDocument: (mode) => fileService?.newDocument(mode),
    onNewTemplate: (tpl) => fileService?.newFromTemplate(tpl),
    getCustomTemplates,
    onDeleteTemplate: async (id) => {
      await removeCustomTemplate(id);
      recentDocsView.render(getRecentDocuments());
    },
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
      if (saveTemplateBtnEl) saveTemplateBtnEl.disabled = !hasOpenDocument;
      if (duplicateBtnEl) duplicateBtnEl.disabled = !hasOpenDocument;
      if (renameBtnEl) renameBtnEl.disabled = !hasOpenDocument;
      const hasSavedFile = Boolean(hasOpenDocument && fileService?.hasFilePath?.());
      if (revertBtnEl) revertBtnEl.disabled = !hasSavedFile;
      if (showFinderBtnEl) showFinderBtnEl.disabled = !hasSavedFile;
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
      syncAutoSaveStatus();
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
      const targetFormat = item.dataset.convertFormat;
      closeConvertMenu();
      if (targetFormat === 'pdf') {
        fileService.printDocument();
      } else {
        fileService.exportDocument(targetFormat);
      }
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

  duplicateBtnEl?.addEventListener('click', () => {
    closePillMenu();
    fileService.duplicateDocument();
  });

  revertBtnEl?.addEventListener('click', () => {
    closePillMenu();
    fileService.revertDocument();
  });

  showFinderBtnEl?.addEventListener('click', () => {
    closePillMenu();
    const path = fileService.getCurrentPath();
    if (path) invoke('show_in_explorer', { path }).catch(() => {});
  });

  // Rename Modal
  const renameBackdropEl = document.getElementById('rename-modal-backdrop');
  const renameModalEl = document.getElementById('rename-modal');
  const renameInputEl = document.getElementById('rename-input');
  const closeRenameModal = () => {
    renameModalEl?.classList.remove('is-open');
    renameBackdropEl?.classList.remove('is-open');
    renameModalEl?.setAttribute('aria-hidden', 'true');
    renameBackdropEl?.setAttribute('aria-hidden', 'true');
  };
  const openRenameModal = () => {
    if (!renameModalEl || !renameInputEl) return;
    renameInputEl.value = fileService.getCurrentFileName() || 'Untitled.docx';
    renameBackdropEl?.classList.add('is-open');
    renameModalEl.classList.add('is-open');
    renameModalEl.setAttribute('aria-hidden', 'false');
    renameBackdropEl?.setAttribute('aria-hidden', 'false');
    renameInputEl.focus();
    renameInputEl.select();
  };
  renameBtnEl?.addEventListener('click', () => {
    closePillMenu();
    openRenameModal();
  });
  document.getElementById('btn-close-rename')?.addEventListener('click', closeRenameModal);
  document.getElementById('btn-cancel-rename')?.addEventListener('click', closeRenameModal);
  renameBackdropEl?.addEventListener('click', closeRenameModal);
  document.getElementById('btn-confirm-rename')?.addEventListener('click', async () => {
    const ok = await fileService.renameDocument(renameInputEl?.value);
    if (ok) closeRenameModal();
  });
  renameInputEl?.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const ok = await fileService.renameDocument(renameInputEl.value);
      if (ok) closeRenameModal();
    } else if (event.key === 'Escape') {
      closeRenameModal();
    }
  });

  // Save as Template Modal
  const templateBackdropEl = document.getElementById('template-modal-backdrop');
  const templateModalEl = document.getElementById('template-modal');
  const templateNameInputEl = document.getElementById('template-name-input');
  const templateDescInputEl = document.getElementById('template-desc-input');
  const closeTemplateModal = () => {
    templateModalEl?.classList.remove('is-open');
    templateBackdropEl?.classList.remove('is-open');
    templateModalEl?.setAttribute('aria-hidden', 'true');
    templateBackdropEl?.setAttribute('aria-hidden', 'true');
  };
  const openTemplateModal = () => {
    if (!templateModalEl || !templateNameInputEl) return;
    const baseName = (fileService.getCurrentFileName() || 'My Template').replace(/\.[a-z0-9]+$/i, '');
    templateNameInputEl.value = baseName;
    if (templateDescInputEl) templateDescInputEl.value = '';
    templateBackdropEl?.classList.add('is-open');
    templateModalEl.classList.add('is-open');
    templateModalEl.setAttribute('aria-hidden', 'false');
    templateBackdropEl?.setAttribute('aria-hidden', 'false');
    templateNameInputEl.focus();
    templateNameInputEl.select();
  };
  saveTemplateBtnEl?.addEventListener('click', () => {
    closePillMenu();
    openTemplateModal();
  });
  document.getElementById('btn-close-template')?.addEventListener('click', closeTemplateModal);
  document.getElementById('btn-cancel-template')?.addEventListener('click', closeTemplateModal);
  templateBackdropEl?.addEventListener('click', closeTemplateModal);
  const saveCurrentAsTemplate = async () => {
    const title = templateNameInputEl?.value?.trim();
    if (!title) return;
    const desc = templateDescInputEl?.value?.trim() || '';
    const payload = fileService.getTemplatePayload();
    await addCustomTemplate({ title, desc, ...payload });
    recentDocsView.render(getRecentDocuments());
    closeTemplateModal();
  };
  document.getElementById('btn-confirm-template')?.addEventListener('click', saveCurrentAsTemplate);
  templateNameInputEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCurrentAsTemplate();
    } else if (event.key === 'Escape') {
      closeTemplateModal();
    }
  });
  templateDescInputEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveCurrentAsTemplate();
    } else if (event.key === 'Escape') {
      closeTemplateModal();
    }
  });

  // New from Template & Open Recent submenus in Pill Menu
  function renderTemplateSubmenu() {
    if (!templatePopoverEl) return;
    templatePopoverEl.innerHTML = '';
    const allTemplates = [...STARTER_TEMPLATES, ...getCustomTemplates()];
    allTemplates.forEach((tpl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'convert-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.textContent = tpl.title;
      btn.addEventListener('click', () => {
        templatePopoverEl.classList.remove('is-open');
        templateBtnEl?.setAttribute('aria-expanded', 'false');
        closePillMenu();
        fileService.newFromTemplate(tpl);
      });
      templatePopoverEl.appendChild(btn);
    });
  }

  function renderRecentSubmenu() {
    if (!recentPopoverEl) return;
    recentPopoverEl.innerHTML = '';
    const recents = getRecentDocuments().slice(0, 8);
    if (recents.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'convert-menu-empty';
      empty.textContent = 'No recent documents';
      recentPopoverEl.appendChild(empty);
      return;
    }
    recents.forEach((doc) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'convert-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.title = doc.path;
      btn.textContent = doc.name || doc.path;
      btn.addEventListener('click', () => {
        recentPopoverEl.classList.remove('is-open');
        recentBtnEl?.setAttribute('aria-expanded', 'false');
        closePillMenu();
        fileService.openFileByPath(doc.path);
      });
      recentPopoverEl.appendChild(btn);
    });
  }

  if (templateBtnEl && templatePopoverEl) {
    templateBtnEl.addEventListener('click', () => {
      renderTemplateSubmenu();
      const willOpen = !templatePopoverEl.classList.contains('is-open');
      recentPopoverEl?.classList.remove('is-open');
      recentBtnEl?.setAttribute('aria-expanded', 'false');
      convertPopoverEl?.classList.remove('is-open');
      convertBtnEl?.setAttribute('aria-expanded', 'false');
      templatePopoverEl.classList.toggle('is-open', willOpen);
      templateBtnEl.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('mousedown', (event) => {
      if (templateWrapEl && !templateWrapEl.contains(event.target)) {
        templatePopoverEl.classList.remove('is-open');
        templateBtnEl.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (recentBtnEl && recentPopoverEl) {
    recentBtnEl.addEventListener('click', () => {
      renderRecentSubmenu();
      const willOpen = !recentPopoverEl.classList.contains('is-open');
      templatePopoverEl?.classList.remove('is-open');
      templateBtnEl?.setAttribute('aria-expanded', 'false');
      convertPopoverEl?.classList.remove('is-open');
      convertBtnEl?.setAttribute('aria-expanded', 'false');
      recentPopoverEl.classList.toggle('is-open', willOpen);
      recentBtnEl.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('mousedown', (event) => {
      if (recentWrapEl && !recentWrapEl.contains(event.target)) {
        recentPopoverEl.classList.remove('is-open');
        recentBtnEl.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const pillMenuWrapEl = document.getElementById('doc-pill-menu-wrap');
  const pillTriggerEl = document.getElementById('doc-pill-trigger');
  const pillMenuEl = document.getElementById('doc-pill-menu');

  const closePillMenu = () => {
    pillMenuEl?.classList.remove('is-open');
    pillTriggerEl?.setAttribute('aria-expanded', 'false');
    templatePopoverEl?.classList.remove('is-open');
    templateBtnEl?.setAttribute('aria-expanded', 'false');
    recentPopoverEl?.classList.remove('is-open');
    recentBtnEl?.setAttribute('aria-expanded', 'false');
    convertPopoverEl?.classList.remove('is-open');
    convertBtnEl?.setAttribute('aria-expanded', 'false');
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
    if (
      !btn ||
      btn.id === 'btn-convert' ||
      btn.id === 'btn-new-template' ||
      btn.id === 'btn-open-recent'
    ) {
      return;
    }
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
    } else if (key === 'f' && event.shiftKey) {
      event.preventDefault();
      toggleFocusMode();
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
      if (event.altKey) {
        const BLOCK_SHORTCUTS = {
          Digit0: 'P',
          Digit1: 'H1',
          Digit2: 'H2',
          Digit3: 'H3',
        };
        const blockTag = BLOCK_SHORTCUTS[event.code];
        if (blockTag) {
          event.preventDefault();
          editor.execBlockCommand(blockTag);
          return;
        }
      }
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

  const focusModeBtnEl = document.getElementById('btn-focus-mode');
  let focusMode = false;

  function toggleFocusMode(forceState) {
    focusMode = typeof forceState === 'boolean' ? forceState : !focusMode;
    appShellEl?.setAttribute('data-focus-mode', String(focusMode));
    if (focusModeBtnEl) {
      focusModeBtnEl.classList.toggle('is-active', focusMode);
      focusModeBtnEl.setAttribute('aria-pressed', String(focusMode));
    }
  }

  focusModeBtnEl?.addEventListener('click', () => toggleFocusMode());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focusMode) {
      toggleFocusMode(false);
    }
  });

  const draftBannerEl = document.getElementById('draft-recovery-banner');
  const restoreDraftBtnEl = document.getElementById('btn-restore-draft');
  const dismissDraftBtnEl = document.getElementById('btn-dismiss-draft');
  const existingDraft = fileService.getRecoveryDraft();
  if (existingDraft && draftBannerEl) {
    draftBannerEl.classList.remove('is-hidden');
    restoreDraftBtnEl?.addEventListener('click', async () => {
      await fileService.restoreRecoveryDraft();
      draftBannerEl.classList.add('is-hidden');
    });
    dismissDraftBtnEl?.addEventListener('click', () => {
      fileService.clearRecoveryDraft();
      draftBannerEl.classList.add('is-hidden');
    });
  }

  const whatsNewModalEl = document.getElementById('whats-new-modal');
  const whatsNewBackdropEl = document.getElementById('whats-new-modal-backdrop');
  const whatsNewBadgeEl = document.getElementById('whats-new-version-badge');
  let appVersion = '0.2.0';
  try {
    const resolvedVer = await getVersion();
    if (resolvedVer) appVersion = resolvedVer;
  } catch {
    // Fallback outside Tauri
  }
  if (whatsNewBadgeEl) {
    whatsNewBadgeEl.textContent = `v${appVersion}`;
  }

  function setWhatsNewOpen(isOpen) {
    if (!whatsNewModalEl) return;
    whatsNewModalEl.classList.toggle('is-open', isOpen);
    whatsNewBackdropEl?.classList.toggle('is-open', isOpen);
    whatsNewModalEl.setAttribute('aria-hidden', String(!isOpen));
    whatsNewBackdropEl?.setAttribute('aria-hidden', String(!isOpen));
    if (!isOpen && initialSettings.lastSeenVersion !== appVersion) {
      initialSettings.lastSeenVersion = appVersion;
      saveSettings({ lastSeenVersion: appVersion });
    }
  }

  document.getElementById('btn-whats-new')?.addEventListener('click', () => setWhatsNewOpen(true));
  document.getElementById('btn-close-whats-new')?.addEventListener('click', () => setWhatsNewOpen(false));
  document.getElementById('btn-done-whats-new')?.addEventListener('click', () => setWhatsNewOpen(false));
  whatsNewBackdropEl?.addEventListener('click', () => setWhatsNewOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && whatsNewModalEl?.classList.contains('is-open')) {
      setWhatsNewOpen(false);
    }
  });

  if (initialSettings.lastSeenVersion !== appVersion) {
    setWhatsNewOpen(true);
  }

  statusBar.updateMode(editor.getMode());
  statusBar.updateStats(editor.getStats());
}

document.addEventListener('DOMContentLoaded', initApp);
