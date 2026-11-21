import { getVersion } from '@tauri-apps/api/app';
import { initNotesModal } from './notesModal.js';
import { initDictionaryModal } from './dictionaryModal.js';
import { saveSettings } from './settingsStore.js';

export function createSettingsDrawer({
  getStartIn,
  getDefaultFont,
  getDefaultFontSize,
  getDefaultLineSpacing,
  getDefaultPageMargins,
  getDefaultZoom,
  getDefaultMode,
  getPageSize,
  getPageOrientation,
  getMeasurementUnit,
  getTabsEnabled,
  getTheme,
  getSpellcheckEnabled,
  getGrammarEnabled,
  getAutoSaveInterval,
  onStartInChange,
  onDefaultFontChange,
  onDefaultSizeChange,
  onDefaultLineSpacingChange,
  onDefaultPageMarginsChange,
  onDefaultZoomChange,
  onDefaultModeChange,
  onPageSizeChange,
  onPageOrientationChange,
  onMeasurementUnitChange,
  onTabsEnabledChange,
  onThemeChange,
  onSpellcheckEnabledChange,
  onGrammarEnabledChange,
  onAutoSaveIntervalChange,
  onClearRecentDocuments,
  onResetWorkspaceLayout,
  onDictionaryChange,
} = {}) {
  const triggerEl = document.getElementById('btn-settings');
  const closeEl = document.getElementById('btn-close-settings');
  const cancelEl = document.getElementById('btn-cancel-settings');
  const saveEl = document.getElementById('btn-save-settings');
  const drawerEl = document.getElementById('settings-drawer');
  const backdropEl = document.getElementById('settings-backdrop');
  const startInSelectEl = document.getElementById('settings-start-in');
  const fontSelectEl = document.getElementById('settings-default-font');
  const sizeSelectEl = document.getElementById('settings-default-size');
  const lineSpacingSelectEl = document.getElementById('settings-default-line-spacing');
  const marginsSelectEl = document.getElementById('settings-default-margins');
  const defaultZoomSelectEl = document.getElementById('settings-default-zoom');
  const modeSelectEl = document.getElementById('settings-default-mode');
  const pageSizeSelectEl = document.getElementById('settings-page-size');
  const pageOrientationSelectEl = document.getElementById('settings-page-orientation');
  const unitSelectEl = document.getElementById('settings-measurement-unit');
  const tabsEnabledEl = document.getElementById('settings-tabs-enabled');
  const themeSelectEl = document.getElementById('settings-theme');
  const spellcheckEl = document.getElementById('settings-spellcheck-enabled');
  const grammarEl = document.getElementById('settings-grammar-enabled');
  const autoSaveSelectEl = document.getElementById('settings-autosave');
  const clearRecentBtnEl = document.getElementById('btn-settings-clear-recent');
  const clearRecentStatusEl = document.getElementById('settings-clear-recent-status');
  const resetLayoutBtnEl = document.getElementById('btn-settings-reset-layout');
  const resetLayoutStatusEl = document.getElementById('settings-reset-layout-status');
  const versionEl = document.getElementById('settings-version');

  initNotesModal();
  initDictionaryModal({ onDictionaryChange });

  function flashInlineStatus(el, text) {
    if (!el) return;
    el.textContent = text;
    window.setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 2200);
  }

  if (versionEl) {
    getVersion()
      .then((ver) => {
        if (ver) versionEl.textContent = `v${ver}`;
      })
      .catch(() => {});
  }

  function syncValues() {
    if (startInSelectEl && getStartIn) {
      const val = getStartIn();
      if (val) startInSelectEl.value = val;
    }
    if (fontSelectEl && getDefaultFont) {
      const val = getDefaultFont();
      if (val) fontSelectEl.value = val;
    }
    if (sizeSelectEl && getDefaultFontSize) {
      const val = getDefaultFontSize();
      if (val) sizeSelectEl.value = val;
    }
    if (lineSpacingSelectEl && getDefaultLineSpacing) {
      const val = getDefaultLineSpacing();
      if (val) lineSpacingSelectEl.value = String(val);
    }
    if (marginsSelectEl && getDefaultPageMargins) {
      const val = getDefaultPageMargins();
      if (val) marginsSelectEl.value = String(val);
    }
    if (defaultZoomSelectEl && getDefaultZoom) {
      const val = getDefaultZoom();
      if (val) defaultZoomSelectEl.value = String(val);
    }
    if (modeSelectEl && getDefaultMode) {
      const val = getDefaultMode();
      if (val) modeSelectEl.value = val;
    }
    if (pageSizeSelectEl && getPageSize) {
      const val = getPageSize();
      if (val) pageSizeSelectEl.value = val;
    }
    if (pageOrientationSelectEl && getPageOrientation) {
      const val = getPageOrientation();
      if (val) pageOrientationSelectEl.value = val;
    }
    if (unitSelectEl && getMeasurementUnit) {
      const val = getMeasurementUnit();
      if (val) unitSelectEl.value = val;
    }
    if (tabsEnabledEl && getTabsEnabled) {
      tabsEnabledEl.checked = Boolean(getTabsEnabled());
    }
    if (themeSelectEl && getTheme) {
      const val = getTheme();
      if (val) themeSelectEl.value = val;
    }
    if (spellcheckEl && getSpellcheckEnabled) {
      spellcheckEl.checked = Boolean(getSpellcheckEnabled());
    }
    if (grammarEl && getGrammarEnabled) {
      grammarEl.checked = Boolean(getGrammarEnabled());
    }
    if (autoSaveSelectEl && getAutoSaveInterval) {
      const val = getAutoSaveInterval();
      autoSaveSelectEl.value = String(val ?? 0);
    }
  }

  function setAvailableFonts(fonts) {
    if (!fontSelectEl || !Array.isArray(fonts)) return;
    fontSelectEl.innerHTML = '';
    fonts.forEach((fontName) => {
      const option = document.createElement('option');
      option.value = fontName;
      option.textContent = fontName;
      option.style.fontFamily = `"${fontName}", sans-serif`;
      fontSelectEl.appendChild(option);
    });
    syncValues();
  }

  function setOpen(isOpen) {
    if (!drawerEl || !backdropEl) return;
    if (isOpen) syncValues();
    drawerEl.classList.toggle('is-open', isOpen);
    backdropEl.classList.toggle('is-open', isOpen);
    drawerEl.setAttribute('aria-hidden', String(!isOpen));
    backdropEl.setAttribute('aria-hidden', String(!isOpen));
    if (triggerEl) {
      triggerEl.setAttribute('aria-expanded', String(isOpen));
    }
  }

  async function commitSettings() {
    const patch = {};
    if (startInSelectEl) patch.startIn = startInSelectEl.value;
    if (fontSelectEl) patch.defaultFont = fontSelectEl.value;
    if (sizeSelectEl) patch.defaultFontSize = sizeSelectEl.value;
    if (lineSpacingSelectEl) patch.defaultLineSpacing = lineSpacingSelectEl.value;
    if (marginsSelectEl) patch.defaultPageMargins = marginsSelectEl.value;
    if (defaultZoomSelectEl) patch.defaultZoom = Number(defaultZoomSelectEl.value) || 100;
    if (modeSelectEl) patch.defaultMode = modeSelectEl.value;
    if (pageSizeSelectEl) patch.pageSize = pageSizeSelectEl.value;
    if (pageOrientationSelectEl) patch.pageOrientation = pageOrientationSelectEl.value;
    if (unitSelectEl) patch.measurementUnit = unitSelectEl.value;
    if (tabsEnabledEl) patch.tabsEnabled = tabsEnabledEl.checked;
    if (themeSelectEl) patch.theme = themeSelectEl.value;
    if (spellcheckEl) patch.spellcheckEnabled = spellcheckEl.checked;
    if (grammarEl) patch.grammarEnabled = grammarEl.checked;
    if (autoSaveSelectEl) patch.autoSaveInterval = Number(autoSaveSelectEl.value) || 0;

    await saveSettings(patch);

    if (patch.startIn) onStartInChange?.(patch.startIn);
    if (patch.defaultFont) onDefaultFontChange?.(patch.defaultFont);
    if (patch.defaultFontSize) onDefaultSizeChange?.(patch.defaultFontSize);
    if (patch.defaultLineSpacing) onDefaultLineSpacingChange?.(patch.defaultLineSpacing);
    if (patch.defaultPageMargins) onDefaultPageMarginsChange?.(patch.defaultPageMargins);
    if (patch.defaultZoom) onDefaultZoomChange?.(patch.defaultZoom);
    if (patch.defaultMode) onDefaultModeChange?.(patch.defaultMode);
    if (patch.pageSize) onPageSizeChange?.(patch.pageSize);
    if (patch.pageOrientation) onPageOrientationChange?.(patch.pageOrientation);
    if (patch.measurementUnit) onMeasurementUnitChange?.(patch.measurementUnit);
    if (typeof patch.tabsEnabled === 'boolean') onTabsEnabledChange?.(patch.tabsEnabled);
    if (patch.theme) onThemeChange?.(patch.theme);
    if (typeof patch.spellcheckEnabled === 'boolean') {
      onSpellcheckEnabledChange?.(patch.spellcheckEnabled);
    }
    if (typeof patch.grammarEnabled === 'boolean') {
      onGrammarEnabledChange?.(patch.grammarEnabled);
    }
    if (typeof patch.autoSaveInterval === 'number') {
      onAutoSaveIntervalChange?.(patch.autoSaveInterval);
    }

    setOpen(false);
  }

  clearRecentBtnEl?.addEventListener('click', async () => {
    await onClearRecentDocuments?.();
    flashInlineStatus(clearRecentStatusEl, 'Cleared');
  });

  resetLayoutBtnEl?.addEventListener('click', () => {
    onResetWorkspaceLayout?.();
    flashInlineStatus(resetLayoutStatusEl, 'Reset');
  });

  if (saveEl) {
    saveEl.addEventListener('click', () => {
      commitSettings();
    });
  }

  if (cancelEl) {
    cancelEl.addEventListener('click', () => setOpen(false));
  }

  if (triggerEl) {
    triggerEl.addEventListener('click', () => {
      const next = !drawerEl?.classList.contains('is-open');
      setOpen(next);
    });
  }

  if (closeEl) {
    closeEl.addEventListener('click', () => setOpen(false));
  }

  if (backdropEl) {
    backdropEl.addEventListener('click', () => setOpen(false));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerEl?.classList.contains('is-open')) {
      setOpen(false);
    }
  });

  syncValues();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    setAvailableFonts,
  };
}
